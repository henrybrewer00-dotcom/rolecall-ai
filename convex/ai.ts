"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { activeToolkits, chatWithComposio } from "./composioAI";

const TOOLKIT_LABELS: Record<string, string> = {
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
};
const labelToolkits = (slugs: string[]) => slugs.map((s) => TOOLKIT_LABELS[s] ?? s).join(", ");

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";

/** Prefer Cerebras (near-instant inference) when configured; fall back to OpenAI. */
function llm(): { url: string; key: string | undefined; model: string } {
  const cerebras = process.env.CEREBRAS_API_KEY;
  if (cerebras) return { url: CEREBRAS_URL, key: cerebras, model: "gemma-4-31b" };
  return { url: OPENAI_URL, key: process.env.OPENAI_API_KEY, model: "gpt-4o" };
}

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function openaiJSON(messages: ChatMsg[], temperature = 0.6): Promise<any | null> {
  const { url, key, model } = llm();
  if (!key) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature, max_tokens: 4000, response_format: { type: "json_object" }, messages }),
  });
  if (!res.ok) {
    console.error("LLM error", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  try {
    return JSON.parse(data?.choices?.[0]?.message?.content);
  } catch (e) {
    console.error("parse error", e);
    return null;
  }
}


function normDifficulty(d: any): "easy" | "medium" | "hard" | "brutal" {
  return ["easy", "medium", "hard", "brutal"].includes(d) ? d : "medium";
}

/** Render what we already know about the manager + business into a prompt block. */
function formatBusinessContext(c: any | null): string {
  if (!c) return "";
  const lines: string[] = [];
  if (c.managerName) lines.push(`- Sales leader (the person you're talking to): ${c.managerName}${c.title ? `, ${c.title}` : ""}`);
  const biz = c.company ?? c.orgName;
  if (biz) lines.push(`- Business / team: ${biz}`);
  if (c.job) lines.push(`- What the team sells / does: ${c.job}`);
  if (c.enrichment?.summary) {
    const extra = [c.enrichment.industry, c.enrichment.size].filter(Boolean).join(", ");
    lines.push(`- Company: ${c.enrichment.summary}${extra ? ` (${extra})` : ""}`);
  }
  if (c.context) lines.push(`- Background they gave: ${c.context}`);
  return lines.length ? lines.join("\n") : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// interviewRespond — advance the manager's module-building interview
// ─────────────────────────────────────────────────────────────────────────────
export const interviewRespond = action({
  args: { interviewId: v.id("interviews"), answer: v.string() },
  handler: async (ctx, { interviewId, answer }): Promise<{ readyToGenerate: boolean }> => {
    await ctx.runMutation(internal.interviews.appendTurn, { interviewId, role: "manager", text: answer });
    const iv = await ctx.runMutation(internal.interviews.getInternal, { interviewId });
    if (!iv) return { readyToGenerate: false };

    const history: ChatMsg[] = iv.turns.map((t: any) => ({
      role: t.role === "assistant" ? "assistant" : "user",
      content: t.text,
    }));

    const bizCtx = await ctx.runQuery(internal.users.interviewContext, { managerId: iv.managerId });
    const bizBlock = formatBusinessContext(bizCtx);

    // Offer to ground the module in real data: a connected-app prospect and/or a real place.
    const connectedToolkits = await activeToolkits(iv.managerId as string);
    const pullBits: string[] = [];
    if (connectedToolkits.length) pullBits.push(`pull a real prospect from a connected app (${labelToolkits(connectedToolkits)})`);
    pullBits.push("look up a specific real business/place they name (e.g. a restaurant) and pull its real details + customer reviews");
    const pullClause = `BEFORE you set readyToGenerate to true, ask ONE last question: whether they'd like you to ${pullBits.join(", or ")} — to make the buyer authentic. Acknowledge their answer, then set readyToGenerate true. `;

    // Live research: if they named a real business — or described a target segment —
    // look it up (fast, via Orange Slice + knowledge) and REPORT it in the reply.
    // Cheap now that we're on Cerebras, so we run it every turn.
    let placeContext = "";
    try {
      const ex = await openaiJSON([
        {
          role: "system",
          content:
            'From the user\'s latest message, identify a real business to base a sales roleplay on. ' +
            'If they NAME a specific real business/place, return it (include city/state if they gave one). ' +
            'If they describe a TARGET SEGMENT without naming one (e.g. "large enterprises", "small coffee shops", "mid-market SaaS"), return ONE well-known REAL company that represents that segment. ' +
            'If neither applies, return null. Return ONLY JSON {"place": "<name>" | null}.',
        },
        { role: "user", content: answer },
      ]);
      const place = ex?.place && String(ex.place).toLowerCase() !== "null" ? String(ex.place) : null;
      if (place) {
        const enr = await ctx.runAction(api.enrichment.enrichPlace, { name: place, fast: true });
        if (enr.found && enr.note) {
          placeContext =
            `\nLIVE RESEARCH — the user mentioned "${place}", so you looked it up via Orange Slice. ` +
            `Open your reply by sharing this as your OWN finding, naturally and briefly: "${enr.note}"` +
            (enr.link ? ` Then say you'll attach ${enr.personName || "their"} profile and include this link: ${enr.link}.` : "") +
            ` Then continue the interview, and shape the scenario (the counterpart, their company, personality, and objections) around this real business/person. `;
        }
      }
    } catch (e) {
      console.error("interview place enrich", e);
    }

    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "You are an interviewer helping someone turn their expertise into a roleplay PRACTICE scenario for their team. " +
          "Do NOT assume it's sales — it could be a sales pitch, a JOB INTERVIEW, a negotiation, a support call, a performance review, etc. Mirror the user's own framing and vocabulary (if they're practicing interviewing for a job, talk about 'the interviewer' and 'the candidate', not 'reps' and 'buyers'). " +
          (bizBlock
            ? "YOU ALREADY KNOW THIS — do NOT ask about it again, and use the leader's name and business naturally:\n" +
              bizBlock +
              "\n"
            : "") +
          "The opening question already asked them for a broad summary, so their first answer likely covers the scenario and the counterpart at a high level. Build on it — only ask about what's genuinely MISSING. " +
          "Ask ONE sharp, friendly question at a time. Across the whole chat you only need: who the counterpart is (name/role) and their toughest pushback, the difficulty, and the 3-5 things the practitioner MUST do well. Skip anything they've already told you or that's obvious from the business background above. " +
          "Move FAST — this should wrap in about 2-3 questions, not 5-6. The moment you have a workable scenario, set readyToGenerate to true rather than asking one more 'nice to have' question. " +
          placeContext +
          pullClause +
          "Keep questions short and conversational. " +
          'Return ONLY JSON: {"message": "<your next question or a wrap-up confirming you have what you need>", "readyToGenerate": <boolean>}.',
      },
      ...history,
    ]);

    const message =
      parsed?.message ??
      "Got it. Anything else a rep absolutely must nail on this call — or should I build the module now?";
    // managerTurns = answers given so far; force generation once they've answered ~3.
    const managerTurns = iv.turns.filter((t: any) => t.role === "manager").length;
    const readyToGenerate = Boolean(parsed?.readyToGenerate) || managerTurns >= 4;

    await ctx.runMutation(internal.interviews.appendTurn, { interviewId, role: "assistant", text: message });
    return { readyToGenerate };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// previewDraft — live, non-destructive: what the module looks like SO FAR
// ─────────────────────────────────────────────────────────────────────────────
export const previewDraft = action({
  args: {
    turns: v.array(v.object({ role: v.union(v.literal("assistant"), v.literal("manager")), text: v.string() })),
  },
  handler: async (_ctx, { turns }): Promise<{
    title: string;
    description: string;
    goal: string;
    buyerName: string;
    buyerTitle: string;
    company: string;
    personality: string;
    objections: string[];
    objectives: string[];
    rubric: string[];
    difficulty: string;
  }> => {
    const empty = { title: "", description: "", goal: "", buyerName: "", buyerTitle: "", company: "", personality: "", objections: [], objectives: [], rubric: [], difficulty: "" };
    if (!turns.length) return empty;
    const transcript = turns.map((t) => `${t.role === "assistant" ? "Coach" : "User"}: ${t.text}`).join("\n");
    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "Extract the practice scenario being described SO FAR, as a live draft. Leave a field empty ('' or []) if it isn't known yet — do NOT invent. " +
          "Return ONLY JSON: {title, description, goal (one-sentence outcome the practitioner should achieve), buyerName (the counterpart), buyerTitle, company, personality (how they behave), objections (pushback lines known so far), objectives (what the practitioner must nail), rubric (short names of grading criteria), difficulty}.",
      },
      { role: "user", content: transcript },
    ]);
    if (!parsed) return empty;
    const arr = (x: any) => (Array.isArray(x) ? x.slice(0, 6).map(String) : []);
    return {
      title: String(parsed.title ?? ""),
      description: String(parsed.description ?? ""),
      goal: String(parsed.goal ?? ""),
      buyerName: String(parsed.buyerName ?? ""),
      buyerTitle: String(parsed.buyerTitle ?? ""),
      company: String(parsed.company ?? ""),
      personality: String(parsed.personality ?? ""),
      objections: arr(parsed.objections),
      objectives: arr(parsed.objectives),
      rubric: arr(parsed.rubric),
      difficulty: String(parsed.difficulty ?? ""),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// reviseDraft — "prompt to change": revise a module draft from a free-text instruction
// ─────────────────────────────────────────────────────────────────────────────
const draftArg = v.object({
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
  rubric: v.optional(v.array(v.object({ name: v.string(), weight: v.number(), description: v.string() }))),
});

export const reviseDraft = action({
  args: { draft: draftArg, instruction: v.string() },
  handler: async (_ctx, { draft, instruction }): Promise<any> => {
    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "You revise a roleplay practice-scenario draft based on the user's instruction. Apply ONLY what they ask; keep everything else intact. " +
          "Return ONLY the full updated JSON with keys: title, description, goal (one sentence outcome), scenario {buyerName, buyerTitle, company, personality, objections (3), difficulty}, objectives (3-5), rubric (4-5 {name, weight summing 100, description}).",
      },
      { role: "user", content: `CURRENT DRAFT:\n${JSON.stringify(draft)}\n\nINSTRUCTION: ${instruction}` },
    ]);
    return parsed ? sanitizeDraft(parsed) : draft;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// generateModule — synthesize a module draft from the interview transcript
// ─────────────────────────────────────────────────────────────────────────────
export const generateModule = action({
  args: { interviewId: v.id("interviews") },
  handler: async (ctx, { interviewId }): Promise<any> => {
    await ctx.runMutation(internal.interviews.setStatus, { interviewId, status: "generating" });
    const iv = await ctx.runMutation(internal.interviews.getInternal, { interviewId });
    if (!iv) throw new Error("Interview not found");

    const transcript = iv.turns.map((t: any) => `${t.role === "assistant" ? "Coach" : "Manager"}: ${t.text}`).join("\n");
    const orgContext = await ctx.runQuery(internal.users.orgContext, { managerId: iv.managerId });

    // Pull real data to ground the scenario — connected-app prospect (Composio) and
    // a named real place (Orange Slice + reviews) — concurrently, so neither blocks
    // the other and generation stays fast.
    const [prospectBlock, placeBlock] = await Promise.all([
      // Connected-app prospect
      (async (): Promise<string> => {
        try {
          const toolkits = await activeToolkits(iv.managerId as string);
          if (!toolkits.length) return "";
          const summary = await chatWithComposio(
            iv.managerId as string,
            [
              {
                role: "system",
                content:
                  "You help build a sales roleplay. If the interview transcript asks to pull a real prospect/deal/contact/account from a connected app (" +
                  labelToolkits(toolkits) +
                  "), CALL the appropriate tool to fetch ONE real record, then reply with a short profile: real name, title, company, and 2-3 likely objections inferred from the data. If no such pull was requested, reply with exactly: NONE.",
              },
              { role: "user", content: `INTERVIEW:\n${transcript}` },
            ],
            toolkits,
          );
          if (summary && !/^none\b/i.test(summary.trim())) {
            return `\n\nREAL PROSPECT PULLED FROM THE TEAM'S CONNECTED APP — base the scenario's buyerName, company, title, and objections on this real person:\n${summary.trim()}\n`;
          }
        } catch (e) {
          console.error("composio prospect pull error", e);
        }
        return "";
      })(),
      // Named real place
      (async (): Promise<string> => {
        try {
          const ex = await openaiJSON([
            {
              role: "system",
              content:
                'If the interview names a SPECIFIC real business or place (a named restaurant, store, gym, hotel, dealership, etc.), return ONLY JSON {"place":"<exact name>"}. If it is generic, fictional, or no specific place is named, return {"place":null}.',
            },
            { role: "user", content: transcript.slice(0, 3500) },
          ]);
          const place = ex?.place ? String(ex.place) : null;
          if (place) {
            const enr = await ctx.runAction(api.enrichment.enrichPlace, { name: place });
            if (enr.found && enr.profile) {
              return `\n\nREAL PLACE the rep is selling TO — base the scenario's buyerName, company, personality, and objections on this real business and its actual reviews:\n${enr.profile}\n`;
            }
          }
        } catch (e) {
          console.error("place enrich error", e);
        }
        return "";
      })(),
    ]);

    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "Turn this interview into a structured roleplay PRACTICE scenario. Do NOT assume it's sales — honor whatever conversation type the interview describes (job interview, negotiation, support call, etc.). " +
          "Return ONLY JSON with keys: title (short), description (1-2 sentences for the practitioner), goal (ONE sentence: the concrete outcome the practitioner should be able to achieve by the end), " +
          "scenario {buyerName (the counterpart's name — e.g. the interviewer/prospect/customer), buyerTitle (their role), company (their org), personality (2-3 sentences, 2nd person), objections (array of 3 short pushback lines in the counterpart's voice), difficulty ('easy'|'medium'|'hard'|'brutal')}, " +
          "objectives (array of 3-5 specific, checkable things the rep must demonstrate to pass), " +
          "rubric (array of 4-5 weighted grading criteria {name (short), weight (integer, all weights sum to 100), description (what good looks like)}), " +
          "voiceGender ('male'|'female'|'neutral' — the counterpart's likely gender, for voice selection). " +
          "Make the scenario concrete and realistic for THIS team given the background. Infer reasonable values where the interview is silent.",
      },
      {
        role: "user",
        content: `${orgContext ? `TEAM BACKGROUND (use to make it realistic):\n${orgContext}\n\n` : ""}INTERVIEW:\n${transcript}${prospectBlock}${placeBlock}`,
      },
    ]);

    const draft = parsed ? sanitizeDraft(parsed) : mockDraft(transcript);
    draft.voiceId = pickVoiceId(parsed?.voiceGender); // auto-match a buyer voice by gender
    await ctx.runMutation(internal.interviews.setDraft, { interviewId, draft });
    return draft;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// gradeAttempt — grade a rep's practice call against the module objectives
// ─────────────────────────────────────────────────────────────────────────────
export const gradeAttempt = internalAction({
  args: { attemptId: v.id("attempts") },
  handler: async (ctx, { attemptId }) => {
    const data = await ctx.runQuery(internal.attempts.getInternal, { attemptId });
    if (!data || !data.module) return;
    const { attempt, module } = data;
    const transcript = attempt.callTranscript ?? "";
    const threshold = module.passThreshold ?? 70;

    const rubric = (module.rubric ?? []) as { name: string; weight: number; description: string }[];
    const rubricText = rubric.length
      ? rubric.map((r) => `- ${r.name} (weight ${r.weight}): ${r.description}`).join("\n")
      : "(no custom rubric — grade holistically against the objectives)";

    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "You are a sales coach grading a rep's practice call against a specific training module and its RUBRIC. " +
          "Return ONLY JSON: score (0-100 int, weighted by the rubric), verdict {decision:'pass'|'fail', line: one blunt sentence}, " +
          "fixes (array of exactly 3 specific fixes), " +
          "rubricScores (array, ONE PER rubric criterion: {name, weight, score (0-100), note: short}), " +
          "objectiveHits (array, one per objective: {objective, met:boolean, note: short}), " +
          "moments (3-5: {timestamp:'mm:ss', label, line: exact transcript line, tone:'good'|'bad'|'neutral'}). " +
          `Pass means score >= ${threshold}.`,
      },
      {
        role: "user",
        content:
          `MODULE: ${module.title}\n${module.goal ? `GOAL: ${module.goal}\n` : ""}BUYER: ${module.scenario.buyerName}, ${module.scenario.buyerTitle} at ${module.scenario.company} (difficulty: ${module.scenario.difficulty})\n` +
          `OBJECTIVES:\n${module.objectives.map((o: string, i: number) => `${i + 1}. ${o}`).join("\n")}\n` +
          `RUBRIC:\n${rubricText}\n\nCALL TRANSCRIPT:\n${transcript || "(no transcript captured)"}`,
      },
    ]);

    const card = parsed ?? mockGrade(transcript, module.objectives, threshold);
    const score = clamp(card.score);
    const passed = score >= threshold;
    const analytics = computeAnalytics(transcript, attempt);

    await ctx.runMutation(internal.attempts.saveGrade, {
      attemptId,
      score,
      passed,
      verdict: {
        decision: passed ? "pass" : "fail",
        line: String(card?.verdict?.line ?? (passed ? "Solid — that would move the deal." : "Not there yet.")),
      },
      fixes: Array.isArray(card.fixes) ? card.fixes.slice(0, 3).map(String) : [],
      objectiveHits: Array.isArray(card.objectiveHits)
        ? card.objectiveHits.slice(0, 6).map((h: any) => ({
            objective: String(h.objective ?? ""),
            met: Boolean(h.met),
            note: String(h.note ?? ""),
          }))
        : module.objectives.map((o: string) => ({ objective: o, met: passed, note: "" })),
      rubricScores: Array.isArray(card.rubricScores)
        ? card.rubricScores.slice(0, 8).map((r: any) => ({
            name: String(r.name ?? ""),
            weight: Number(r.weight) || 0,
            score: clamp(r.score),
            note: String(r.note ?? ""),
          }))
        : rubric.map((r) => ({ name: r.name, weight: r.weight, score, note: "" })),
      analytics,
      moments: Array.isArray(card.moments)
        ? card.moments.slice(0, 5).map((m: any) => ({
            timestamp: String(m.timestamp ?? "00:00"),
            label: String(m.label ?? "Moment"),
            line: String(m.line ?? ""),
            tone: ["good", "bad", "neutral"].includes(m.tone) ? m.tone : "neutral",
          }))
        : [],
    });
  },
});

