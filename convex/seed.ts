import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const DAY = 86_400_000;
const PASS = 70;

// The ONE fake/demo account. Only this manager auto-loads the sample team + data;
// every real signup starts with a clean, empty team. Sign up with this email to
// explore a fully-populated demo workspace.
export const DEMO_EMAIL = "demo@rolecall.ai";

type Difficulty = "easy" | "medium" | "hard" | "brutal";
type Tone = "good" | "bad" | "neutral";

// ─────────────────────────────────────────────────────────────────────────────
// Modules — three published scenarios + one draft, each with a strong + weak call.
// ─────────────────────────────────────────────────────────────────────────────
type ModuleSeed = {
  key: string;
  title: string;
  description: string;
  scenario: {
    buyerName: string;
    buyerTitle: string;
    company: string;
    personality: string;
    objections: string[];
    difficulty: Difficulty;
  };
  objectives: string[];
  rubric: { name: string; weight: number; description: string }[];
  // A passing and a missing transcript, with the AI moments that go with each.
  strong: { lines: [string, string][]; moments: { timestamp: string; label: string; line: string; tone: Tone }[] };
  weak: { lines: [string, string][]; moments: { timestamp: string; label: string; line: string; tone: Tone }[] };
};

const MODULES: ModuleSeed[] = [
  {
    key: "discovery",
    title: "Discovery & Objection Handling",
    description: "Open strong and handle the buyer's top objection without getting defensive.",
    scenario: {
      buyerName: "Dana Okafor",
      buyerTitle: "VP of Finance Operations",
      company: "Meridian Health Group",
      personality:
        "You are measured, time-pressured, and skeptical after a painful ERP rollout. You respect specifics and dislike being 'sold to.'",
      objections: [
        "We just rolled out a new ERP — I'm not adding another tool",
        "Is this really a priority right now?",
        "Send me a one-pager and I'll look later",
      ],
      difficulty: "hard",
    },
    objectives: [
      "Open with a quantified, relevant hook in the first 15 seconds",
      "Reframe the 'we already have a tool' objection with a specific differentiator",
      "Tie value to the buyer's numbers, not features",
      "Close by proposing a 20-minute working session with an agenda",
    ],
    rubric: [
      { name: "Opening hook", weight: 25, description: "Specific, quantified, relevant in the first 15 seconds." },
      { name: "Objection handling", weight: 30, description: "Reframes 'we already have a tool' with a concrete gap." },
      { name: "Value framing", weight: 20, description: "Ties value to Dana's numbers, not features." },
      { name: "Closing", weight: 25, description: "Books a specific working session with an agenda." },
    ],
    strong: {
      lines: [
        ["Rep", "Hi Dana, thanks for the seven minutes — I'll be quick. I saw Meridian consolidated two regional clinics last quarter; that usually doubles the manual reconciliation load on finance ops."],
        ["Buyer", "It has, honestly. But we just finished a brutal ERP rollout — I'm not adding another tool."],
        ["Rep", "Totally fair, and I'm not asking you to rip anything out. We sit on top of the ERP and clear the exceptions it kicks back — the line items your team re-keys by hand at month-end."],
        ["Buyer", "How is that different from the macros my team already built?"],
        ["Rep", "Macros break the moment the data's messy. At a health system your size we cut exception handling by about 40%, which gave finance back roughly three days every close."],
        ["Buyer", "Three days would matter. But is this really a priority right now?"],
        ["Rep", "That's the right question. If month-end is costing your two senior analysts a weekend every cycle, the cost of waiting is burnout and turnover — not software."],
        ["Buyer", "Send me a one-pager and I'll look later."],
        ["Rep", "Happy to — but a one-pager can't show your data. Let's do a focused 20-minute working session Thursday; I'll map it to your actual close calendar and you decide from there."],
        ["Buyer", "Thursday at 2 works."],
        ["Rep", "Booked. I'll send an agenda so it earns the 20 minutes."],
      ],
      moments: [
        { timestamp: "00:09", label: "Hook", line: "I saw Meridian consolidated two regional clinics last quarter; that usually doubles the manual reconciliation load.", tone: "good" },
        { timestamp: "00:41", label: "Objection reframe", line: "We sit on top of the ERP and clear the exceptions it kicks back.", tone: "good" },
        { timestamp: "02:50", label: "Close", line: "Let's do a focused 20-minute working session Thursday.", tone: "good" },
      ],
    },
    weak: {
      lines: [
        ["Rep", "Hey Dana, um, so we're a finance automation platform and I wanted to walk you through what we do."],
        ["Buyer", "I've got a few minutes, but we just rolled out a new ERP — I'm not adding another tool."],
        ["Rep", "Right, but ours is, like, really different. We've got reconciliation, reporting, dashboards — basically everything."],
        ["Buyer", "Is this really a priority right now?"],
        ["Rep", "I mean, it could save you a lot of time. Most of our customers really like it."],
        ["Buyer", "Send me a one-pager and I'll look later."],
        ["Rep", "Sure, I can email that over. Should I just send it to this address?"],
        ["Buyer", "That's fine. Thanks."],
        ["Rep", "Okay, um, I'll follow up next week maybe."],
      ],
      moments: [
        { timestamp: "00:06", label: "Weak open", line: "we're a finance automation platform and I wanted to walk you through what we do.", tone: "bad" },
        { timestamp: "00:33", label: "Feature dump", line: "reconciliation, reporting, dashboards — basically everything.", tone: "bad" },
        { timestamp: "01:40", label: "No next step", line: "I'll follow up next week maybe.", tone: "bad" },
      ],
    },
  },
  {
    key: "pricing",
    title: "Pricing Pushback Drill",
    description: "Hold your price and sell value when the buyer anchors low.",
    scenario: {
      buyerName: "Greg Tan",
      buyerTitle: "Procurement Lead",
      company: "Volta Manufacturing",
      personality: "You are blunt and budget-obsessed. You anchor low and test whether the rep will cave.",
      objections: ["That's way over budget", "Your competitor is cheaper", "Give me 30% off"],
      difficulty: "brutal",
    },
    objectives: [
      "Acknowledge budget without immediately discounting",
      "Re-anchor on value and the cost of inaction",
      "Trade concessions for commitments, never give freely",
      "Hold a defensible floor and confirm next step",
    ],
    rubric: [
      { name: "Composure on price", weight: 25, description: "Doesn't flinch or discount on the first push." },
      { name: "Value re-anchor", weight: 30, description: "Reframes on outcomes / cost of inaction, not features." },
      { name: "Concession trading", weight: 30, description: "Every give is tied to a get (term, reference, volume)." },
      { name: "Next step", weight: 15, description: "Lands a concrete next step with terms in writing." },
    ],
    strong: {
      lines: [
        ["Rep", "Greg, I know procurement's job is to get the best deal, so let me be direct about value before we talk number."],
        ["Buyer", "Good, because that's way over budget."],
        ["Rep", "Over budget versus what — is that a hard ceiling, or where you'd like to land?"],
        ["Buyer", "Your competitor is cheaper. Give me 30% off."],
        ["Rep", "They are cheaper up front. The gap is go-live: their average is five months, ours is six weeks. On a line this size, four lost months is the real cost."],
        ["Buyer", "Nice story. I still need 30%."],
        ["Rep", "I can't move 30 on price without changing scope — but commit to a two-year term and a reference and I can get you to 12 and lock next year's rate."],
        ["Buyer", "Make it 18."],
        ["Rep", "15, with the two-year commit and the case study. That protects the value for both of us. Deal?"],
        ["Buyer", "Send me the revised quote. If the terms are what you said, we're close."],
        ["Rep", "You'll have it within the hour with the terms in writing."],
      ],
      moments: [
        { timestamp: "00:18", label: "Diagnose the ceiling", line: "Is that a hard ceiling, or where you'd like to land?", tone: "good" },
        { timestamp: "01:02", label: "Value re-anchor", line: "Four lost months is the real cost.", tone: "good" },
        { timestamp: "02:11", label: "Concession trade", line: "15, with the two-year commit and the case study.", tone: "good" },
      ],
    },
    weak: {
      lines: [
        ["Rep", "Hi Greg, so about pricing — I know it's a bit high."],
        ["Buyer", "That's way over budget. Your competitor is cheaper."],
        ["Rep", "Yeah, I hear that a lot. I might be able to get you a discount."],
        ["Buyer", "Give me 30% off."],
        ["Rep", "Um, let me check with my manager, I think we could probably do that."],
        ["Buyer", "So 30% is fine?"],
        ["Rep", "Probably? I'll confirm and get back to you."],
        ["Buyer", "Send it over."],
      ],
      moments: [
        { timestamp: "00:14", label: "Caved early", line: "I might be able to get you a discount.", tone: "bad" },
        { timestamp: "00:40", label: "Gave without a get", line: "let me check with my manager, I think we could probably do that.", tone: "bad" },
        { timestamp: "01:05", label: "No commitment", line: "Probably? I'll confirm and get back to you.", tone: "bad" },
      ],
    },
  },
  {
    key: "outbound",
    title: "Cold Outbound Opener",
    description: "Earn 30 seconds on a cold call and turn it into a real conversation.",
    scenario: {
      buyerName: "Renee Park",
      buyerTitle: "Chief Operating Officer",
      company: "Harbor Logistics",
      personality: "You are busy and friendly but allergic to pitches. You'll happily take materials to avoid committing.",
      objections: ["Just send me a deck", "I'll loop in my team", "Let's reconnect next quarter"],
      difficulty: "medium",
    },
    objectives: [
      "Earn the next 30 seconds with a permission-based opener",
      "Lead with a relevant, specific observation — not a pitch",
      "Avoid the 'send me a deck' trap with a reason to meet",
      "Propose a specific day/time with an agenda",
    ],
    rubric: [
      { name: "Permission opener", weight: 25, description: "Disarms with a credible 30-second ask." },
      { name: "Relevance", weight: 30, description: "Specific observation tied to Harbor's world." },
      { name: "Deck-trap escape", weight: 25, description: "Turns 'send a deck' into a reason to meet." },
      { name: "Specific close", weight: 20, description: "Lands a day/time with an agenda." },
    ],
    strong: {
      lines: [
        ["Rep", "Renee, you don't know me — give me 30 seconds and then you can tell me to go away. Fair?"],
        ["Buyer", "...Go ahead, the clock's running."],
        ["Rep", "Harbor added two distribution lanes this year. Most COOs I talk to say new lanes wreck their on-time-delivery numbers for a quarter before they stabilize."],
        ["Buyer", "That's annoyingly accurate. But just send me a deck."],
        ["Rep", "I will — but a deck can't tell me whether it's your carrier mix or your dock scheduling. That's a 15-minute conversation, not a PDF."],
        ["Buyer", "I'll loop in my team."],
        ["Rep", "Perfect — bring whoever owns OTD. Wednesday morning I'll come with two benchmarks from logistics ops your size. Does 9 work?"],
        ["Buyer", "Wednesday at 9. Don't waste it."],
        ["Rep", "Agenda's in your inbox today. Talk Wednesday."],
      ],
      moments: [
        { timestamp: "00:04", label: "Permission opener", line: "Give me 30 seconds and then you can tell me to go away.", tone: "good" },
        { timestamp: "00:22", label: "Relevant hook", line: "New lanes wreck their on-time-delivery numbers for a quarter.", tone: "good" },
        { timestamp: "01:18", label: "Specific close", line: "Wednesday morning... Does 9 work?", tone: "good" },
      ],
    },
    weak: {
      lines: [
        ["Rep", "Hi Renee, do you have a few minutes to talk about your logistics operations?"],
        ["Buyer", "Not really, but go ahead."],
        ["Rep", "We help companies improve their supply chain efficiency with our platform."],
        ["Buyer", "Just send me a deck."],
        ["Rep", "Sure! It's got all our features and a few case studies in it."],
        ["Buyer", "Great, send it over and let's reconnect next quarter."],
        ["Rep", "Sounds good, I'll email it right now."],
      ],
      moments: [
        { timestamp: "00:03", label: "Permission miss", line: "do you have a few minutes to talk about your logistics operations?", tone: "bad" },
        { timestamp: "00:21", label: "Generic value", line: "We help companies improve their supply chain efficiency.", tone: "bad" },
        { timestamp: "00:48", label: "Took the deck trap", line: "I'll email it right now.", tone: "bad" },
      ],
    },
  },
];

