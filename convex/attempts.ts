import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/** Rep starts a practice attempt for a module. `visibility:"private"` hides it from the manager. */
export const start = mutation({
  args: {
    moduleId: v.id("modules"),
    visibility: v.optional(v.union(v.literal("team"), v.literal("private"))),
  },
  handler: async (ctx, { moduleId, visibility }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const mod = await ctx.db.get(moduleId);
    if (!mod) throw new Error("Module not found");

    // Personal drills are always private.
    const vis = mod.kind === "personal" ? "private" : (visibility ?? "team");

    const attemptId = await ctx.db.insert("attempts", {
      moduleId,
      repId: userId,
      managerId: mod.createdBy,
      status: "active",
      visibility: vis,
      startedAt: Date.now(),
    });

    // Only team practice updates the manager-visible assignment.
    if (vis === "team") {
      const a = await ctx.db
        .query("assignments")
        .withIndex("by_rep_module", (q) => q.eq("repId", userId).eq("moduleId", moduleId))
        .first();
      if (a && a.status === "assigned") await ctx.db.patch(a._id, { status: "in_progress" });
    }

    return attemptId;
  },
});

export const linkCall = mutation({
  args: { attemptId: v.id("attempts"), elevenLabsCallId: v.string() },
  handler: async (ctx, { attemptId, elevenLabsCallId }) => {
    await ctx.db.patch(attemptId, { elevenLabsCallId });
  },
});

export const get = query({
  args: { attemptId: v.id("attempts") },
  handler: async (ctx, { attemptId }) => {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt) return null;
    const module = await ctx.db.get(attempt.moduleId);
    // Returns the whole attempt doc (incl. coachNote/coachNoteAt) + module.
    return { ...attempt, module };
  },
});

/**
 * Manager leaves (or clears) a coaching note on a rep's attempt.
 * Only a manager in the SAME ORG as the attempt's rep may set it.
 * An empty/whitespace note clears the note (sets both fields to undefined).
 */
export const setCoachNote = mutation({
  args: { attemptId: v.id("attempts"), note: v.string() },
  handler: async (ctx, { attemptId, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const me = await ctx.db.get(userId);
    if (!me || me.role !== "manager") throw new Error("Only managers can leave coaching notes");

    const attempt = await ctx.db.get(attemptId);
    if (!attempt) throw new Error("Attempt not found");

    const rep = await ctx.db.get(attempt.repId);
    if (!rep || !me.orgId || rep.orgId !== me.orgId) throw new Error("Not allowed");

    const trimmed = note.trim();
    if (trimmed) {
      await ctx.db.patch(attemptId, { coachNote: trimmed, coachNoteAt: Date.now() });
    } else {
      await ctx.db.patch(attemptId, { coachNote: undefined, coachNoteAt: undefined });
    }
  },
});

/** A rep's attempt history for a module. */
export const listForModule = query({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("attempts")
      .withIndex("by_rep_module", (q) => q.eq("repId", userId).eq("moduleId", moduleId))
      .order("desc")
      .collect();
  },
});

/**
 * Call history for the History tab: every call in scope, newest first, with a
 * short transcript preview. Managers see the whole team; reps see their own
 * calls (including private practice). The full transcript is loaded lazily via
 * `attempts.get` when a call is opened.
 */
export const history = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const me = await ctx.db.get(userId);
    if (!me) return [];
    const isManager = me.role === "manager";

    const raw = isManager
      ? await ctx.db
          .query("attempts")
          .withIndex("by_manager", (q) => q.eq("managerId", userId))
          .order("desc")
          .take(120)
      : await ctx.db
          .query("attempts")
          .withIndex("by_rep", (q) => q.eq("repId", userId))
          .order("desc")
          .take(120);

    // Hide abandoned calls: a practice call doesn't run for 30 minutes, so a
    // still-"active"/"scoring" attempt older than that was never finished.
    const STALE_MS = 30 * 60 * 1000;
    const attempts = raw
      .filter((a) => a.status === "done" || Date.now() - a.startedAt < STALE_MS)
      .slice(0, 100);

    return await Promise.all(
      attempts.map(async (a) => {
        const mod = await ctx.db.get(a.moduleId);
        const rep = isManager ? await ctx.db.get(a.repId) : null;
        const transcript = a.callTranscript ?? "";
        const firstLine =
          transcript
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.length > 0) ?? "";
        const preview = firstLine.replace(/^[^:]{1,24}:\s*/, "").slice(0, 140);
        const turnCount = transcript.split("\n").filter((l) => l.trim().length > 0).length;
        return {
          attemptId: a._id,
          repName: rep?.name ?? rep?.email ?? (isManager ? "Rep" : (me.name ?? me.email ?? "You")),
          moduleTitle: mod?.title ?? "Practice call",
          buyerName: mod?.scenario.buyerName ?? "Buyer",
          difficulty: mod?.scenario.difficulty ?? "medium",
          status: a.status,
          visibility: a.visibility ?? "team",
          score: a.score ?? null,
          passed: a.passed ?? null,
          verdictLine: a.verdict?.line ?? null,
          at: a.startedAt,
          durationSec:
            a.endedAt && a.startedAt ? Math.max(1, Math.round((a.endedAt - a.startedAt) / 1000)) : null,
          hasTranscript: transcript.trim().length > 0,
          turnCount,
          preview,
        };
      }),
    );
  },
});

