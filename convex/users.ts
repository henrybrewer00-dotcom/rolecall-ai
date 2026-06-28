import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalQuery } from "./_generated/server";

function genCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { ...user, role: user.role ?? null };
  },
});

/** Public: look up a team by its invite code (for the rep join screen). */
export const orgByInvite = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_invite", (q) => q.eq("inviteCode", code.toUpperCase()))
      .first();
    if (!org) return null;
    const owner = await ctx.db.get(org.ownerId);
    return { orgId: org._id, name: org.name, company: org.company ?? org.name, managerName: owner?.name ?? "Manager" };
  },
});

/** The current manager's invite code (to share a link/code with reps). */
export const myInvite = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const me = await ctx.db.get(userId);
    if (!me?.orgId) return null;
    const org = await ctx.db.get(me.orgId);
    return org ? { code: org.inviteCode ?? "", team: org.name } : null;
  },
});

/**
 * Onboarding. With an `inviteCode` → join as a rep (no role picker).
 * Without → become a manager (company creates an org with an invite code).
 */
export const completeOnboarding = mutation({
  args: {
    name: v.string(),
    title: v.optional(v.string()),
    job: v.optional(v.string()),
    company: v.optional(v.string()),
    context: v.optional(v.string()),
    inviteCode: v.optional(v.string()),
  },
  handler: async (ctx, { name, title, job, company, context, inviteCode }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (inviteCode) {
      const org = await ctx.db
        .query("orgs")
        .withIndex("by_invite", (q) => q.eq("inviteCode", inviteCode.toUpperCase()))
        .first();
      if (!org) throw new Error("Invalid invite code");
      await ctx.db.patch(userId, {
        role: "rep",
        name,
        title: title ?? "Account Executive",
        orgId: org._id,
        managerId: org.ownerId,
      });
      // Auto-assign every published module in the team.
      const published = (
        await ctx.db.query("modules").withIndex("by_org", (q) => q.eq("orgId", org._id)).collect()
      ).filter((m) => m.status === "published");
      for (const m of published) {
        const existing = await ctx.db
          .query("assignments")
          .withIndex("by_rep_module", (q) => q.eq("repId", userId).eq("moduleId", m._id))
          .first();
        if (!existing) {
          await ctx.db.insert("assignments", {
            moduleId: m._id, repId: userId, managerId: org.ownerId, assignedAt: Date.now(), status: "assigned",
          });
        }
      }
      return { role: "rep" as const };
    }

    // Manager
    const orgName = company ? `${company}` : `${name}'s Team`;
    const orgId = await ctx.db.insert("orgs", {
      name: orgName,
      ownerId: userId,
      company: company ?? undefined,
      context: context ?? undefined,
      inviteCode: genCode(),
    });
    await ctx.db.patch(userId, {
      role: "manager",
      name,
      title: title ?? "Sales Manager",
      job: job ?? undefined,
      company: company ?? undefined,
      orgId,
    });
    return { role: "manager" as const, orgId };
  },
});

export const myReps = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const me = await ctx.db.get(userId);
    if (!me?.orgId) return [];
    const members = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", me.orgId))
      .collect();
    return members.filter((u) => u._id !== userId && u.role === "rep");
  },
});

export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ctx.db.get(userId),
});

/** Org background context for a manager (used to ground AI module-building). */
export const orgContext = internalQuery({
  args: { managerId: v.id("users") },
  handler: async (ctx, { managerId }) => {
    const u = await ctx.db.get(managerId);
    if (!u?.orgId) return null;
    const org = await ctx.db.get(u.orgId);
    return org?.context ?? null;
  },
});

/**
 * Everything the interview AI should already KNOW about the manager + their
 * business before the first question — so it never asks who they are, what
 * company they run, or what they sell. The manager is the team's sales leader.
 */
export const interviewContext = internalQuery({
  args: { managerId: v.id("users") },
  handler: async (ctx, { managerId }) => {
    const u = await ctx.db.get(managerId);
    if (!u) return null;
    const org = u.orgId ? await ctx.db.get(u.orgId) : null;
    const fullName = u.name?.trim() || "";
    const firstName = fullName.split(/\s+/)[0] || "";
    return {
      managerName: fullName,
      firstName,
      title: u.title ?? null, // their role, e.g. "Sales Manager"
      job: u.job ?? null, // what the team actually sells / does
      company: u.company ?? org?.company ?? org?.name ?? null,
      orgName: org?.name ?? null,
      context: org?.context ?? null, // rich background captured at onboarding
      enrichment: org?.enrichment
        ? {
            summary: org.enrichment.summary,
            industry: org.enrichment.industry ?? null,
            size: org.enrichment.size ?? null,
          }
        : null,
    };
  },
});

export const updateProfile = mutation({
  args: { name: v.optional(v.string()), title: v.optional(v.string()), job: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const patch: Record<string, string> = {};
    if (args.name?.trim()) patch.name = args.name.trim();
    if (args.title?.trim()) patch.title = args.title.trim();
    if (args.job?.trim()) patch.job = args.job.trim();
    await ctx.db.patch(userId, patch);
  },
});

/** The manager's company/org details (for the Settings → Company card). */
export const myCompany = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const me = await ctx.db.get(userId);
    if (!me?.orgId) return null;
    const org = await ctx.db.get(me.orgId);
    if (!org) return null;
    return {
      company: org.company ?? org.name ?? "",
      website: org.website ?? "",
      context: org.context ?? "",
    };
  },
});

/** Edit company details (manager only). Grounds the AI's module-building. */
export const updateCompany = mutation({
  args: {
    company: v.optional(v.string()),
    website: v.optional(v.string()),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const me = await ctx.db.get(userId);
    if (!me || me.role !== "manager" || !me.orgId) {
      throw new Error("Only managers can edit company details");
    }
    const orgPatch: Record<string, unknown> = {};
    if (args.company !== undefined) orgPatch.company = args.company.trim();
    if (args.website !== undefined) orgPatch.website = args.website.trim();
    if (args.context !== undefined) orgPatch.context = args.context.trim();
    await ctx.db.patch(me.orgId, orgPatch);
    // Keep the user's displayed company in sync with the org.
    if (args.company !== undefined) await ctx.db.patch(userId, { company: args.company.trim() });
  },
});
