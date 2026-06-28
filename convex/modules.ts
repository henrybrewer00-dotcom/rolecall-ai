import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalMutation } from "./_generated/server";

const scenario = v.object({
  buyerName: v.string(),
  buyerTitle: v.string(),
  company: v.string(),
  personality: v.string(),
  objections: v.array(v.string()),
  difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"), v.literal("brutal")),
});

const rubric = v.array(v.object({ name: v.string(), weight: v.number(), description: v.string() }));

/** Create a module (draft) from an interview-generated (and possibly edited) draft. */
export const create = mutation({
  args: {
    interviewId: v.optional(v.id("interviews")),
    title: v.string(),
    description: v.string(),
    goal: v.optional(v.string()),
    scenario,
    objectives: v.array(v.string()),
    rubric: v.optional(rubric),
    voiceId: v.optional(v.string()),
    passThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const me = await ctx.db.get(userId);
    const moduleId = await ctx.db.insert("modules", {
      orgId: me?.orgId,
      createdBy: userId,
      interviewId: args.interviewId,
      title: args.title,
      description: args.description,
      goal: args.goal,
      scenario: args.scenario,
      objectives: args.objectives,
      rubric: args.rubric,
      rubricApproved: args.rubric ? true : undefined,
      voiceId: args.voiceId,
      passThreshold: args.passThreshold ?? 70,
      status: "draft",
    });
    if (args.interviewId) await ctx.db.patch(args.interviewId, { moduleId });
    return moduleId;
  },
});

/** Delete a module and its assignments + attempts (hold-to-confirm in the UI). */
export const remove = mutation({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const mod = await ctx.db.get(moduleId);
    if (!mod || mod.createdBy !== userId) throw new Error("Not allowed");
    for (const a of await ctx.db.query("assignments").withIndex("by_module", (q) => q.eq("moduleId", moduleId)).collect()) {
      await ctx.db.delete(a._id);
    }
    for (const t of await ctx.db.query("attempts").withIndex("by_module", (q) => q.eq("moduleId", moduleId)).collect()) {
      await ctx.db.delete(t._id);
    }
    await ctx.db.delete(moduleId);
  },
});

/** Publish a module and assign it to every rep in the manager's org. */
export const publish = mutation({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const mod = await ctx.db.get(moduleId);
    if (!mod) throw new Error("Module not found");
    await ctx.db.patch(moduleId, { status: "published", publishedAt: Date.now() });

    const me = await ctx.db.get(userId);
    if (!me?.orgId) return { assigned: 0 };

    // A personalized drill (ownerRepId set) assigns only to its target rep;
    // a regular module assigns to every rep in the org.
    const reps = mod.ownerRepId
      ? [await ctx.db.get(mod.ownerRepId)].filter((r): r is NonNullable<typeof r> => !!r)
      : (
          await ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", me.orgId)).collect()
        ).filter((u) => u.role === "rep");

    let assigned = 0;
    for (const rep of reps) {
      const existing = await ctx.db
        .query("assignments")
        .withIndex("by_rep_module", (q) => q.eq("repId", rep._id).eq("moduleId", moduleId))
        .first();
      if (existing) continue;
      await ctx.db.insert("assignments", {
        moduleId,
        repId: rep._id,
        managerId: userId,
        assignedAt: Date.now(),
        status: "assigned",
      });
      assigned++;
    }
    return { assigned };
  },
});

/** Edit a saved draft/scheduled module in place. */
export const update = mutation({
  args: {
    moduleId: v.id("modules"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    goal: v.optional(v.string()),
    scenario: v.optional(scenario),
    objectives: v.optional(v.array(v.string())),
    rubric: v.optional(rubric),
    voiceId: v.optional(v.string()),
  },
  handler: async (ctx, { moduleId, ...fields }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const mod = await ctx.db.get(moduleId);
    if (!mod || mod.createdBy !== userId) throw new Error("Not allowed");
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) patch[k] = val;
    if (fields.rubric !== undefined) patch.rubricApproved = true;
    await ctx.db.patch(moduleId, patch);
  },
});

