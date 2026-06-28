import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// The "agents" whose collective output forms the hivemind.
type AgentKey = "grader" | "buyer" | "coach" | "strategist";
type Tone = "good" | "bad" | "neutral";

type Thought = {
  id: string;
  agent: AgentKey;
  text: string;
  tone: Tone;
  at: number;
  meta: string | null; // small caption (module title / "Pattern" / etc.)
  link: { kind: "attempt" | "module"; id: string } | null;
};

/**
 * The Hivemind: a single, role-aware view of what every AI agent in RoleCall is
 * "thinking" right now — graded verdicts (the Grader), persona pushback (the Buyer),
 * recurring-gap patterns (the Coach), and drafted modules (the Strategist) — plus a
 * deterministic consensus narrative. Managers see the team's mind; reps see their own.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const me = await ctx.db.get(userId);
    if (!me) return null;

    const isManager = me.role === "manager";

    // ── Attempts in scope (manager = whole team, rep = their own) ──────────────
    const attempts = isManager
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
    const graded = attempts.filter((a) => typeof a.score === "number");

    // Module cache — managers pull their own modules; reps pick up modules lazily.
    const moduleCache = new Map<string, Doc<"modules"> | null>();
    const getModule = async (id: Id<"modules">) => {
      const key = id as string;
      if (!moduleCache.has(key)) moduleCache.set(key, await ctx.db.get(id));
      return moduleCache.get(key) ?? null;
    };
    if (isManager) {
      const mine = await ctx.db
        .query("modules")
        .withIndex("by_creator", (q) => q.eq("createdBy", userId))
        .order("desc")
        .take(50);
      for (const m of mine) moduleCache.set(m._id as string, m);
    }

    const repNameCache = new Map<string, string>();
    const repName = async (id: Id<"users">) => {
      const key = id as string;
      if (!repNameCache.has(key)) {
        const u = await ctx.db.get(id);
        repNameCache.set(key, u?.name ?? u?.email ?? "Rep");
      }
      return repNameCache.get(key)!;
    };

    const thoughts: Thought[] = [];

    // ── The Grader + The Coach: one thought per recent graded call ─────────────
    for (const a of graded.slice(0, 26)) {
      const mod = await getModule(a.moduleId);
      const who = isManager ? await repName(a.repId) : "You";
      const buyer = mod?.scenario.buyerName ?? "the buyer";
      const line = a.verdict?.line ?? (a.passed ? "Solid — that would move the deal." : "Not there yet.");
      const at = a.endedAt ?? a.startedAt;
      thoughts.push({
        id: `grade-${a._id}`,
        agent: "grader",
        text: `${who} vs ${buyer} — ${line}`,
        tone: a.passed ? "good" : "bad",
        at,
        meta: mod?.title ?? null,
        link: { kind: "attempt", id: a._id as string },
      });
      const fix = a.fixes?.[0];
      if (fix) {
        thoughts.push({
          id: `fix-${a._id}`,
          agent: "coach",
          text: `${who === "You" ? "Next time" : `For ${who}`}: ${fix}`,
          tone: "neutral",
          at: at - 1,
          meta: mod?.title ?? null,
          link: { kind: "attempt", id: a._id as string },
        });
      }
    }

    // ── The Buyer: persona reflections from modules in scope ───────────────────
    const buyerModules = (
      isManager
        ? [...moduleCache.values()].filter((m): m is Doc<"modules"> => m !== null)
        : [...moduleCache.values()].filter((m): m is Doc<"modules"> => m !== null)
    )
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 12);
    for (const m of buyerModules) {
      const obj = m.scenario.objections?.[0];
      if (!obj) continue;
      thoughts.push({
        id: `buyer-${m._id}`,
        agent: "buyer",
        text: `As ${m.scenario.buyerName}, ${m.scenario.buyerTitle} at ${m.scenario.company}, I'll push back with: "${obj}"`,
        tone: "neutral",
        at: m._creationTime,
        meta: m.title,
        link: { kind: "module", id: m._id as string },
      });
    }

    // ── The Strategist: pending AI-drafted module suggestions (manager only) ───
    let pendingSuggestions = 0;
    if (isManager) {
      const suggestions = await ctx.db
        .query("suggestions")
        .withIndex("by_manager_status", (q) => q.eq("managerId", userId).eq("status", "pending"))
        .order("desc")
        .take(10);
      pendingSuggestions = suggestions.length;
      for (const s of suggestions) {
        thoughts.push({
          id: `strat-${s._id}`,
          agent: "strategist",
          text: `Drafting a new module — "${s.draft.title}". ${s.rationale}`,
          tone: "good",
          at: s._creationTime,
          meta: "Suggestion",
          link: null,
        });
      }
    }

    // ── Synapses: objective hit-rates across graded calls (the mind's memory) ──
    const objAgg = new Map<string, { met: number; total: number }>();
    for (const a of graded) {
      for (const h of a.objectiveHits ?? []) {
        const cur = objAgg.get(h.objective) ?? { met: 0, total: 0 };
        cur.total += 1;
        if (h.met) cur.met += 1;
        objAgg.set(h.objective, cur);
      }
    }
    const synapses = [...objAgg.entries()]
      .map(([objective, v]) => ({
        objective,
        hitRate: v.total ? Math.round((v.met / v.total) * 100) : 0,
        samples: v.total,
      }))
      .sort((a, b) => a.hitRate - b.hitRate);
    const weakest = synapses[0] ?? null;
    const strongest = synapses.length ? synapses[synapses.length - 1] : null;

    if (weakest && weakest.samples >= 1) {
      thoughts.push({
        id: "coach-weak",
        agent: "coach",
        text: `${isManager ? "The team" : "You"} land "${weakest.objective}" only ${weakest.hitRate}% of the time — that's the gap to close.`,
        tone: weakest.hitRate < 50 ? "bad" : "neutral",
        at: graded[0] ? (graded[0].endedAt ?? graded[0].startedAt) + 1 : 0,
        meta: "Pattern",
        link: null,
      });
    }

    thoughts.sort((a, b) => b.at - a.at);

    // ── Headline stats + collective mood ──────────────────────────────────────
    const scores = graded.map((a) => a.score as number);
    const avgScore = scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : 0;
    const passRate = graded.length
      ? Math.round((graded.filter((a) => a.passed).length / graded.length) * 100)
      : 0;
    const mood =
      graded.length === 0
        ? "waking up"
        : avgScore >= 80
          ? "confident"
          : avgScore >= 65
            ? "focused"
            : avgScore >= 50
              ? "concerned"
              : "alarmed";

    const agents = [
      { key: "grader" as const, name: "The Grader", role: "Scores every call against its rubric", active: graded.length > 0 },
      { key: "buyer" as const, name: "The Buyer", role: "Roleplays the persona reps face", active: buyerModules.length > 0 },
      { key: "coach" as const, name: "The Coach", role: "Spots patterns and prescribes fixes", active: graded.length > 0 },
      { key: "strategist" as const, name: "The Strategist", role: "Drafts new modules from weak spots", active: isManager && pendingSuggestions > 0 },
    ];

    // ── Deterministic consensus (the screen shows this instantly; AI enriches it) ─
    const subject = isManager ? "the team" : "you";
    let consensus: string;
    if (graded.length === 0) {
      consensus =
        "The hive is quiet — no graded calls yet. Run a practice call and the agents will start thinking.";
    } else {
      const parts = [
        `Across ${graded.length} graded call${graded.length === 1 ? "" : "s"}, the hive sees ${subject} averaging ${avgScore}/100 with a ${passRate}% pass rate.`,
      ];
      if (weakest && weakest.samples >= 1)
        parts.push(`The sharpest recurring gap is "${weakest.objective}" (${weakest.hitRate}% hit rate).`);
      if (strongest && strongest !== weakest && strongest.hitRate >= 70)
        parts.push(`Strongest reflex: "${strongest.objective}" (${strongest.hitRate}%).`);
      if (isManager && pendingSuggestions > 0)
        parts.push(
          `${pendingSuggestions} new module${pendingSuggestions === 1 ? "" : "s"} ${pendingSuggestions === 1 ? "is" : "are"} being drafted to close it.`,
        );
      consensus = parts.join(" ");
    }

    return {
      scope: isManager ? ("team" as const) : ("personal" as const),
      stats: {
        callsAnalyzed: graded.length,
        agentsActive: agents.filter((a) => a.active).length,
        avgScore,
        passRate,
        mood,
        pendingSuggestions,
      },
      agents,
      thoughts: thoughts.slice(0, 40),
      synapses: synapses.slice(0, 8),
      consensus,
    };
  },
});
