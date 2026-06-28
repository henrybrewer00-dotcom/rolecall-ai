import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { moduleDraft } from "./schema";

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("suggestions")
      .withIndex("by_manager_status", (q) => q.eq("managerId", userId).eq("status", "pending"))
      .order("desc")
      .collect();
  },
});

/** Approve a suggestion → create a draft module from it (manager then reviews/publishes). */
export const approve = mutation({
  args: { suggestionId: v.id("suggestions") },
  handler: async (ctx, { suggestionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const s = await ctx.db.get(suggestionId);
    if (!s) throw new Error("Suggestion not found");
    const me = await ctx.db.get(userId);
    const moduleId = await ctx.db.insert("modules", {
      orgId: me?.orgId,
      createdBy: userId,
      title: s.draft.title,
      description: s.draft.description,
      scenario: s.draft.scenario,
      objectives: s.draft.objectives,
      passThreshold: 70,
      status: "draft",
    });
    await ctx.db.patch(suggestionId, { status: "approved" });
    return moduleId;
  },
});

export const dismiss = mutation({
  args: { suggestionId: v.id("suggestions") },
  handler: async (ctx, { suggestionId }) => {
    await ctx.db.patch(suggestionId, { status: "dismissed" });
  },
});

export const insert = internalMutation({
  args: {
    managerId: v.id("users"),
    rationale: v.string(),
    draft: moduleDraft,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("suggestions", { ...args, status: "pending" });
  },
});
