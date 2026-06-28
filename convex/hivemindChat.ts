import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { moduleDraft } from "./schema";

/* ──────────────────────────────────────────────────────────────────────────
 * The Hivemind chat: a conversational agent over the whole training dataset.
 * This module owns the thread persistence + the rich data layer the AI reasons
 * over (scores, transcripts, talk analytics, rubric breakdowns, objective hits,
 * coaching moments). The agentic loop itself lives in ai.hivemindRespond.
 * ────────────────────────────────────────────────────────────────────────── */

const refValidator = v.object({
  kind: v.union(v.literal("rep"), v.literal("module"), v.literal("attempt")),
  id: v.string(),
  label: v.string(),
  reason: v.optional(v.string()),
});

const draftValidator = v.object({
  module: moduleDraft,
  repId: v.optional(v.id("users")),
  repName: v.optional(v.string()),
  createdModuleId: v.optional(v.id("modules")),
});

function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

/* ── Thread persistence ───────────────────────────────────────────────────── */

/** The user's current (most-recent) Hivemind conversation, or null if none yet. */
export const activeThread = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const thread = await ctx.db
      .query("hivemindThreads")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .first();
    if (!thread) return null;
    return { _id: thread._id, scope: thread.scope, messages: thread.messages, lastAt: thread.lastAt };
  },
});

/** Start a fresh conversation (also used by "New chat"). Returns the thread id. */
export const startThread = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"hivemindThreads">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const me = await ctx.db.get(userId);
    const scope = me?.role === "manager" ? ("team" as const) : ("personal" as const);
    return await ctx.db.insert("hivemindThreads", { ownerId: userId, scope, messages: [], lastAt: Date.now() });
  },
});

/** Internal: append a message to a thread (used by the agent loop). */
export const appendMessage = internalMutation({
  args: {
    threadId: v.id("hivemindThreads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    refs: v.optional(v.array(refValidator)),
    draft: v.optional(draftValidator),
  },
  handler: async (ctx, { threadId, role, content, refs, draft }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) throw new Error("Thread not found");
    const at = Date.now();
    await ctx.db.patch(threadId, {
      messages: [...thread.messages, { role, content, at, refs, draft }],
      lastAt: at,
    });
  },
});

/** Internal: read a thread (the agent loads prior turns for context). */
export const getThreadInternal = internalQuery({
  args: { threadId: v.id("hivemindThreads") },
  handler: async (ctx, { threadId }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread) return null;
    return { ownerId: thread.ownerId, scope: thread.scope, messages: thread.messages };
  },
});

/**
 * Approve a drafted course: turn the draft card on a message into a real module.
 * Team scope → an editable DRAFT targeted at one rep (publishing assigns to them).
 * Personal scope → a published personal drill the rep can practice immediately.
 */
export const materializeDraft = mutation({
  args: { threadId: v.id("hivemindThreads"), messageIndex: v.number() },
  handler: async (
    ctx,
    { threadId, messageIndex },
  ): Promise<{ moduleId: Id<"modules">; scope: "team" | "personal" }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.ownerId !== userId) throw new Error("Thread not found");
    const msg = thread.messages[messageIndex];
    if (!msg?.draft) throw new Error("No draft on that message");
    if (msg.draft.createdModuleId) return { moduleId: msg.draft.createdModuleId, scope: thread.scope };

    const me = await ctx.db.get(userId);
    const d = msg.draft.module;
    const base = {
      orgId: me?.orgId,
      title: d.title,
      description: d.description,
      goal: d.goal,
      scenario: d.scenario,
      objectives: d.objectives,
      rubric: d.rubric,
      rubricApproved: true as const,
      passThreshold: 70,
    };

    let moduleId: Id<"modules">;
    if (thread.scope === "personal") {
      // A private drill the rep owns and can run right away.
      moduleId = await ctx.db.insert("modules", {
        ...base,
        createdBy: userId,
        ownerRepId: userId,
        kind: "personal",
        status: "published",
        publishedAt: Date.now(),
      });
    } else {
      // A manager-owned module aimed at one rep, left as a draft to review/publish.
      moduleId = await ctx.db.insert("modules", {
        ...base,
        createdBy: userId,
        ownerRepId: msg.draft.repId,
        kind: "team",
        status: "draft",
      });
    }

    const messages = thread.messages.map((m, i) =>
      i === messageIndex && m.draft ? { ...m, draft: { ...m.draft, createdModuleId: moduleId } } : m,
    );
    await ctx.db.patch(threadId, { messages });
    return { moduleId, scope: thread.scope };
  },
});

/* ── The data layer the agent reasons over ────────────────────────────────── */