/** Schedule a module to auto-publish at a future time. */
export const schedule = mutation({
  args: { moduleId: v.id("modules"), scheduledFor: v.number() },
  handler: async (ctx, { moduleId, scheduledFor }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const mod = await ctx.db.get(moduleId);
    if (!mod || mod.createdBy !== userId) throw new Error("Not allowed");
    await ctx.db.patch(moduleId, { status: "scheduled", scheduledFor });
  },
});

/** Cancel a schedule (back to draft). */
export const unschedule = mutation({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const mod = await ctx.db.get(moduleId);
    if (!mod || mod.createdBy !== userId) throw new Error("Not allowed");
    await ctx.db.patch(moduleId, { status: "draft", scheduledFor: undefined });
  },
});

/** Assign a module to every rep in its org (idempotent). Shared by publish + cron. */
async function assignModuleToOrg(ctx: any, mod: any): Promise<number> {
  if (!mod.orgId) return 0;
  const reps = (await ctx.db.query("users").withIndex("by_org", (q: any) => q.eq("orgId", mod.orgId)).collect()).filter(
    (u: any) => u.role === "rep",
  );
  let n = 0;
  for (const rep of reps) {
    const existing = await ctx.db
      .query("assignments")
      .withIndex("by_rep_module", (q: any) => q.eq("repId", rep._id).eq("moduleId", mod._id))
      .first();
    if (existing) continue;
    await ctx.db.insert("assignments", {
      moduleId: mod._id,
      repId: rep._id,
      managerId: mod.createdBy,
      assignedAt: Date.now(),
      status: "assigned",
    });
    n++;
  }
  return n;
}

/** Cron: publish any scheduled modules whose time has come. */
export const publishDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = (await ctx.db.query("modules").collect()).filter(
      (m) => m.status === "scheduled" && (m.scheduledFor ?? Infinity) <= now,
    );
    for (const m of due) {
      await ctx.db.patch(m._id, { status: "published", publishedAt: now });
      await assignModuleToOrg(ctx, m);
    }
  },
});

export const get = query({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => ctx.db.get(moduleId),
});

/** Modules created by the current manager. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("modules")
      .withIndex("by_creator", (q) => q.eq("createdBy", userId))
      .order("desc")
      .collect();
  },
});

// ── Scenario library (prebuilt starting points — solves the cold-start) ──
const LIBRARY = [
  {
    title: "Cold Call: Skeptical CFO",
    description: "Earn 30 seconds, then a meeting, from a numbers-first CFO who hates fluff.",
    scenario: {
      buyerName: "Dana Mercer", buyerTitle: "CFO", company: "Northwind Logistics",
      personality: "You are numbers-first and allergic to fluff. You challenge every claim with a follow-up and guard your time.",
      objections: ["What's the actual ROI?", "We already have a tool for this", "This isn't a budget priority"],
      difficulty: "hard" as const,
    },
    objectives: ["Open with a quantified hook in 15s", "Tie value to a metric the CFO owns", "Handle 'we already have a tool' with a specific gap", "Book a scoped next step"],
  },
  {
    title: "Discovery: Friendly Champion",
    description: "Arm an enthusiastic champion to sell internally to their boss.",
    scenario: {
      buyerName: "Priya Shah", buyerTitle: "Ops Manager", company: "Brightwave",
      personality: "You like the product and want it to work, but you have to sell it up the chain and need ammunition.",
      objections: ["How do I pitch this to my VP?", "Can you help me build the business case?", "What about onboarding effort?"],
      difficulty: "easy" as const,
    },
    objectives: ["Uncover the champion's internal blocker", "Equip them with a one-line business case", "Quantify time-to-value", "Agree on a multi-threaded next step"],
  },
  {
    title: "Objection: Incumbent Vendor",
    description: "Flip 'we already use a competitor' into a real evaluation.",
    scenario: {
      buyerName: "Sam Rivera", buyerTitle: "Director of RevOps", company: "Meridian",
      personality: "You are loyal to your current vendor and busy. You only engage if the rep names a gap you actually feel.",
      objections: ["We're happy with what we have", "Switching is too painful", "Why risk it?"],
      difficulty: "hard" as const,
    },
    objectives: ["Surface a concrete gap in the incumbent", "Quantify the cost of staying", "Lower the perceived switching risk", "Secure a scoped pilot"],
  },
  {
    title: "Pricing: Brutal Procurement",
    description: "Hold your price against a procurement lead who anchors low.",
    scenario: {
      buyerName: "Greg Tan", buyerTitle: "Procurement Lead", company: "Volta Manufacturing",
      personality: "You are blunt and budget-obsessed. You anchor low and test whether the rep will cave.",
      objections: ["That's way over budget", "Your competitor is cheaper", "Give me 30% off"],
      difficulty: "brutal" as const,
    },
    objectives: ["Acknowledge budget without discounting", "Re-anchor on value and cost of inaction", "Trade concessions for commitments"],
  },
];

export const library = query({
  args: {},
  handler: async () => LIBRARY.map((t, i) => ({ id: i, ...t })),
});

export const createFromTemplate = mutation({
  args: { templateId: v.number() },
  handler: async (ctx, { templateId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const t = LIBRARY[templateId];
    if (!t) throw new Error("Template not found");
    const me = await ctx.db.get(userId);
    return await ctx.db.insert("modules", {
      orgId: me?.orgId,
      createdBy: userId,
      title: t.title,
      description: t.description,
      scenario: t.scenario,
      objectives: t.objectives,
      passThreshold: 70,
      status: "draft",
    });
  },
});

/** A rep's private personal drills (AI-built from their weak spots). */
export const listPersonal = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("modules")
      .withIndex("by_creator", (q) => q.eq("createdBy", userId))
      .order("desc")
      .collect();
    return all.filter((m) => m.kind === "personal");
  },
});

