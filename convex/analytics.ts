import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

function stats(scores: number[]) {
  if (!scores.length) return { count: 0, avg: 0, min: 0, max: 0 };
  const sum = scores.reduce((a, b) => a + b, 0);
  return { count: scores.length, avg: Math.round(sum / scores.length), min: Math.min(...scores), max: Math.max(...scores) };
}

/** Manager home: per-module rollups + team headline numbers. */
export const managerDashboard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const me = await ctx.db.get(userId);
    if (!me) return null;

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_creator", (q) => q.eq("createdBy", userId))
      .order("desc")
      .collect();

    const reps = me.orgId
      ? (await ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", me.orgId)).collect()).filter(
          (u) => u.role === "rep",
        )
      : [];

    const moduleRows = await Promise.all(
      modules.map(async (m) => {
        const assignments = await ctx.db
          .query("assignments")
          .withIndex("by_module", (q) => q.eq("moduleId", m._id))
          .collect();
        const best = assignments.map((a) => a.bestScore).filter((x): x is number => typeof x === "number");
        const passed = assignments.filter((a) => a.status === "passed").length;
        const attempted = assignments.filter((a) => a.status !== "assigned").length;
        const s = stats(best);
        return {
          module: m,
          assigned: assignments.length,
          attempted,
          passed,
          passRate: assignments.length ? Math.round((passed / assignments.length) * 100) : 0,
          avgScore: s.avg,
          range: assignments.length && best.length ? { min: s.min, max: s.max } : null,
        };
      }),
    );

    const allBest = moduleRows.flatMap((r) =>
      r.range ? [r.avgScore] : [],
    );
    const teamAvg = allBest.length ? Math.round(allBest.reduce((a, b) => a + b, 0) / allBest.length) : 0;

    return {
      manager: { name: me.name ?? "Manager", title: me.title ?? "Sales Manager" },
      repCount: reps.length,
      moduleCount: modules.length,
      publishedCount: modules.filter((m) => m.status === "published").length,
      teamAvg,
      modules: moduleRows,
    };
  },
});

/** Drill into one module: per-rep performance. */
export const moduleDetail = query({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    const module = await ctx.db.get(moduleId);
    if (!module) return null;
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_module", (q) => q.eq("moduleId", moduleId))
      .collect();

    const rows = await Promise.all(
      assignments.map(async (a) => {
        const rep = await ctx.db.get(a.repId);
        const attempts = await ctx.db
          .query("attempts")
          .withIndex("by_rep_module", (q) => q.eq("repId", a.repId).eq("moduleId", moduleId))
          .collect();
        return {
          repId: a.repId,
          repName: rep?.name ?? rep?.email ?? "Rep",
          status: a.status,
          bestScore: a.bestScore ?? null,
          attempts: attempts.length,
          lastAt: attempts.reduce((m, t) => Math.max(m, t.startedAt), 0) || a.assignedAt,
        };
      }),
    );

    const best = rows.map((r) => r.bestScore).filter((x): x is number => typeof x === "number");
    const s = stats(best);
    return {
      module,
      stats: {
        assigned: assignments.length,
        passed: assignments.filter((a) => a.status === "passed").length,
        passRate: assignments.length ? Math.round((assignments.filter((a) => a.status === "passed").length / assignments.length) * 100) : 0,
        avg: s.avg,
        range: best.length ? { min: s.min, max: s.max } : null,
      },
      reps: rows.sort((a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1)),
    };
  },
});