type RepRow = {
  id: string;
  name: string;
  title: string | null;
  attempts: number;
  avgScore: number | null;
  bestScore: number | null;
  passRate: number | null;
  wpm: number | null;
  talkRatio: number | null;
  fillerAvg: number | null;
  questionsAvg: number | null;
  lastActiveAt: number | null;
  weakObjectives: { objective: string; hitRate: number }[];
};

function summarizeAttempts(attempts: Doc<"attempts">[]) {
  const graded = attempts.filter((a) => typeof a.score === "number");
  const scores = graded.map((a) => a.score as number);
  const an = graded.map((a) => a.analytics).filter((x): x is NonNullable<typeof x> => !!x);
  const objAgg = new Map<string, { met: number; total: number }>();
  for (const a of graded) {
    for (const h of a.objectiveHits ?? []) {
      const cur = objAgg.get(h.objective) ?? { met: 0, total: 0 };
      cur.total += 1;
      if (h.met) cur.met += 1;
      objAgg.set(h.objective, cur);
    }
  }
  const weakObjectives = [...objAgg.entries()]
    .map(([objective, v]) => ({ objective, hitRate: v.total ? Math.round((v.met / v.total) * 100) : 0 }))
    .sort((a, b) => a.hitRate - b.hitRate)
    .slice(0, 4);
  return {
    attempts: graded.length,
    avgScore: scores.length ? avg(scores) : null,
    bestScore: scores.length ? Math.max(...scores) : null,
    passRate: graded.length ? Math.round((graded.filter((a) => a.passed).length / graded.length) * 100) : null,
    wpm: an.length ? avg(an.map((x) => x.wordsPerMin)) : null,
    talkRatio: an.length ? avg(an.map((x) => x.talkRatio)) : null,
    fillerAvg: an.length ? avg(an.map((x) => x.fillerCount)) : null,
    questionsAvg: an.length ? avg(an.map((x) => x.questionsAsked)) : null,
    lastActiveAt: graded.length ? Math.max(...graded.map((a) => a.endedAt ?? a.startedAt)) : null,
    weakObjectives,
  };
}

/**
 * Compact, always-in-context snapshot the agent starts from: who's on the team,
 * how each rep is doing (scores + talk analytics + weak spots), the modules, and
 * the org-wide objective hit-rates. Tools deepen from here.
 */
export const chatContext = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }) => {
    const me = await ctx.db.get(ownerId);
    if (!me) return null;
    const isManager = me.role === "manager";

    // Reps in scope.
    const reps = isManager
      ? me.orgId
        ? (await ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", me.orgId)).collect()).filter(
            (u) => u.role === "rep",
          )
        : []
      : [me];

    const repRows: RepRow[] = await Promise.all(
      reps.map(async (r) => {
        const attempts = (
          await ctx.db.query("attempts").withIndex("by_rep", (q) => q.eq("repId", r._id)).collect()
        ).filter((a) => a.visibility !== "private" || r._id === ownerId);
        const s = summarizeAttempts(attempts);
        return {
          id: r._id as string,
          name: r.name ?? r.email ?? "Rep",
          title: r.title ?? null,
          ...s,
        };
      }),
    );
    repRows.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));

    // Modules in scope (manager = own; rep = assigned/practiced).
    const modules = isManager
      ? await ctx.db.query("modules").withIndex("by_creator", (q) => q.eq("createdBy", ownerId)).collect()
      : [];
    const modRows = modules.map((m) => ({
      id: m._id as string,
      title: m.title,
      status: m.status,
      difficulty: m.scenario.difficulty,
      objectives: m.objectives,
    }));

    // Org-wide objective hit-rates ("synapses").
    const allAttempts = isManager
      ? await ctx.db.query("attempts").withIndex("by_manager", (q) => q.eq("managerId", ownerId)).collect()
      : (await ctx.db.query("attempts").withIndex("by_rep", (q) => q.eq("repId", ownerId)).collect());
    const objAgg = new Map<string, { met: number; total: number }>();
    for (const a of allAttempts) {
      if (typeof a.score !== "number") continue;
      for (const h of a.objectiveHits ?? []) {
        const cur = objAgg.get(h.objective) ?? { met: 0, total: 0 };
        cur.total += 1;
        if (h.met) cur.met += 1;
        objAgg.set(h.objective, cur);
      }
    }
    const synapses = [...objAgg.entries()]
      .map(([objective, v]) => ({ objective, hitRate: v.total ? Math.round((v.met / v.total) * 100) : 0, samples: v.total }))
      .sort((a, b) => a.hitRate - b.hitRate)
      .slice(0, 10);

    return {
      scope: isManager ? ("team" as const) : ("personal" as const),
      viewer: { id: ownerId as string, name: me.name ?? "there", role: me.role ?? "rep" },
      team: me.company ?? null,
      reps: repRows,
      modules: modRows,
      synapses,
    };
  },
});