/** Client fallback (no public webhook locally): grade on hang-up. */
export const finishWithTranscript = mutation({
  args: { attemptId: v.id("attempts"), callTranscript: v.string() },
  handler: async (ctx, { attemptId, callTranscript }) => {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt || attempt.status !== "active") return;
    await ctx.db.patch(attemptId, { status: "scoring", endedAt: Date.now(), callTranscript });
    await ctx.scheduler.runAfter(0, internal.ai.gradeAttempt, { attemptId });
  },
});

/** Webhook path: match attempt by ElevenLabs conversation id. */
export const attachTranscriptByCallId = internalMutation({
  args: { elevenLabsCallId: v.optional(v.string()), callTranscript: v.string() },
  handler: async (ctx, { elevenLabsCallId, callTranscript }) => {
    let attempt = null;
    if (elevenLabsCallId) {
      attempt = await ctx.db
        .query("attempts")
        .withIndex("by_elevenlabs_call", (q) => q.eq("elevenLabsCallId", elevenLabsCallId))
        .unique()
        .catch(() => null);
    }
    if (!attempt) {
      attempt = await ctx.db
        .query("attempts")
        .filter((q) => q.eq(q.field("status"), "active"))
        .order("desc")
        .first();
    }
    if (!attempt || attempt.status === "done") return;
    await ctx.db.patch(attempt._id, { status: "scoring", endedAt: Date.now(), callTranscript });
    await ctx.scheduler.runAfter(0, internal.ai.gradeAttempt, { attemptId: attempt._id });
  },
});

export const getInternal = internalQuery({
  args: { attemptId: v.id("attempts") },
  handler: async (ctx, { attemptId }) => {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt) return null;
    const module = await ctx.db.get(attempt.moduleId);
    return { attempt, module };
  },
});

export const saveGrade = internalMutation({
  args: {
    attemptId: v.id("attempts"),
    score: v.number(),
    passed: v.boolean(),
    verdict: v.object({ decision: v.union(v.literal("pass"), v.literal("fail")), line: v.string() }),
    fixes: v.array(v.string()),
    objectiveHits: v.array(v.object({ objective: v.string(), met: v.boolean(), note: v.string() })),
    rubricScores: v.array(v.object({ name: v.string(), weight: v.number(), score: v.number(), note: v.string() })),
    analytics: v.object({
      talkRatio: v.number(),
      fillerCount: v.number(),
      wordsPerMin: v.number(),
      questionsAsked: v.number(),
      longestMonologueSec: v.number(),
    }),
    moments: v.array(
      v.object({
        timestamp: v.string(),
        label: v.string(),
        line: v.string(),
        tone: v.union(v.literal("good"), v.literal("bad"), v.literal("neutral")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { attemptId, ...rest } = args;
    await ctx.db.patch(attemptId, { ...rest, status: "done" });
    const attempt = await ctx.db.get(attemptId);
    if (attempt && attempt.visibility !== "private") {
      const a = await ctx.db
        .query("assignments")
        .withIndex("by_rep_module", (q) => q.eq("repId", attempt.repId).eq("moduleId", attempt.moduleId))
        .first();
      if (a) {
        const bestScore = Math.max(a.bestScore ?? 0, rest.score);
        const status = rest.passed || a.status === "passed" ? "passed" : "in_progress";
        await ctx.db.patch(a._id, { bestScore, status });
      }
    }
  },
});