/** Insert a rep-owned personal drill (called by ai.personalizedDrill). */
export const createPersonalInternal = internalMutation({
  args: {
    ownerRepId: v.id("users"),
    orgId: v.optional(v.id("orgs")),
    title: v.string(),
    description: v.string(),
    scenario,
    objectives: v.array(v.string()),
    rubric: v.optional(rubric),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("modules", {
      orgId: args.orgId,
      createdBy: args.ownerRepId,
      ownerRepId: args.ownerRepId,
      kind: "personal",
      title: args.title,
      description: args.description,
      scenario: args.scenario,
      objectives: args.objectives,
      rubric: args.rubric,
      rubricApproved: true,
      passThreshold: 70,
      status: "published",
      publishedAt: Date.now(),
    });
  },
});

/** Insert a manager module tailored to ONE rep + assign it only to them. */
export const createTargetedInternal = internalMutation({
  args: {
    managerId: v.id("users"),
    repId: v.id("users"),
    orgId: v.optional(v.id("orgs")),
    title: v.string(),
    description: v.string(),
    scenario,
    objectives: v.array(v.string()),
    rubric: v.optional(rubric),
  },
  handler: async (ctx, args) => {
    // Created as an editable DRAFT targeted at one rep (ownerRepId). The manager
    // reviews/tweaks it, then publishing assigns it to that rep only.
    return await ctx.db.insert("modules", {
      orgId: args.orgId,
      createdBy: args.managerId,
      kind: "team",
      ownerRepId: args.repId,
      title: args.title,
      description: args.description,
      scenario: args.scenario,
      objectives: args.objectives,
      rubric: args.rubric,
      rubricApproved: true,
      passThreshold: 70,
      status: "draft",
    });
  },
});

export const createInternal = internalMutation({
  args: {
    createdBy: v.id("users"),
    orgId: v.optional(v.id("orgs")),
    title: v.string(),
    description: v.string(),
    scenario,
    objectives: v.array(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
  },
  handler: async (ctx, args) => {
    const { status, ...rest } = args;
    return await ctx.db.insert("modules", {
      ...rest,
      passThreshold: 70,
      status,
      publishedAt: status === "published" ? Date.now() : undefined,
    });
  },
});
