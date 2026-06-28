import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalMutation } from "./_generated/server";

const FALLBACK_OPENING =
  "Hi! I'll help you turn your expertise into a training module for your team. " +
  "Give me the quick rundown — what scenario do you want them to practice, and who's the toughest version of the person they'll be up against?";

/**
 * Build a warm opening that shows the AI already knows who the manager is and
 * what their business does, then asks ONE broad summary question to start fast.
 */
function buildOpening(u: {
  name?: string;
  company?: string;
  orgName?: string;
  hasBackground?: boolean;
}): string {
  const first = u.name?.trim().split(/\s+/)[0] ?? "";
  const team = u.company?.trim() || u.orgName?.trim() || "";
  const hi = first ? `Hey ${first}` : "Hi";
  const forTeam = team ? ` for the ${team} team` : "";
  const knowIt = u.hasBackground || team
    ? "I've got your background, so let's skip the basics. "
    : "";
  return (
    `${hi} — let's build a practice module${forTeam}. ` +
    knowIt +
    "Give me the quick rundown: what scenario do you want your reps drilling, and who's the toughest version of the person they're up against?"
  );
}

export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Personalize the opening from what we already know about the manager + org.
    const me = await ctx.db.get(userId);
    const org = me?.orgId ? await ctx.db.get(me.orgId) : null;
    const opening = me
      ? buildOpening({
          name: me.name,
          company: me.company ?? org?.company ?? undefined,
          orgName: org?.name,
          hasBackground: Boolean(org?.context || org?.enrichment),
        })
      : FALLBACK_OPENING;

    return await ctx.db.insert("interviews", {
      managerId: userId,
      status: "active",
      turns: [{ role: "assistant", text: opening }],
    });
  },
});

export const get = query({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, { interviewId }) => ctx.db.get(interviewId),
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("interviews")
      .withIndex("by_manager", (q) => q.eq("managerId", userId))
      .order("desc")
      .take(20);
  },
});

// ---- internal helpers used by ai.ts actions ----

export const appendTurn = internalMutation({
  args: {
    interviewId: v.id("interviews"),
    role: v.union(v.literal("assistant"), v.literal("manager")),
    text: v.string(),
  },
  handler: async (ctx, { interviewId, role, text }) => {
    const iv = await ctx.db.get(interviewId);
    if (!iv) return;
    await ctx.db.patch(interviewId, { turns: [...iv.turns, { role, text }] });
  },
});

export const setStatus = internalMutation({
  args: {
    interviewId: v.id("interviews"),
    status: v.union(v.literal("active"), v.literal("generating"), v.literal("complete")),
  },
  handler: async (ctx, { interviewId, status }) => {
    await ctx.db.patch(interviewId, { status });
  },
});

export const setDraft = internalMutation({
  args: {
    interviewId: v.id("interviews"),
    draft: v.object({
      title: v.string(),
      description: v.string(),
      goal: v.optional(v.string()),
      scenario: v.object({
        buyerName: v.string(),
        buyerTitle: v.string(),
        company: v.string(),
        personality: v.string(),
        objections: v.array(v.string()),
        difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"), v.literal("brutal")),
      }),
      objectives: v.array(v.string()),
      rubric: v.optional(
        v.array(v.object({ name: v.string(), weight: v.number(), description: v.string() })),
      ),
      voiceId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { interviewId, draft }) => {
    await ctx.db.patch(interviewId, { draft, status: "complete" });
  },
});

export const getInternal = internalMutation({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, { interviewId }) => ctx.db.get(interviewId),
});

/** Persist a voice-interview transcript (captured client-side) so it can be graded/generated. */
export const saveTranscript = mutation({
  args: {
    interviewId: v.id("interviews"),
    turns: v.array(
      v.object({ role: v.union(v.literal("assistant"), v.literal("manager")), text: v.string() }),
    ),
  },
  handler: async (ctx, { interviewId, turns }) => {
    await ctx.db.patch(interviewId, { turns });
  },
});
