import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const difficulty = v.union(
  v.literal("easy"),
  v.literal("medium"),
  v.literal("hard"),
  v.literal("brutal"),
);

// A practice scenario (the AI buyer a rep pitches to).
const scenario = v.object({
  buyerName: v.string(),
  buyerTitle: v.string(),
  company: v.string(),
  personality: v.string(),
  objections: v.array(v.string()),
  difficulty,
});

// A weighted rubric criterion (AI-generated, manager-approved, per module).
const rubricCriterion = v.object({
  name: v.string(),
  weight: v.number(), // 0..100, should sum ~100
  description: v.string(),
});

// A proposed module shape used in drafts and AI suggestions (no ids yet).
export const moduleDraft = v.object({
  title: v.string(),
  description: v.string(),
  goal: v.optional(v.string()),
  scenario,
  objectives: v.array(v.string()),
  rubric: v.optional(v.array(rubricCriterion)),
  voiceId: v.optional(v.string()), // ElevenLabs voice for the buyer
});

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App fields
    role: v.optional(v.union(v.literal("rep"), v.literal("manager"))),
    title: v.optional(v.string()), // e.g. "Account Executive"
    job: v.optional(v.string()), // what they actually sell / do
    company: v.optional(v.string()),
    orgId: v.optional(v.id("orgs")),
    managerId: v.optional(v.id("users")), // reps point at their manager
  })
    .index("email", ["email"])
    .index("by_manager", ["managerId"])
    .index("by_org", ["orgId"]),

  orgs: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    company: v.optional(v.string()),
    website: v.optional(v.string()),
    inviteCode: v.optional(v.string()),
    // Rich background captured at onboarding — grounds AI module-building.
    context: v.optional(v.string()),
    enrichment: v.optional(
      v.object({
        summary: v.string(),
        industry: v.optional(v.string()),
        size: v.optional(v.string()),
        website: v.optional(v.string()),
        source: v.string(),
      }),
    ),
  }).index("by_invite", ["inviteCode"]),

  // The manager's AI interview that produces a training module.
  interviews: defineTable({
    managerId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("generating"), v.literal("complete")),
    turns: v.array(
      v.object({
        role: v.union(v.literal("assistant"), v.literal("manager")),
        text: v.string(),
      }),
    ),
    draft: v.optional(moduleDraft), // generated module draft (editable before publish)
    moduleId: v.optional(v.id("modules")),
  }).index("by_manager", ["managerId"]),

  // A training module: a scenario + objectives reps must demonstrate.
  modules: defineTable({
    orgId: v.optional(v.id("orgs")),
    createdBy: v.id("users"),
    interviewId: v.optional(v.id("interviews")),
    title: v.string(),
    description: v.string(),
    // One-sentence goal: what the rep should walk away able to do.
    goal: v.optional(v.string()),
    scenario,
    objectives: v.array(v.string()),
    rubric: v.optional(v.array(rubricCriterion)),
    rubricApproved: v.optional(v.boolean()),
    voiceId: v.optional(v.string()), // ElevenLabs voice for the buyer in practice calls
    passThreshold: v.number(), // score needed to "pass" (default 70)
    status: v.union(v.literal("draft"), v.literal("scheduled"), v.literal("published")),
    scheduledFor: v.optional(v.number()), // ms epoch; cron publishes when due
    publishedAt: v.optional(v.number()),
    // "team" = manager module; "personal" = a rep's private drill (never shown to the manager).
    kind: v.optional(v.union(v.literal("team"), v.literal("personal"))),
    ownerRepId: v.optional(v.id("users")),
  })
    .index("by_creator", ["createdBy"])
    .index("by_org", ["orgId"]),

  // A module assigned to a rep.
  assignments: defineTable({
    moduleId: v.id("modules"),
    repId: v.id("users"),
    managerId: v.id("users"),
    assignedAt: v.number(),
    status: v.union(v.literal("assigned"), v.literal("in_progress"), v.literal("passed")),
    bestScore: v.optional(v.number()),
  })
    .index("by_rep", ["repId"])
    .index("by_module", ["moduleId"])
    .index("by_rep_module", ["repId", "moduleId"]),

  // A rep's practice attempt against a module.
  attempts: defineTable({
    moduleId: v.id("modules"),
    repId: v.id("users"),
    managerId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("scoring"), v.literal("done")),
    // "private" practice never rolls up to the manager.
    visibility: v.optional(v.union(v.literal("team"), v.literal("private"))),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    callTranscript: v.optional(v.string()),
    elevenLabsCallId: v.optional(v.string()),
    score: v.optional(v.number()),
    passed: v.optional(v.boolean()),
    // Manager coaching note left on a specific attempt (visible to the rep too).
    coachNote: v.optional(v.string()),
    coachNoteAt: v.optional(v.number()),
    verdict: v.optional(v.object({ decision: v.union(v.literal("pass"), v.literal("fail")), line: v.string() })),
    fixes: v.optional(v.array(v.string())),
    objectiveHits: v.optional(
      v.array(v.object({ objective: v.string(), met: v.boolean(), note: v.string() })),
    ),
    rubricScores: v.optional(
      v.array(v.object({ name: v.string(), weight: v.number(), score: v.number(), note: v.string() })),
    ),
    analytics: v.optional(
      v.object({
        talkRatio: v.number(), // % of words spoken by the rep
        fillerCount: v.number(),
        wordsPerMin: v.number(),
        questionsAsked: v.number(),
        longestMonologueSec: v.number(),
      }),
    ),
    moments: v.optional(
      v.array(
        v.object({
          timestamp: v.string(),
          label: v.string(),
          line: v.string(),
          tone: v.union(v.literal("good"), v.literal("bad"), v.literal("neutral")),
        }),
      ),
    ),
  })
    .index("by_rep", ["repId"])
    .index("by_module", ["moduleId"])
    .index("by_rep_module", ["repId", "moduleId"])
    .index("by_elevenlabs_call", ["elevenLabsCallId"])
    .index("by_manager", ["managerId"]),

  // AI-drafted module suggestions for the manager, based on rep performance.
  suggestions: defineTable({
    managerId: v.id("users"),
    rationale: v.string(),
    draft: moduleDraft,
    basedOnModuleId: v.optional(v.id("modules")),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("dismissed")),
  }).index("by_manager_status", ["managerId", "status"]),

  // The Hivemind chat: a persisted conversation between a user and the collective
  // AI mind. Managers chat in "team" scope (whole org's data); reps chat in
  // "personal" scope (their own). The assistant can attach reference chips (links
  // to reps/modules/attempts) and a drafted course the user can approve.
  hivemindThreads: defineTable({
    ownerId: v.id("users"),
    scope: v.union(v.literal("team"), v.literal("personal")),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        at: v.number(),
        // Things the assistant looked at — rendered as clickable chips.
        refs: v.optional(
          v.array(
            v.object({
              kind: v.union(v.literal("rep"), v.literal("module"), v.literal("attempt")),
              id: v.string(),
              label: v.string(),
              reason: v.optional(v.string()),
            }),
          ),
        ),
        // A personalized course the assistant drafted, awaiting the user's approval.
        draft: v.optional(
          v.object({
            module: moduleDraft,
            repId: v.optional(v.id("users")),
            repName: v.optional(v.string()),
            createdModuleId: v.optional(v.id("modules")),
          }),
        ),
      }),
    ),
    lastAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // Cached Composio auth-config ids per toolkit (created once, reused for everyone).
  composioAuthConfigs: defineTable({
    toolkitSlug: v.string(),
    authConfigId: v.string(),
  }).index("by_slug", ["toolkitSlug"]),
});