/** Resolve a rep reference (name or id) within the viewer's scope → rep id + name. */
export const resolveRep = internalQuery({
  args: { ownerId: v.id("users"), ref: v.string() },
  handler: async (ctx, { ownerId, ref }) => {
    const me = await ctx.db.get(ownerId);
    if (!me) return null;
    if (me.role !== "manager") return { id: ownerId as string, name: me.name ?? "You" };
    if (!me.orgId) return null;
    const reps = (await ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", me.orgId)).collect()).filter(
      (u) => u.role === "rep",
    );
    const needle = ref.trim().toLowerCase();
    const byId = reps.find((r) => (r._id as string) === ref);
    if (byId) return { id: byId._id as string, name: byId.name ?? byId.email ?? "Rep" };
    const byName =
      reps.find((r) => (r.name ?? "").toLowerCase() === needle) ??
      reps.find((r) => (r.name ?? "").toLowerCase().includes(needle)) ??
      reps.find((r) => (r.email ?? "").toLowerCase().includes(needle));
    return byName ? { id: byName._id as string, name: byName.name ?? byName.email ?? "Rep" } : null;
  },
});

/**
 * Deep dossier for one rep: every team-visible attempt with its score, verdict,
 * coaching fixes, full talk analytics, rubric breakdown, objective hits, the
 * tagged key moments, and a transcript excerpt. This is the "everything" the
 * agent uses to coach and to draft personalized courses.
 */
export const repDossier = internalQuery({
  args: { ownerId: v.id("users"), repId: v.id("users") },
  handler: async (ctx, { ownerId, repId }) => {
    const owner = await ctx.db.get(ownerId);
    if (!owner) return null;
    // Reps may only inspect themselves; managers may inspect their org's reps.
    if (owner.role !== "manager" && repId !== ownerId) return null;
    const rep = await ctx.db.get(repId);
    if (!rep) return null;
    if (owner.role === "manager" && rep.orgId !== owner.orgId) return null;

    const all = (
      await ctx.db.query("attempts").withIndex("by_rep", (q) => q.eq("repId", repId)).order("desc").collect()
    ).filter((a) => a.visibility !== "private" || repId === ownerId);

    const s = summarizeAttempts(all);
    const moduleCache = new Map<string, Doc<"modules"> | null>();
    const getModule = async (id: Id<"modules">) => {
      const k = id as string;
      if (!moduleCache.has(k)) moduleCache.set(k, await ctx.db.get(id));
      return moduleCache.get(k) ?? null;
    };

    const attempts = await Promise.all(
      all.slice(0, 14).map(async (a) => {
        const mod = await getModule(a.moduleId);
        return {
          attemptId: a._id as string,
          module: mod?.title ?? "Module",
          difficulty: mod?.scenario.difficulty ?? null,
          at: a.endedAt ?? a.startedAt,
          score: a.score ?? null,
          passed: a.passed ?? null,
          verdict: a.verdict?.line ?? null,
          fixes: a.fixes ?? [],
          analytics: a.analytics ?? null,
          rubricScores: (a.rubricScores ?? []).map((r) => ({ name: r.name, score: r.score, weight: r.weight })),
          objectiveHits: (a.objectiveHits ?? []).map((h) => ({ objective: h.objective, met: h.met })),
          moments: (a.moments ?? []).map((m) => ({ label: m.label, tone: m.tone, line: m.line })),
          coachNote: a.coachNote ?? null,
          transcriptExcerpt: a.callTranscript ? a.callTranscript.slice(0, 1200) : null,
          hasFullTranscript: !!a.callTranscript,
        };
      }),
    );

    return {
      rep: { id: rep._id as string, name: rep.name ?? rep.email ?? "Rep", title: rep.title ?? null, job: rep.job ?? null },
      stats: s,
      attempts,
    };
  },
});

/** The full transcript of one attempt (the agent reads it on demand). */
export const transcriptOf = internalQuery({
  args: { ownerId: v.id("users"), attemptId: v.id("attempts") },
  handler: async (ctx, { ownerId, attemptId }) => {
    const owner = await ctx.db.get(ownerId);
    if (!owner) return null;
    const a = await ctx.db.get(attemptId);
    if (!a) return null;
    const allowed = owner.role === "manager" ? a.managerId === ownerId : a.repId === ownerId;
    if (!allowed) return null;
    const rep = await ctx.db.get(a.repId);
    const mod = await ctx.db.get(a.moduleId);
    return {
      rep: rep?.name ?? "Rep",
      module: mod?.title ?? "Module",
      score: a.score ?? null,
      transcript: a.callTranscript ? a.callTranscript.slice(0, 6000) : null,
    };
  },
});