/** Drill into one rep: their assignments + every attempt (recordings/feedback). */
export const repDetail = query({
  args: { repId: v.id("users") },
  handler: async (ctx, { repId }) => {
    const rep = await ctx.db.get(repId);
    if (!rep) return null;
    const attempts = (
      await ctx.db
        .query("attempts")
        .withIndex("by_rep", (q) => q.eq("repId", repId))
        .order("desc")
        .collect()
    ).filter((a) => a.visibility !== "private"); // private practice never rolls up to the manager

    const withModule = await Promise.all(
      attempts.map(async (a) => ({ attempt: a, module: await ctx.db.get(a.moduleId) })),
    );
    const scored = attempts.map((a) => a.score).filter((x): x is number => typeof x === "number");
    const s = stats(scored);
    return {
      rep: { _id: rep._id, name: rep.name ?? rep.email ?? "Rep", title: rep.title ?? "Account Executive", email: rep.email },
      stats: { attempts: attempts.length, avg: s.avg, best: s.max, passed: attempts.filter((a) => a.passed).length },
      attempts: withModule,
    };
  },
});

/** Team score trend over time (for the dashboard graph) + a rep leaderboard. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_manager", (q) => q.eq("managerId", userId))
      .collect();
    const graded = attempts.filter((a) => typeof a.score === "number");

    // Trend: average score per day (oldest → newest).
    const byDay = new Map<string, { sum: number; n: number; at: number }>();
    for (const a of graded) {
      const day = new Date(a.startedAt).toISOString().slice(0, 10);
      const cur = byDay.get(day) ?? { sum: 0, n: 0, at: a.startedAt };
      cur.sum += a.score!; cur.n += 1; cur.at = Math.min(cur.at, a.startedAt);
      byDay.set(day, cur);
    }
    const trend = [...byDay.entries()]
      .map(([day, v]) => ({ day, at: v.at, score: Math.round(v.sum / v.n) }))
      .sort((a, b) => a.at - b.at);

    // Leaderboard by rep.
    const byRep = new Map<string, { best: number; sum: number; n: number; passed: number }>();
    for (const a of graded) {
      const cur = byRep.get(a.repId) ?? { best: 0, sum: 0, n: 0, passed: 0 };
      cur.best = Math.max(cur.best, a.score!); cur.sum += a.score!; cur.n += 1;
      if (a.passed) cur.passed += 1;
      byRep.set(a.repId, cur);
    }
    const leaderboard = await Promise.all(
      [...byRep.entries()].map(async ([repId, v]) => {
        const rep = await ctx.db.get(repId as any);
        return {
          repId,
          name: (rep as any)?.name ?? "Rep",
          best: v.best,
          avg: Math.round(v.sum / v.n),
          attempts: v.n,
          passed: v.passed,
        };
      }),
    );
    leaderboard.sort((a, b) => b.best - a.best || b.avg - a.avg);
    return { trend, leaderboard };
  },
});

/** "See all" — every practice attempt across the team, newest first. */
export const allActivity = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const raw = await ctx.db
      .query("attempts")
      .withIndex("by_manager", (q) => q.eq("managerId", userId))
      .order("desc")
      .take(120);
    // Drop abandoned calls (still "active"/"scoring" after 30 min were never finished).
    const STALE_MS = 30 * 60 * 1000;
    const attempts = raw
      .filter((a) => a.status === "done" || Date.now() - a.startedAt < STALE_MS)
      .slice(0, 100);
    return await Promise.all(
      attempts.map(async (a) => {
        const rep = await ctx.db.get(a.repId);
        const mod = await ctx.db.get(a.moduleId);
        return {
          attemptId: a._id,
          repId: a.repId,
          repName: rep?.name ?? "Rep",
          moduleTitle: mod?.title ?? "Module",
          difficulty: mod?.scenario.difficulty ?? "medium",
          status: a.status,
          score: a.score ?? null,
          passed: a.passed ?? null,
          at: a.startedAt,
        };
      }),
    );
  },
});

