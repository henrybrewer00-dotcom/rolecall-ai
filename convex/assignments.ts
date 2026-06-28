import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, internalMutation } from "./_generated/server";

/** Modules assigned to the current rep, with module info + their best attempt. */
export const listForRep = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_rep", (q) => q.eq("repId", userId))
      .order("desc")
      .collect();

    return await Promise.all(
      assignments.map(async (a) => {
        const module = await ctx.db.get(a.moduleId);
        const attempts = await ctx.db
          .query("attempts")
          .withIndex("by_rep_module", (q) => q.eq("repId", userId).eq("moduleId", a.moduleId))
          .collect();
        const scored = attempts.filter((t) => typeof t.score === "number");
        const best = scored.reduce((m, t) => Math.max(m, t.score ?? 0), 0);
        return {
          assignment: a,
          module,
          attemptCount: attempts.length,
          bestScore: scored.length ? best : null,
          passed: a.status === "passed",
        };
      }),
    );
  },
});

export const get = query({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("assignments")
      .withIndex("by_rep_module", (q) => q.eq("repId", userId).eq("moduleId", moduleId))
      .first();
  },
});

/** Update a rep's assignment status/bestScore after an attempt is graded. */
export const recordAttemptResult = internalMutation({
  args: { repId: v.id("users"), moduleId: v.id("modules"), score: v.number(), passed: v.boolean() },
  handler: async (ctx, { repId, moduleId, score, passed }) => {
    const a = await ctx.db
      .query("assignments")
      .withIndex("by_rep_module", (q) => q.eq("repId", repId).eq("moduleId", moduleId))
      .first();
    if (!a) return;
    const bestScore = Math.max(a.bestScore ?? 0, score);
    const status = passed || a.status === "passed" ? "passed" : "in_progress";
    await ctx.db.patch(a._id, { bestScore, status });
  },
});