const DRAFT_MODULE = {
  title: "Multi-threading the Champion",
  description: "Turn a single friendly contact into a coalition before the deal stalls.",
  scenario: {
    buyerName: "Lena Voss",
    buyerTitle: "Director of Operations",
    company: "Cedar & Co.",
    personality: "You like the rep and the product, but you're conflict-averse and won't introduce your CFO without a reason.",
    objections: ["I can take this to my boss for you", "We don't need to involve finance yet", "Let me champion it internally"],
    difficulty: "hard" as const,
  },
  objectives: [
    "Map the buying committee without sounding like you distrust the champion",
    "Give the champion a reason their boss will care",
    "Secure a multi-stakeholder next step",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Reps — each with a realistic trajectory across modules (improvement over time).
// ─────────────────────────────────────────────────────────────────────────────
type Trajectory = { mod: number; score: number; daysAgo: number }[];
type RepSeed = { name: string; title: string; runs: Trajectory };

const REPS: RepSeed[] = [
  {
    name: "Priya Nair",
    title: "Account Executive",
    runs: [
      { mod: 0, score: 62, daysAgo: 12 },
      { mod: 0, score: 78, daysAgo: 7 },
      { mod: 2, score: 85, daysAgo: 3 },
      { mod: 1, score: 80, daysAgo: 1 },
    ],
  },
  {
    name: "Marcus Hill",
    title: "Account Executive",
    runs: [
      { mod: 0, score: 55, daysAgo: 10 },
      { mod: 0, score: 64, daysAgo: 5 },
      { mod: 2, score: 69, daysAgo: 2 },
    ],
  },
  {
    name: "Elena Cruz",
    title: "Sr. Account Executive",
    runs: [
      { mod: 0, score: 88, daysAgo: 9 },
      { mod: 1, score: 92, daysAgo: 4 },
      { mod: 2, score: 90, daysAgo: 1 },
    ],
  },
  {
    name: "Tom Becker",
    title: "Sales Development Rep",
    runs: [
      { mod: 0, score: 41, daysAgo: 13 },
      { mod: 0, score: 52, daysAgo: 6 },
      { mod: 2, score: 66, daysAgo: 2 },
    ],
  },
  {
    name: "Jordan Lee",
    title: "Account Executive",
    runs: [
      { mod: 0, score: 71, daysAgo: 8 },
      { mod: 1, score: 68, daysAgo: 3 },
    ],
  },
  {
    name: "Sana Iqbal",
    title: "Sales Development Rep",
    runs: [
      { mod: 0, score: 48, daysAgo: 11 },
      { mod: 2, score: 63, daysAgo: 4 },
      { mod: 0, score: 74, daysAgo: 1 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic helpers (stable across reseeds; no Math.random needed).
// ─────────────────────────────────────────────────────────────────────────────
function rnd(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x); // 0..1
}
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Place an attempt on a realistic weekday business hour `daysAgo` in the past. */
function businessTime(now: number, daysAgo: number, seed: number): number {
  const d = new Date(now - daysAgo * DAY);
  // Nudge weekends back to Friday so the timeline reads like a work week.
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() - 2);
  else if (dow === 6) d.setDate(d.getDate() - 1);
  d.setHours(9 + Math.floor(rnd(seed) * 8), Math.floor(rnd(seed + 1) * 60), 0, 0);
  return d.getTime();
}

const STRONG_FIXES: Record<string, string[]> = {
  discovery: [
    "Quantify the hook even harder — name the dollar or hours figure first.",
    "Get one more discovery question in before reframing the objection.",
    "Confirm the agenda owner so the working session doesn't slip.",
  ],
  pricing: [
    "Anchor your value number before they say theirs.",
    "Bank the reference commitment in writing on the call.",
    "Name the floor once and stop negotiating against yourself.",
  ],
  outbound: [
    "Tighten the opener to a single sentence.",
    "Lead with the metric, not the company observation.",
    "Send the agenda before you hang up, not 'today.'",
  ],
};
const WEAK_FIXES: Record<string, string[]> = {
  discovery: [
    "Open with a quantified, relevant hook — not 'we're a platform.'",
    "When they push back, ask what the ERP can't do before pitching.",
    "Propose a specific time + agenda; never settle for 'send a one-pager.'",
  ],
  pricing: [
    "Do not offer a discount on the first push — diagnose the ceiling first.",
    "Re-anchor on cost of inaction before touching price.",
    "Trade every concession for a commitment; stop checking with your manager.",
  ],
  outbound: [
    "Earn the time with a permission-based opener.",
    "Replace 'improve efficiency' with a specific, relevant observation.",
    "Never accept 'send a deck' without a reason to meet.",
  ],
};
const STRONG_VERDICTS = [
  "Earned the next step — that would move the deal.",
  "Controlled the call and closed clean.",
  "Reframed the objection and landed a real commitment.",
];
const WEAK_VERDICTS = [
  "No next step — you let them off the hook.",
  "Pitched features and folded on the objection.",
  "Took the brush-off instead of creating a reason to meet.",
];

type GradeShape = {
  verdict: { decision: "pass" | "fail"; line: string };
  fixes: string[];
  objectiveHits: { objective: string; met: boolean; note: string }[];
  rubricScores: { name: string; weight: number; score: number; note: string }[];
  analytics: { talkRatio: number; fillerCount: number; wordsPerMin: number; questionsAsked: number; longestMonologueSec: number };
  moments: { timestamp: string; label: string; line: string; tone: Tone }[];
};

function buildGrade(m: ModuleSeed, score: number, seed: number): GradeShape {
  const passed = score >= PASS;
  const good = passed;
  const call = passed ? m.strong : m.weak;

  const metCount = Math.max(passed ? 2 : 0, Math.min(m.objectives.length, Math.round((m.objectives.length * score) / 100)));
  const objectiveHits = m.objectives.map((o, i) => ({
    objective: o,
    met: i < metCount,
    note: i < metCount ? "Hit this cleanly." : "Missed — see the fixes.",
  }));

  const rubricScores = m.rubric.map((r, i) => ({
    name: r.name,
    weight: r.weight,
    score: clamp(score + (rnd(seed + i) - 0.5) * 16),
    note: "",
  }));

  const analytics = {
    talkRatio: good ? 46 + Math.round(rnd(seed) * 10) : 66 + Math.round(rnd(seed) * 12),
    fillerCount: good ? 2 + Math.round(rnd(seed + 1) * 3) : 7 + Math.round(rnd(seed + 1) * 5),
    wordsPerMin: good ? 134 + Math.round(rnd(seed + 2) * 18) : 165 + Math.round(rnd(seed + 2) * 25),
    questionsAsked: good ? 4 + Math.round(rnd(seed + 3) * 3) : 1 + Math.round(rnd(seed + 3)),
    longestMonologueSec: good ? 18 + Math.round(rnd(seed + 4) * 10) : 40 + Math.round(rnd(seed + 4) * 16),
  };

  const verdictPool = passed ? STRONG_VERDICTS : WEAK_VERDICTS;
  const fixesPool = passed ? STRONG_FIXES : WEAK_FIXES;

  return {
    verdict: { decision: passed ? "pass" : "fail", line: verdictPool[Math.floor(rnd(seed + 5) * verdictPool.length)] },
    fixes: fixesPool[m.key],
    objectiveHits,
    rubricScores,
    analytics,
    moments: call.moments,
  };
}

function transcriptOf(m: ModuleSeed, passed: boolean): string {
  const lines = (passed ? m.strong : m.weak).lines;
  return lines.map(([who, text]) => `${who}: ${text}`).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// The builder — inserts reps, modules, assignments, attempts, and suggestions.
// ─────────────────────────────────────────────────────────────────────────────
async function buildDemo(ctx: MutationCtx, managerId: Id<"users">, orgId: Id<"orgs">) {
  const now = Date.now();

  // Reps
  const repIds: Id<"users">[] = [];
  for (const r of REPS) {
    const id = await ctx.db.insert("users", {
      name: r.name,
      title: r.title,
      role: "rep",
      orgId,
      managerId,
      email: `${r.name.toLowerCase().replace(/\s+/g, ".")}@demo.rolecall.ai`,
    });
    repIds.push(id);
  }

  // Published modules
  const moduleIds: Id<"modules">[] = [];
  for (let i = 0; i < MODULES.length; i++) {
    const m = MODULES[i];
    const id = await ctx.db.insert("modules", {
      orgId,
      createdBy: managerId,
      title: m.title,
      description: m.description,
      scenario: m.scenario,
      objectives: m.objectives,
      rubric: m.rubric,
      rubricApproved: true,
      passThreshold: PASS,
      status: "published",
      publishedAt: now - (16 - i * 3) * DAY,
      kind: "team",
    });
    moduleIds.push(id);
  }

  // Attempts (all terminal/"done" — no perpetually-active calls) + per-rep/module bests.
  // best[repIdx][modIdx] = highest score; passed if any attempt passed.
  const best: Record<number, Record<number, { score: number; passed: boolean }>> = {};
  let seedCounter = 1;
  for (let ri = 0; ri < REPS.length; ri++) {
    best[ri] = {};
    for (const run of REPS[ri].runs) {
      const m = MODULES[run.mod];
      const passed = run.score >= PASS;
      const startedAt = businessTime(now, run.daysAgo, (seedCounter += 7));
      const durationSec = 150 + Math.round(rnd(seedCounter) * 230);
      const grade = buildGrade(m, run.score, seedCounter);
      await ctx.db.insert("attempts", {
        moduleId: moduleIds[run.mod],
        repId: repIds[ri],
        managerId,
        status: "done",
        visibility: "team",
        startedAt,
        endedAt: startedAt + durationSec * 1000,
        callTranscript: transcriptOf(m, passed),
        score: run.score,
        passed,
        verdict: grade.verdict,
        fixes: grade.fixes,
        objectiveHits: grade.objectiveHits,
        rubricScores: grade.rubricScores,
        analytics: grade.analytics,
        moments: grade.moments,
      });
      const cur = best[ri][run.mod];
      if (!cur || run.score > cur.score) best[ri][run.mod] = { score: run.score, passed: passed || (cur?.passed ?? false) };
    }
  }

  // Assignments: every published module to every rep, status reflecting their attempts.
  for (let ri = 0; ri < REPS.length; ri++) {
    for (let mi = 0; mi < moduleIds.length; mi++) {
      const b = best[ri][mi];
      await ctx.db.insert("assignments", {
        moduleId: moduleIds[mi],
        repId: repIds[ri],
        managerId,
        assignedAt: now - 15 * DAY,
        status: b ? (b.passed ? "passed" : "in_progress") : "assigned",
        bestScore: b?.score,
      });
    }
  }

  // A draft module the manager hasn't published yet.
  await ctx.db.insert("modules", {
    orgId,
    createdBy: managerId,
    title: DRAFT_MODULE.title,
    description: DRAFT_MODULE.description,
    scenario: DRAFT_MODULE.scenario,
    objectives: DRAFT_MODULE.objectives,
    passThreshold: PASS,
    status: "draft",
    kind: "team",
  });

  // A couple of pending AI suggestions grounded in the seeded weak spots.
  await ctx.db.insert("suggestions", {
    managerId,
    rationale:
      "Across recent calls reps lose the most ground on closing — only Elena and Priya consistently book a concrete next step. A focused closing drill should lift pass rates fastest.",
    draft: {
      title: "Closing the Next Step",
      description: "Practice landing a specific, agenda'd next meeting instead of 'send me something.'",
      scenario: {
        buyerName: "Renee Park",
        buyerTitle: "COO",
        company: "Harbor Logistics",
        personality: "You are friendly but noncommittal. You'll happily take materials to avoid committing to a meeting.",
        objections: ["Just send me a deck", "I'll loop in my team", "Let's reconnect next quarter"],
        difficulty: "medium",
      },
      objectives: [
        "Propose a specific day/time, not an open-ended follow-up",
        "Attach a clear agenda to the next step",
        "Get a verbal commitment before ending the call",
      ],
    },
    status: "pending",
  });

  await ctx.db.insert("suggestions", {
    managerId,
    rationale:
      "Tom and Sana are improving but still fold on price. A brutal procurement scenario would harden their concession-trading before it costs a live deal.",
    draft: {
      title: "Never Discount Alone",
      description: "Hold a defensible floor and trade every concession for a commitment.",
      scenario: {
        buyerName: "Greg Tan",
        buyerTitle: "Procurement Lead",
        company: "Volta Manufacturing",
        personality: "You are blunt and budget-obsessed. You anchor low and test whether the rep will cave.",
        objections: ["That's way over budget", "Your competitor is cheaper", "Give me 30% off"],
        difficulty: "brutal",
      },
      objectives: [
        "Acknowledge budget without immediately discounting",
        "Re-anchor on value and cost of inaction",
        "Trade concessions for commitments, never give freely",
      ],
    },
    status: "pending",
  });

  return moduleIds[0];
}

/** Remove this manager's demo data (fake reps + everything they created). */
async function deleteDemo(ctx: MutationCtx, managerId: Id<"users">, orgId: Id<"orgs">) {
  // Attempts owned by this manager (includes any stuck "active"/"scoring" calls).
  const attempts = await ctx.db
    .query("attempts")
    .withIndex("by_manager", (q) => q.eq("managerId", managerId))
    .collect();
  for (const a of attempts) await ctx.db.delete(a._id);

  // Modules this manager created + their assignments.
  const modules = await ctx.db
    .query("modules")
    .withIndex("by_creator", (q) => q.eq("createdBy", managerId))
    .collect();
  for (const m of modules) {
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_module", (q) => q.eq("moduleId", m._id))
      .collect();
    for (const asg of assignments) await ctx.db.delete(asg._id);
    await ctx.db.delete(m._id);
  }

  // Suggestions in every status.
  for (const status of ["pending", "approved", "dismissed"] as const) {
    const sugg = await ctx.db
      .query("suggestions")
      .withIndex("by_manager_status", (q) => q.eq("managerId", managerId).eq("status", status))
      .collect();
    for (const s of sugg) await ctx.db.delete(s._id);
  }

  // Fake demo reps (never touch real teammates).
  const members = await ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect();
  for (const u of members) {
    if (u.role === "rep" && (u.email ?? "").endsWith("@demo.rolecall.ai")) await ctx.db.delete(u._id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Idempotent first-run seed (auto-called from the app shell for new managers). */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const me = await ctx.db.get(userId);
    if (!me || me.role !== "manager" || !me.orgId) return { seeded: false };
    // Only the dedicated demo account gets fake data — real teams start empty.
    if (me.email !== DEMO_EMAIL) return { seeded: false };

    const existing = await ctx.db
      .query("modules")
      .withIndex("by_creator", (q) => q.eq("createdBy", userId))
      .first();
    if (existing) return { seeded: false };

    const moduleId = await buildDemo(ctx, userId, me.orgId);
    return { seeded: true, moduleId };
  },
});

/** Wipe this manager's demo data and rebuild it fresh (for the signed-in manager). */
export const resetDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const me = await ctx.db.get(userId);
    if (!me || me.role !== "manager" || !me.orgId) return { reseeded: false };
    await deleteDemo(ctx, userId, me.orgId);
    const moduleId = await buildDemo(ctx, userId, me.orgId);
    return { reseeded: true, moduleId };
  },
});

/**
 * DEV ONLY (no auth) — reseed every manager on this deployment. Used to refresh
 * the local demo from the CLI: `npx convex run seed:devReseedAll`.
 */
export const devReseedAll = mutation({
  args: {},
  handler: async (ctx) => {
    const managers = (await ctx.db.query("users").collect()).filter((u) => u.role === "manager" && u.orgId);
    let count = 0;
    for (const m of managers) {
      await deleteDemo(ctx, m._id, m.orgId as Id<"orgs">);
      await buildDemo(ctx, m._id, m.orgId as Id<"orgs">);
      count++;
    }
    // Purge any stuck/abandoned calls left over from manual testing (e.g. private
    // drills whose owner isn't one of the reseeded managers).
    const stuck = (await ctx.db.query("attempts").collect()).filter(
      (a) => a.status !== "done" && Date.now() - a.startedAt > 30 * 60 * 1000,
    );
    for (const a of stuck) await ctx.db.delete(a._id);
    return { reseededManagers: count, purgedStuck: stuck.length };
  },
});

export const seedState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const me = await ctx.db.get(userId);
    if (!me) return null;
    // Only the dedicated demo account auto-seeds; real managers start empty.
    if (me.role !== "manager" || me.email !== DEMO_EMAIL) return { needsSeed: false };
    const first = await ctx.db
      .query("modules")
      .withIndex("by_creator", (q) => q.eq("createdBy", userId))
      .first();
    return { needsSeed: !first };
  },
});