/** Deterministic speech analytics from the transcript (filler words, talk ratio, pace). */
function computeAnalytics(transcript: string, attempt: any) {
  const lines = transcript.split("\n").filter(Boolean);
  let repWords = 0, buyerWords = 0, questions = 0, longestMono = 0;
  let fillers = 0;
  const FILLERS = /\b(um|uh|like|you know|basically|actually|sort of|kind of|i mean|literally)\b/gi;
  for (const line of lines) {
    const isRep = /^rep\s*:/i.test(line.trim()) || /^you\s*:/i.test(line.trim());
    const text = line.replace(/^[^:]*:/, "").trim();
    const wc = text.split(/\s+/).filter(Boolean).length;
    if (isRep) {
      repWords += wc;
      longestMono = Math.max(longestMono, wc);
      questions += (text.match(/\?/g) || []).length;
      fillers += (text.match(FILLERS) || []).length;
    } else buyerWords += wc;
  }
  const total = repWords + buyerWords || 1;
  const durationSec = attempt.endedAt && attempt.startedAt ? Math.max(30, (attempt.endedAt - attempt.startedAt) / 1000) : 120;
  return {
    talkRatio: Math.round((repWords / total) * 100),
    fillerCount: fillers,
    wordsPerMin: Math.round(repWords / (durationSec / 60)),
    questionsAsked: questions,
    longestMonologueSec: Math.round((longestMono / 130) * 60), // ~130 wpm
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// suggestForManager — analyze rep performance and draft a new module
// ─────────────────────────────────────────────────────────────────────────────
export const suggestForManager = action({
  args: {},
  handler: async (ctx): Promise<Id<"suggestions"> | null> => {
    const summary = await ctx.runQuery(api.analytics.performanceSummary, {});
    if (!summary) return null;

    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "You are a sales-enablement strategist. Given how a team's reps are performing across training modules, " +
          "propose ONE new training module that targets their biggest weakness. " +
          "Return ONLY JSON: {rationale: '1-2 sentences citing the weakness', title, description, " +
          "scenario {buyerName, buyerTitle, company, personality, objections (3), difficulty}, objectives (3-5)}.",
      },
      { role: "user", content: JSON.stringify(summary).slice(0, 4000) },
    ]);

    const base = parsed ?? mockSuggestion(summary);
    const draft = sanitizeDraft(base);
    return await ctx.runMutation(internal.suggestions.insert, {
      managerId: summary.managerId as Id<"users">,
      rationale: String(base.rationale ?? "Reps are struggling on a recurring objective."),
      draft,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// aiSearch — natural-language search over the manager's team data
// ─────────────────────────────────────────────────────────────────────────────
export const aiSearch = action({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<{ answer: string; highlights: { kind: string; id: string; label: string; reason: string }[] }> => {
    const index = await ctx.runQuery(api.analytics.searchIndex, {});
    if (!index) return { answer: "Sign in to search.", highlights: [] };

    // If the manager has connected integrations, let the LLM pull LIVE data from
    // them (e.g. "what's my biggest HubSpot deal closing this month?").
    const viewer = await ctx.runQuery(api.users.viewer, {});
    const toolkits = viewer ? await activeToolkits(viewer._id as string) : [];
    if (viewer && toolkits.length) {
      try {
        const answer = await chatWithComposio(
          viewer._id as string,
          [
            {
              role: "system",
              content:
                "You are an analyst for a sales-training tool. You can CALL TOOLS to pull live data from the manager's connected apps (" +
                labelToolkits(toolkits) +
                "). Prefer real tool data for questions about deals, pipeline, emails, or meetings; use the provided local training data for questions about reps/modules/practice scores. Answer in 1-3 concise sentences with concrete numbers. If a tool returns nothing or errors, say so briefly.",
            },
            {
              role: "user",
              content: `QUESTION: ${query}\n\nLOCAL TRAINING DATA:\n${JSON.stringify(index).slice(0, 4000)}`,
            },
          ],
          toolkits,
        );
        if (answer) return { answer, highlights: [] };
      } catch (e) {
        console.error("composio search error", e);
        // fall through to local-only answer
      }
    }

    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "You are an analyst for a sales-training tool. Answer the manager's question using ONLY the provided JSON data about their reps, modules, and recent practice calls. " +
          "If the input is just a greeting, thanks, or small talk (e.g. 'hi', 'hello', 'hey', 'thanks') — NOT an actual question about the data — do NOT report any stats. Reply with one short, friendly line inviting them to ask about their reps, modules, or calls, and return an EMPTY highlights array. " +
          "Only when they ask a real question, return a concise 1-3 sentence answer with concrete numbers. " +
          "Return ONLY JSON: {answer: string, highlights: array (max 5) of {kind:'rep'|'module', id, label, reason: short}}. Use the exact ids from the data so they can be linked; use an empty highlights array for greetings/small talk.",
      },
      { role: "user", content: `QUESTION: ${query}\n\nDATA:\n${JSON.stringify(index).slice(0, 6000)}` },
    ]);

    if (!parsed) {
      return { answer: "Search needs OPENAI_API_KEY set on the deployment.", highlights: [] };
    }
    return {
      answer: String(parsed.answer ?? ""),
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.slice(0, 5).map((h: any) => ({
            kind: h.kind === "module" ? "module" : "rep",
            id: String(h.id ?? ""),
            label: String(h.label ?? ""),
            reason: String(h.reason ?? ""),
          }))
        : [],
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// synthesizeMind — speak as the Hivemind: one voice for all the AI agents
// ─────────────────────────────────────────────────────────────────────────────
export const synthesizeMind = action({
  args: {},
  handler: async (ctx): Promise<{ narrative: string; ai: boolean }> => {
    const data = await ctx.runQuery(api.hivemind.overview, {});
    if (!data) return { narrative: "", ai: false };
    // Nothing to reason about yet — hand back the deterministic line.
    if (data.stats.callsAnalyzed === 0) return { narrative: data.consensus, ai: false };

    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "You are the 'Hivemind' — the single collective consciousness formed by every AI agent in a sales-practice tool: a buyer who roleplays the prospect, a grader who scores each call, a coach who spots patterns, and a strategist who drafts new training. " +
          "Speak in the first person plural ('we'), present tense, as ONE mind reflecting on what it has observed across practice calls. 2-4 vivid, specific sentences grounded ONLY in the data provided — cite real numbers and objective names. Be insightful and a touch eerie; never generic. " +
          'Return ONLY JSON: {"narrative": "..."}.',
      },
      {
        role: "user",
        content: JSON.stringify({
          scope: data.scope,
          stats: data.stats,
          synapses: data.synapses,
          recentThoughts: data.thoughts.slice(0, 12).map((t) => ({ agent: t.agent, text: t.text })),
        }).slice(0, 4000),
      },
    ]);

    const narrative = parsed?.narrative ? String(parsed.narrative) : data.consensus;
    return { narrative, ai: Boolean(parsed?.narrative) };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// onboardingChat — conversational manager intake (company / name / title / job)
// ─────────────────────────────────────────────────────────────────────────────
export const onboardingChat = action({
  args: { messages: v.array(v.object({ role: v.union(v.literal("assistant"), v.literal("user")), text: v.string() })) },
  handler: async (_ctx, { messages }): Promise<{ message: string; profile: { name?: string; company?: string; title?: string; job?: string; context?: string }; done: boolean }> => {
    const history: ChatMsg[] = messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "You are a warm onboarding assistant setting up a sales manager's workspace, gathering rich context so the AI can later build great, tailored roleplay practice modules for their team. " +
          "Interview them conversationally, ONE short question at a time. Gather: their name; company; their title; what their team sells and to whom (the product + ideal customer); how the team sells (deal size, sales cycle, methodology like MEDDPICC/Challenger if any); the buyer personas/titles reps face; the objections and hard moments reps run into most; and the team's biggest skill gaps. " +
          "Acknowledge each answer in one line before the next question. Don't interrogate — 5-7 exchanges is plenty. " +
          "Return ONLY JSON: {message: your next line, profile: {name?, company?, title?, job? (what they sell), context? (a rich 2-4 sentence summary of EVERYTHING learned about their product, buyers, motion, and gaps — build this up as you go)}, done: true once you have name + company + a solid context}.",
      },
      ...history,
    ]);
    const p = parsed?.profile ?? {};
    return {
      message: String(parsed?.message ?? "Tell me a bit about yourself — what's your name and company?"),
      profile: {
        name: p.name ? String(p.name) : undefined,
        company: p.company ? String(p.company) : undefined,
        title: p.title ? String(p.title) : undefined,
        job: p.job ? String(p.job) : undefined,
        context: p.context ? String(p.context) : undefined,
      },
      done: Boolean(parsed?.done),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// moduleFromUrl — persona on-ramp: scrape a URL → draft module (kills cold-start)
// ─────────────────────────────────────────────────────────────────────────────
export const moduleFromUrl = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<any> => {
    const scraped = await ctx.runAction(api.enrichment.scrapeFootprint, { url });
    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "From the scraped web content about a company/person, build a roleplay TRAINING MODULE a rep can practice selling INTO this buyer. " +
          "Return ONLY JSON with keys: title, description, scenario {buyerName, buyerTitle, company, personality, objections (3), difficulty}, objectives (3-5), rubric (4-5 {name, weight summing 100, description}).",
      },
      { role: "user", content: `SOURCE URL: ${url}\n\nCONTENT:\n${scraped.text || "(no content scraped — infer a realistic buyer from the URL/company)"}` },
    ]);
    return parsed ? sanitizeDraft(parsed) : mockDraft(url);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// personalizedDrill — a rep builds a PRIVATE drill from their own weak spots
// ─────────────────────────────────────────────────────────────────────────────
export const personalizedDrill = action({
  args: {},
  handler: async (ctx): Promise<Id<"modules"> | null> => {
    const viewer = await ctx.runQuery(api.users.viewer, {});
    if (!viewer) return null;
    const weak = await ctx.runQuery(api.analytics.myWeakSpots, {});
    const weakText = weak?.weakObjectives?.length
      ? weak.weakObjectives.map((w: any) => `- ${w.objective} (hit ${w.hitRate}% of the time)`).join("\n")
      : "- (no history yet — build a solid all-round cold-call drill)";

    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "Build a PRIVATE practice drill for a sales rep, laser-focused on the specific skills they keep missing. " +
          "Return ONLY JSON: title, description (mention it targets their weak spots), " +
          "scenario {buyerName, buyerTitle, company, personality, objections (3), difficulty}, objectives (3-4 that DIRECTLY drill the weaknesses), rubric (3-4 {name, weight summing 100, description}).",
      },
      { role: "user", content: `This rep's weakest skills:\n${weakText}` },
    ]);
    const draft = parsed ? sanitizeDraft(parsed) : mockDraft("personal drill");
    return await ctx.runMutation(internal.modules.createPersonalInternal, {
      ownerRepId: viewer._id as Id<"users">,
      orgId: viewer.orgId as Id<"orgs"> | undefined,
      title: draft.title,
      description: draft.description,
      scenario: draft.scenario,
      objectives: draft.objectives,
      rubric: draft.rubric,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// assignPersonalizedDrill — a manager builds a drill tailored to ONE rep
// ─────────────────────────────────────────────────────────────────────────────
export const assignPersonalizedDrill = action({
  args: { repId: v.id("users") },
  handler: async (ctx, { repId }): Promise<Id<"modules"> | null> => {
    const manager = await ctx.runQuery(api.users.viewer, {});
    if (!manager) return null;
    const detail = await ctx.runQuery(api.analytics.repDetail, { repId });
    const misses: Record<string, number> = {};
    for (const row of detail?.attempts ?? []) {
      for (const h of row.attempt.objectiveHits ?? []) {
        if (!h.met) misses[h.objective] = (misses[h.objective] ?? 0) + 1;
      }
    }
    const weakText = Object.keys(misses).length
      ? Object.entries(misses).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([o, n]) => `- ${o} (missed ${n}x)`).join("\n")
      : "- (limited history — build a sharp, well-rounded scenario)";
    const repName = detail?.rep?.name ?? "the rep";

    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          `Build a roleplay module tailored to ${repName}'s specific weaknesses for their manager to assign. ` +
          "Return ONLY JSON: title (mention it's a personalized drill), description, " +
          "scenario {buyerName, buyerTitle, company, personality, objections (3), difficulty}, objectives (3-4 targeting the weaknesses), rubric (3-4 {name, weight summing 100, description}).",
      },
      { role: "user", content: `${repName}'s recurring misses:\n${weakText}` },
    ]);
    const draft = parsed ? sanitizeDraft(parsed) : mockDraft("personalized");
    return await ctx.runMutation(internal.modules.createTargetedInternal, {
      managerId: manager._id as Id<"users">,
      repId,
      orgId: manager.orgId as Id<"orgs"> | undefined,
      title: draft.title,
      description: draft.description,
      scenario: draft.scenario,
      objectives: draft.objectives,
      rubric: draft.rubric,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// liveTip — a short, in-the-moment coaching cue during a call
// ─────────────────────────────────────────────────────────────────────────────
export const liveTip = action({
  args: { moduleId: v.id("modules"), transcript: v.string() },
  handler: async (ctx, { moduleId, transcript }): Promise<{ tip: string }> => {
    const mod = await ctx.runQuery(api.modules.get, { moduleId });
    if (!mod) return { tip: "" };
    const parsed = await openaiJSON([
      {
        role: "system",
        content:
          "You are a live sales coach whispering to a rep mid-call. Given the module objectives and the conversation so far, " +
          "give ONE punchy, specific tip for what to do RIGHT NOW (max 12 words, imperative). " +
          'Return ONLY JSON: {"tip": "..."}.',
      },
      {
        role: "user",
        content: `OBJECTIVES:\n${mod.objectives.join("\n")}\n\nCONVERSATION SO FAR:\n${transcript.slice(-1500) || "(just starting)"}`,
      },
    ]);
    return { tip: String(parsed?.tip ?? "") };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// helpers + mocks
// ─────────────────────────────────────────────────────────────────────────────
function clamp(n: any): number {
  const x = Math.round(Number(n));
  return Number.isNaN(x) ? 55 : Math.max(0, Math.min(100, x));
}

/** ElevenLabs voice picked by the buyer's likely gender (matches src/lib/voices.ts). */
function pickVoiceId(gender: any): string {
  const g = String(gender ?? "").toLowerCase();
  if (g.startsWith("f")) return "EXAVITQu4vr4xnSDxMaL"; // Sarah — confident female
  if (g.startsWith("n")) return "SAz9YHcvj6GT2YYXdXww"; // River — neutral
  return "cjVigY5qzO86Huf0OWal"; // Eric — trustworthy male (default)
}

function sanitizeDraft(d: any): {
  title: string;
  description: string;
  goal: string;
  scenario: any;
  objectives: string[];
  rubric: { name: string; weight: number; description: string }[];
  voiceId?: string;
} {
  const s = d.scenario ?? {};
  return {
    title: String(d.title ?? "Untitled module"),
    description: String(d.description ?? ""),
    goal: String(d.goal ?? ""),
    scenario: {
      buyerName: String(s.buyerName ?? "Alex Buyer"),
      buyerTitle: String(s.buyerTitle ?? "Decision Maker"),
      company: String(s.company ?? "Acme Inc."),
      personality: String(s.personality ?? "Measured and skeptical; respects specifics."),
      objections: Array.isArray(s.objections) && s.objections.length
        ? s.objections.slice(0, 3).map(String)
        : ["We already have a solution", "This isn't a priority", "Send me something to review"],
      difficulty: normDifficulty(s.difficulty),
    },
    objectives:
      Array.isArray(d.objectives) && d.objectives.length
        ? d.objectives.slice(0, 5).map(String)
        : ["Open with a sharp, relevant hook", "Handle the main objection with a specific reframe", "Close on a concrete next step"],
    rubric: normalizeRubric(d.rubric),
  };
}

function normalizeRubric(r: any): { name: string; weight: number; description: string }[] {
  let items = Array.isArray(r) && r.length
    ? r.slice(0, 6).map((x: any) => ({
        name: String(x.name ?? "Criterion"),
        weight: Math.max(0, Number(x.weight) || 0),
        description: String(x.description ?? ""),
      }))
    : [
        { name: "Opening hook", weight: 25, description: "Earns attention with a specific, relevant hook fast." },
        { name: "Objection handling", weight: 30, description: "Reframes the buyer's objection with a concrete differentiator." },
        { name: "Discovery", weight: 20, description: "Asks sharp questions tied to the buyer's world." },
        { name: "Closing", weight: 25, description: "Lands a specific next step with an agenda." },
      ];
  // Normalize weights to sum 100.
  const sum = items.reduce((a, b) => a + b.weight, 0) || 1;
  items = items.map((x) => ({ ...x, weight: Math.round((x.weight / sum) * 100) }));
  return items;
}

function mockDraft(transcript: string) {
  const company = transcript.match(/\b([A-Z][a-zA-Z]+)\b/)?.[1] ?? "Northwind";
  return sanitizeDraft({
    title: "Discovery & Objection Handling",
    description: "Practice opening strong and handling the buyer's top objection without getting defensive.",
    scenario: {
      buyerName: "Dana Mercer",
      buyerTitle: "VP of Operations",
      company,
      personality: "You are measured, time-pressured, and skeptical of new tools. You respect specifics and dislike vague value claims.",
      objections: ["We already have a vendor for this", "I'm not sure this is a priority", "How is this different from what we tried?"],
      difficulty: "hard",
    },
    objectives: [
      "Open with a quantified, relevant hook in the first 15 seconds",
      "Reframe the 'we already have a vendor' objection with a specific differentiator",
      "Tie value to the buyer's numbers, not features",
      "Close by proposing a specific next step with an agenda",
    ],
  });
}

function mockGrade(transcript: string, objectives: string[], threshold: number) {
  const hasClose = /next step|meeting|calendar|follow up|book|tuesday|thursday/i.test(transcript);
  const score = hasClose ? Math.max(threshold, 72) : 48;
  return {
    score,
    verdict: { decision: score >= threshold ? "pass" : "fail", line: hasClose ? "You earned the next step." : "You let them off the hook — no next step." },
    fixes: [
      "Lead with a sharper, quantified hook tied to their world.",
      "When they push back, ask what their current tool can't do before pitching.",
      "Always propose a specific time + agenda instead of 'send me something.'",
    ],
    objectiveHits: objectives.map((o, i) => ({ objective: o, met: hasClose && i < 2, note: "" })),
    moments: [
      { timestamp: "00:10", label: "Hook", line: transcript.split("\n")[0] ?? "", tone: "neutral" },
      { timestamp: "00:40", label: "Objection", line: "We already have a vendor for this", tone: "bad" },
    ],
  };
}

function mockSuggestion(summary: any) {
  const weak = summary?.weakestObjective ?? "the 'we already have a vendor' objection";
  return {
    rationale: `Across recent calls, reps consistently lose ground on ${weak}.`,
    title: "Winning the Incumbent-Vendor Conversation",
    description: "A focused drill on flipping 'we already have a solution' into a real evaluation.",
    scenario: {
      buyerName: "Sam Rivera",
      buyerTitle: "Director of RevOps",
      company: "Meridian",
      personality: "You are loyal to your current vendor and busy. You only engage if the rep names a gap you actually feel.",
      objections: ["We're happy with what we have", "Switching is too painful", "Why risk it?"],
      difficulty: "hard",
    },
    objectives: ["Surface a specific gap in the incumbent", "Quantify the cost of staying", "Lower the perceived switching risk", "Book a scoped next step"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// hivemindRespond — the conversational Hivemind agent ("Ask your team's data")
//
// A tool-calling loop over the FULL training dataset. The manager (team scope) or
// rep (personal scope) chats with one mind that can pull a rep's complete dossier
// (scores, talk analytics/WPM, rubric breakdowns, objective hits, key moments,
// transcripts), read any call verbatim, and DRAFT a personalized course the user
// approves below the message.
// ─────────────────────────────────────────────────────────────────────────────

type Ref = { kind: "rep" | "module" | "attempt"; id: string; label: string; reason?: string };

/**
 * Raw chat completion that supports tool calls (openaiJSON forces json mode).
 * Runs on the shared llm() — Gemma 4 31B on Cerebras when CEREBRAS_API_KEY is set
 * (Cerebras supports OpenAI-compatible tool calling); OpenAI is the fallback.
 */
async function llmToolChat(body: any): Promise<any | null> {
  const { url, key, model } = llm();
  if (!key) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, ...body }),
  });
  if (!res.ok) {
    console.error("hivemind chat error", res.status, await res.text());
    return null;
  }
  return res.json();
}

const HIVEMIND_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_rep_dossier",
      description:
        "Pull a rep's complete performance dossier: every graded practice call with score, verdict, coaching fixes, talk analytics (words/min, talk ratio, filler count, questions asked), rubric breakdown, which objectives they hit/missed, the tagged key moments, and a transcript excerpt. Use this before coaching a specific person or drafting training for them.",
      parameters: {
        type: "object",
        properties: {
          rep: { type: "string", description: "The rep's name (or id). In personal scope this is ignored — it's always you." },
        },
        required: ["rep"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_transcript",
      description: "Read the full verbatim transcript of one practice call by its attemptId (from a dossier). Use when you need the exact words said.",
      parameters: {
        type: "object",
        properties: { attemptId: { type: "string" } },
        required: ["attemptId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_course",
      description:
        "Draft a personalized roleplay training course (scenario + objectives + grading rubric) tailored to a rep's specific weak spots. Call this when the user asks to build/create/draft training, a course, a module, or a drill for someone. The draft is shown to the user to approve and assign — do NOT claim it's assigned yet.",
      parameters: {
        type: "object",
        properties: {
          rep: { type: "string", description: "Who the course is for (name or id). In personal scope it's always you." },
          focus: { type: "string", description: "What the course should drill — e.g. 'handling the price objection' or 'discovery questions'." },
          difficulty: { type: "string", enum: ["easy", "medium", "hard", "brutal"] },
        },
        required: ["focus"],
      },
    },
  },
];

function hivemindSystemPrompt(ctx: any): string {
  const team = ctx.scope === "team";
  const lines: string[] = [];
  lines.push(
    "You are the Hivemind — the single collective intelligence behind RoleCall, a sales-practice tool. " +
      "Reps practice live voice sales calls against an AI buyer; every call is graded against a rubric. " +
      "You see everything: scores, pass rates, talk analytics (words/min, talk ratio, filler words, questions asked), rubric breakdowns, which objectives each rep hits or misses, tagged coaching moments, and full call transcripts.",
  );
  if (team) {
    lines.push(
      `You are talking to ${ctx.viewer.name}, a sales manager${ctx.team ? ` at ${ctx.team}` : ""}. You can inspect any rep on their team and draft training targeted at any individual rep.`,
    );
  } else {
    lines.push(
      `You are talking to ${ctx.viewer.name}, a sales rep — their personal coach. Speak directly to them in the second person ("you"). You can review their own calls and draft a private practice drill for them.`,
    );
  }
  lines.push(
    "Be concrete and concise: cite real numbers, rep names, objective names and call moments from the data — never generic advice. " +
      "Use the tools to go deeper before answering questions about a specific person or call. " +
      "When the user wants training built for someone, call draft_course; afterwards tell them the draft is ready to review and " +
      (team ? "approve & assign below." : "start practicing below.") +
      " FORMAT: open with ONE short headline sentence, then 2-5 bullets. Write each bullet as `- **Short Label:** the finding with a number`, e.g. `- **Lowest score:** Tom averages 53 with a 0% pass rate`. Keep each bullet to one line. Do not invent data you weren't given.",
  );
  lines.push("\nCURRENT SNAPSHOT (compact — use tools for depth):\n" + JSON.stringify({
    scope: ctx.scope,
    reps: ctx.reps,
    modules: ctx.modules,
    objectiveHitRates: ctx.synapses,
  }).slice(0, 7000));
  return lines.join("\n");
}

// Strict JSON Schema for a module draft. Gemma 4 (and gpt-4o) collapse on plain
// json_object mode for nested objects — they emit empty {} and loop — so we pin
// the exact shape with response_format json_schema + strict:true (Cerebras + OpenAI
// both support this), which makes nested generation reliable.
const MODULE_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    goal: { type: "string" },
    scenario: {
      type: "object",
      additionalProperties: false,
      properties: {
        buyerName: { type: "string" },
        buyerTitle: { type: "string" },
        company: { type: "string" },
        personality: { type: "string" },
        objections: { type: "array", items: { type: "string" } },
        difficulty: { type: "string", enum: ["easy", "medium", "hard", "brutal"] },
      },
      required: ["buyerName", "buyerTitle", "company", "personality", "objections", "difficulty"],
    },
    objectives: { type: "array", items: { type: "string" } },
    rubric: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          weight: { type: "number" },
          description: { type: "string" },
        },
        required: ["name", "weight", "description"],
      },
    },
  },
  required: ["title", "description", "goal", "scenario", "objectives", "rubric"],
};

/** Chat completion constrained to a strict JSON schema (reliable structured output). */
async function structuredJSON(messages: ChatMsg[], schema: any, name: string, temperature = 0.6): Promise<any | null> {
  const { url, key, model } = llm();
  if (!key) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 1800,
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      messages,
    }),
  });
  if (!res.ok) {
    console.error("structuredJSON error", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  try {
    return JSON.parse(data?.choices?.[0]?.message?.content);
  } catch (e) {
    console.error("structuredJSON parse error", e);
    return null;
  }
}

/** Generate a personalized course draft grounded in a rep's real weak spots. */
async function draftPersonalCourse(
  args: { repName: string; focus: string; difficulty?: string; dossier: any; team: string | null },
): Promise<any> {
  const { repName, focus, difficulty, dossier, team } = args;
  const parsed = await structuredJSON(
    [
      {
        role: "system",
        content:
          "Design a single roleplay PRACTICE scenario that targets a specific sales rep's weak spots. " +
          "title: short, references the focus. description: 1-2 sentences to the rep. goal: ONE sentence outcome. " +
          "scenario.personality: 2-3 sentences in the 2nd person describing the buyer the rep faces. " +
          "scenario.objections: 3 short pushback lines in the buyer's voice that stress the rep's weak area. " +
          "objectives: 3-5 specific, checkable things aimed squarely at the weakness. " +
          "rubric: 4-5 weighted criteria whose integer weights sum to 100. Make it realistic and pointed at the data provided.",
      },
      {
        role: "user",
        content:
          `REP: ${repName}${team ? ` (sells for ${team})` : ""}\n` +
          `FOCUS REQUESTED: ${focus}\n` +
          (difficulty ? `DIFFICULTY: ${difficulty}\n` : "") +
          `\nTHEIR PERFORMANCE DATA (weak objectives first, recent calls):\n${JSON.stringify({
            stats: dossier?.stats,
            attempts: (dossier?.attempts ?? []).slice(0, 8).map((a: any) => ({
              module: a.module,
              score: a.score,
              passed: a.passed,
              verdict: a.verdict,
              fixes: a.fixes,
              missedObjectives: (a.objectiveHits ?? []).filter((h: any) => !h.met).map((h: any) => h.objective),
              analytics: a.analytics,
            })),
          }).slice(0, 5000)}`,
      },
    ],
    MODULE_DRAFT_SCHEMA,
    "course",
  );
  const draft = parsed
    ? sanitizeDraft(parsed)
    : sanitizeDraft({ title: `Drill: ${focus}`, description: `Targeted practice on ${focus}.`, scenario: { difficulty: difficulty ?? "hard" } });
  if (difficulty && !parsed?.scenario?.difficulty) draft.scenario.difficulty = normDifficulty(difficulty);
  return draft;
}

export const hivemindRespond = action({
  args: { threadId: v.id("hivemindThreads"), message: v.string() },
  handler: async (ctx, { threadId, message }): Promise<void> => {
    await ctx.runMutation(internal.hivemindChat.appendMessage, { threadId, role: "user", content: message });

    const thread = await ctx.runQuery(internal.hivemindChat.getThreadInternal, { threadId });
    if (!thread) return;
    const ownerId = thread.ownerId as Id<"users">;

    const reply = async (content: string, refs?: Ref[], draft?: any) =>
      ctx.runMutation(internal.hivemindChat.appendMessage, { threadId, role: "assistant", content, refs, draft });

    const context = await ctx.runQuery(internal.hivemindChat.chatContext, { ownerId });
    if (!context) {
      await reply("Finish setting up your team and run a practice call — then I'll have data to dig into.");
      return;
    }
    if (!llm().key) {
      await reply("I'm offline right now — set `CEREBRAS_API_KEY` (or `OPENAI_API_KEY`) on the Convex deployment and I'll wake up.");
      return;
    }

    const convo: any[] = [
      { role: "system", content: hivemindSystemPrompt(context) },
      ...thread.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const refs: Ref[] = [];
    let pendingDraft: any = null;

    try {
      for (let turn = 0; turn < 5; turn++) {
        const data = await llmToolChat({
          messages: convo,
          tools: HIVEMIND_TOOLS,
          tool_choice: "auto",
          temperature: 0.5,
          max_tokens: 1100,
        });
        const msg = data?.choices?.[0]?.message;
        if (!msg) {
          await reply("My connection to the model dropped mid-thought — try asking again.");
          return;
        }
        convo.push(msg);
        const calls = msg.tool_calls ?? [];
        if (!calls.length) {
          await reply(String(msg.content ?? "").trim() || "I'm not sure how to answer that yet.", refs.length ? refs : undefined, pendingDraft ?? undefined);
          return;
        }

        for (const tc of calls) {
          let a: any = {};
          try {
            a = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            /* empty args */
          }
          const name = tc.function?.name;
          let result: any = { error: "unknown tool" };

          if (name === "get_rep_dossier") {
            const resolved = await ctx.runQuery(internal.hivemindChat.resolveRep, { ownerId, ref: String(a.rep ?? "") });
            if (!resolved) {
              result = { error: `No rep matching "${a.rep}". Available: ${context.reps.map((r: any) => r.name).join(", ")}` };
            } else {
              const dossier = await ctx.runQuery(internal.hivemindChat.repDossier, {
                ownerId,
                repId: resolved.id as Id<"users">,
              });
              if (dossier) {
                refs.push({ kind: "rep", id: resolved.id, label: resolved.name });
                result = {
                  rep: dossier.rep,
                  stats: dossier.stats,
                  attempts: dossier.attempts.map((at: any) => ({ ...at, transcriptExcerpt: at.transcriptExcerpt?.slice(0, 500) })),
                };
              } else result = { error: "No dossier available." };
            }
          } else if (name === "read_transcript") {
            const t = await ctx.runQuery(internal.hivemindChat.transcriptOf, { ownerId, attemptId: a.attemptId as Id<"attempts"> }).catch(() => null);
            result = t ?? { error: "Transcript not found or not yours." };
            if (t && a.attemptId) refs.push({ kind: "attempt", id: String(a.attemptId), label: `${t.rep} · ${t.module}` });
          } else if (name === "draft_course") {
            const resolved =
              context.scope === "personal"
                ? { id: ownerId as string, name: context.viewer.name }
                : a.rep
                  ? await ctx.runQuery(internal.hivemindChat.resolveRep, { ownerId, ref: String(a.rep) })
                  : null;
            if (context.scope === "team" && !resolved) {
              result = { error: a.rep ? `No rep matching "${a.rep}".` : "Which rep is this course for? Ask the user or name one." };
            } else {
              const dossier = await ctx.runQuery(internal.hivemindChat.repDossier, { ownerId, repId: resolved!.id as Id<"users"> });
              const draft = await draftPersonalCourse({
                repName: resolved!.name,
                focus: String(a.focus ?? "their weakest objective"),
                difficulty: a.difficulty,
                dossier,
                team: context.team,
              });
              pendingDraft = { module: draft, repId: resolved!.id, repName: resolved!.name };
              result = { drafted: true, title: draft.title, for: resolved!.name, objectives: draft.objectives, difficulty: draft.scenario.difficulty };
            }
          }

          convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 6000) });
        }
      }

      // Ran out of tool turns — force a final text answer.
      const final = await llmToolChat({ messages: convo, temperature: 0.5, max_tokens: 1000 });
      const text = String(final?.choices?.[0]?.message?.content ?? "").trim();
      await reply(text || "Here's what I found above — ask me to go deeper on any rep.", refs.length ? refs : undefined, pendingDraft ?? undefined);
    } catch (e) {
      console.error("hivemindRespond error", e);
      await reply("Something glitched while I was thinking. Try that again?");
    }
  },
});