/** Compact index the AI search reasons over. */
export const searchIndex = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const me = await ctx.db.get(userId);
    if (!me?.orgId) return null;

    const reps = (await ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", me.orgId)).collect()).filter(
      (u) => u.role === "rep",
    );
    const modules = await ctx.db.query("modules").withIndex("by_creator", (q) => q.eq("createdBy", userId)).collect();
    const attempts = await ctx.db.query("attempts").withIndex("by_manager", (q) => q.eq("managerId", userId)).collect();

    const repRows = reps.map((r) => {
      const mine = attempts.filter((a) => a.repId === r._id && typeof a.score === "number");
      const avg = mine.length ? Math.round(mine.reduce((s, a) => s + a.score!, 0) / mine.length) : null;
      return { id: r._id, name: r.name, attempts: mine.length, avg, passed: mine.filter((a) => a.passed).length };
    });
    const modRows = modules.map((m) => {
      const mine = attempts.filter((a) => a.moduleId === m._id && typeof a.score === "number");
      const avg = mine.length ? Math.round(mine.reduce((s, a) => s + a.score!, 0) / mine.length) : null;
      return { id: m._id, title: m.title, status: m.status, difficulty: m.scenario.difficulty, attempts: mine.length, avg };
    });
    const recent = attempts
      .filter((a) => typeof a.score === "number")
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 30)
      .map((a) => {
        const rep = reps.find((r) => r._id === a.repId);
        const mod = modules.find((m) => m._id === a.moduleId);
        return { rep: rep?.name ?? "Rep", module: mod?.title ?? "Module", score: a.score, passed: a.passed };
      });
    return { reps: repRows, modules: modRows, recent };
  },
});

/** The current rep's own weak spots (for personalized private drills). */
export const myWeakSpots = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_rep", (q) => q.eq("repId", userId))
      .collect();
    const graded = attempts.filter((a) => typeof a.score === "number");

    const objAgg = new Map<string, { met: number; total: number }>();
    for (const a of graded) {
      for (const h of a.objectiveHits ?? []) {
        const cur = objAgg.get(h.objective) ?? { met: 0, total: 0 };
        cur.total += 1;
        if (h.met) cur.met += 1;
        objAgg.set(h.objective, cur);
      }
    }
    const objectives = [...objAgg.entries()]
      .map(([objective, v]) => ({ objective, hitRate: v.total ? Math.round((v.met / v.total) * 100) : 0, samples: v.total }))
      .sort((a, b) => a.hitRate - b.hitRate);
    const scores = graded.map((a) => a.score!).filter((n) => typeof n === "number");

    return {
      attempts: graded.length,
      avgScore: scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : 0,
      weakObjectives: objectives.filter((o) => o.hitRate < 70).slice(0, 5),
      allObjectives: objectives.slice(0, 8),
    };
  },
});

/**
 * Consecutive calendar days (local-ms) with >=1 attempt, ending today or yesterday.
 * `timestamps` are attempt start times (ms). Today still "counts" if the streak
 * runs through yesterday (so a rep mid-streak who hasn't practiced yet today keeps it).
 */
function computeStreak(timestamps: number[], now: number): number {
  if (!timestamps.length) return 0;
  const DAY = 86_400_000;
  const dayKey = (ms: number) => Math.floor(ms / DAY);
  const days = new Set(timestamps.map(dayKey));
  const today = dayKey(now);
  // The streak must end today or yesterday, else it's broken.
  let cursor: number;
  if (days.has(today)) cursor = today;
  else if (days.has(today - 1)) cursor = today - 1;
  else return 0;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

type LeaderboardRow = {
  repId: Id<"users">;
  name: string;
  email: string | null;
  attempts: number;
  avgScore: number;
  bestScore: number;
  lastActiveAt: number | null;
  currentStreak: number;
};

/**
 * Build the leaderboard for an org: one row per rep (incl. reps with zero attempts),
 * sorted best-first. Counts only graded/finished (status "done", numeric score)
 * team-visible attempts. Shared by `leaderboard` and `myStats`.
 */
async function buildLeaderboard(ctx: any, orgId: Id<"orgs">): Promise<LeaderboardRow[]> {
  const members = await ctx.db.query("users").withIndex("by_org", (q: any) => q.eq("orgId", orgId)).collect();
  const reps = members.filter((u: any) => u.role === "rep");

  // One pass per rep over their attempts (by_rep index) — avoids a global scan.
  const rows: LeaderboardRow[] = await Promise.all(
    reps.map(async (rep: any) => {
      const attempts = await ctx.db
        .query("attempts")
        .withIndex("by_rep", (q: any) => q.eq("repId", rep._id))
        .collect();
      // Graded/finished attempts that roll up to the team (not private practice).
      const graded = attempts.filter(
        (a: any) => a.status === "done" && typeof a.score === "number" && a.visibility !== "private",
      );
      const scores = graded.map((a: any) => a.score as number);
      const avgScore = scores.length ? Math.round(scores.reduce((s: number, n: number) => s + n, 0) / scores.length) : 0;
      const bestScore = scores.length ? Math.max(...scores) : 0;
      const lastActiveAt = graded.length ? Math.max(...graded.map((a: any) => a.endedAt ?? a.startedAt)) : null;
      const currentStreak = computeStreak(graded.map((a: any) => a.startedAt), Date.now());
      return {
        repId: rep._id as Id<"users">,
        name: rep.name ?? rep.email ?? "Rep",
        email: rep.email ?? null,
        attempts: graded.length,
        avgScore,
        bestScore,
        lastActiveAt,
        currentStreak,
      };
    }),
  );

  rows.sort(
    (a, b) =>
      b.avgScore - a.avgScore ||
      b.bestScore - a.bestScore ||
      b.attempts - a.attempts ||
      (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0),
  );
  return rows;
}

/** Team leaderboard for the current viewer's org (managers AND reps may call). */
export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const me = await ctx.db.get(userId);
    if (!me?.orgId) return [];
    return await buildLeaderboard(ctx, me.orgId);
  },
});

/** The logged-in rep's own stats + leaderboard rank. */
export const myStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const me = await ctx.db.get(userId);
    if (!me?.orgId) return null;

    const board = await buildLeaderboard(ctx, me.orgId);
    const idx = board.findIndex((r) => r.repId === userId);
    const mine = idx >= 0 ? board[idx] : null;

    // This week = trailing 7 calendar days (incl. today).
    const weekAgo = Date.now() - 7 * 86_400_000;
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_rep", (q) => q.eq("repId", userId))
      .collect();
    const thisWeekCount = attempts.filter(
      (a) =>
        a.status === "done" &&
        typeof a.score === "number" &&
        a.visibility !== "private" &&
        a.startedAt >= weekAgo,
    ).length;

    return {
      attempts: mine?.attempts ?? 0,
      avgScore: mine?.avgScore ?? 0,
      bestScore: mine?.bestScore ?? 0,
      currentStreak: mine?.currentStreak ?? 0,
      thisWeekCount,
      rank: idx >= 0 ? idx + 1 : board.length + 1,
    };
  },
});

/** Compact performance digest used by the AI to draft module suggestions. */
export const performanceSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_manager", (q) => q.eq("managerId", userId))
      .order("desc")
      .take(200);

    // Aggregate objective hit-rates across all graded attempts.
    const objAgg = new Map<string, { met: number; total: number }>();
    for (const a of attempts) {
      for (const h of a.objectiveHits ?? []) {
        const cur = objAgg.get(h.objective) ?? { met: 0, total: 0 };
        cur.total += 1;
        if (h.met) cur.met += 1;
        objAgg.set(h.objective, cur);
      }
    }
    const objectives = [...objAgg.entries()]
      .map(([objective, v]) => ({ objective, hitRate: v.total ? Math.round((v.met / v.total) * 100) : 0, samples: v.total }))
      .sort((a, b) => a.hitRate - b.hitRate);

    const scores = attempts.map((a) => a.score).filter((x): x is number => typeof x === "number");

    return {
      managerId: userId as Id<"users">,
      totalAttempts: attempts.length,
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      passRate: attempts.length ? Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 100) : 0,
      objectives: objectives.slice(0, 8),
      weakestObjective: objectives[0]?.objective ?? null,
    };
  },
});
