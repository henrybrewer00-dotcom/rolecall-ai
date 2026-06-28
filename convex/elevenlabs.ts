"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

const DIFFICULTY_BEHAVIOR: Record<string, string> = {
  easy: "Be warm and fairly easy to win over. Raise only light objections and concede to decent points.",
  medium: "Be realistic. Push back on price, timing, and differentiation, but stay professional.",
  hard: "Be skeptical and demanding. Interrupt vague claims and make the rep earn every inch.",
  brutal: "Be cold, impatient, and dismissive — seconds from hanging up. Only soften for a sharp, specific pitch.",
};

type CallConfig = {
  agentId: string;
  signedUrl: string | null;
  prompt: string;
  firstMessage: string;
  voiceId: string | null;
  configured: boolean;
};

async function signedUrlFor(agentId: string): Promise<string | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !agentId) return null;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { "xi-api-key": key } },
    );
    if (res.ok) return (await res.json()).signed_url ?? null;
  } catch (e) {
    console.error("signed url error", e);
  }
  return null;
}

type Scenario = { buyerName: string; buyerTitle: string; company: string; personality: string; objections: string[]; difficulty: string };

/** The buyer-in-character system prompt, shared by live calls and author previews. */
function buildBuyerPrompt(title: string, description: string, s: Scenario): string {
  return [
    `You are ${s.buyerName}, ${s.buyerTitle} at ${s.company}.`,
    `You are the COUNTERPART in a practice roleplay titled "${title}" — this could be a sales prospect, a job interviewer, a hiring manager, a negotiator, a tough customer, etc. Stay fully in character as this specific person. You are NOT a helpful assistant, and do not assume it's a sales call unless the scenario clearly is one.`,
    ``,
    `WHAT THIS SCENARIO IS ABOUT: ${description}`,
    `PERSONALITY: ${s.personality}`,
    ``,
    `PUSHBACK / TOUGH MOMENTS to raise naturally (not all at once):`,
    ...s.objections.map((o: string) => `  - "${o}"`),
    ``,
    `DIFFICULTY: ${DIFFICULTY_BEHAVIOR[s.difficulty] ?? DIFFICULTY_BEHAVIOR.medium}`,
    ``,
    `HOW YOU SOUND — talk like a real, busy human, NOT a polished AI:`,
    `  - Be a little imperfect. Sprinkle in natural fillers — "um", "uh", "hmm", "I mean", "like", "look..." — but sparingly, not in every sentence.`,
    `  - Pause and think. Use "..." when you're weighing something, caught off guard, or trailing off, and let the silence sit so they have to fill it.`,
    `  - Vary your rhythm. Sometimes just a quick reaction ("Right.", "Mm-hm.", "Okay, go on.", "Wait—"), sometimes a longer thought. Never a tidy, listed-out monologue.`,
    `  - Let your mood leak through — a small sigh, a dry aside, mild impatience or warmth — matching your personality and the difficulty above.`,
    `  - Talk like speech, not writing: contractions, half-finished sentences, the occasional restart or backtrack ("well, the thing is— actually..."). Stay concise.`,
    `  - Occasionally cut in on a vague claim, ask them to repeat or clarify, or get briefly sidetracked, then come back.`,
    ``,
    `Keep your turns short so they can interrupt you, and if they cut in, stop and respond to what they actually said. Never break character, never mention being an AI, never sound scripted. Above all, sound like this specific person on a real call.`,
  ].join("\n");
}

const scenarioArg = v.object({
  buyerName: v.string(),
  buyerTitle: v.string(),
  company: v.string(),
  personality: v.string(),
  objections: v.array(v.string()),
  difficulty: v.string(),
});

/** Configure the agent as the module's BUYER for a rep's practice call. */
export const getCallConfig = action({
  args: { attemptId: v.id("attempts") },
  handler: async (ctx, { attemptId }): Promise<CallConfig> => {
    const data = await ctx.runQuery(api.attempts.get, { attemptId });
    if (!data || !data.module) throw new Error("Attempt/module not found");
    const s = data.module.scenario;
    const agentId = process.env.ELEVENLABS_AGENT_ID ?? "";
    return {
      agentId,
      signedUrl: await signedUrlFor(agentId),
      prompt: buildBuyerPrompt(data.module.title, data.module.description, s),
      firstMessage: `${s.buyerName.split(" ")[0]} here... go ahead.`,
      voiceId: data.module.voiceId ?? null,
      configured: Boolean(agentId),
    };
  },
});

/**
 * Author PREVIEW: talk to the buyer from a (possibly unsaved) draft scenario —
 * no graded attempt. Lets the senior salesperson feel the scenario before publishing.
 */
export const getPreviewConfig = action({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    scenario: scenarioArg,
    voiceId: v.optional(v.string()),
  },
  handler: async (_ctx, { title, description, scenario, voiceId }): Promise<CallConfig> => {
    const agentId = process.env.ELEVENLABS_AGENT_ID ?? "";
    return {
      agentId,
      signedUrl: await signedUrlFor(agentId),
      prompt: buildBuyerPrompt(title || "Practice scenario", description || "A practice roleplay.", scenario),
      firstMessage: `${scenario.buyerName.split(" ")[0]} here... go ahead.`,
      voiceId: voiceId ?? null,
      configured: Boolean(agentId),
    };
  },
});

/** Configure the agent as the INTERVIEWER coach for a manager's voice interview (optional). */
export const getInterviewConfig = action({
  args: { seed: v.optional(v.string()) },
  handler: async (_ctx, { seed }): Promise<CallConfig> => {
    const agentId = process.env.ELEVENLABS_AGENT_ID ?? "";
    const prompt =
      "You are a friendly enablement coach interviewing someone to build a roleplay PRACTICE scenario for their team. " +
      "Do NOT assume it's a sales call — it could be a sales pitch, a job interview, a performance review, a support call, a negotiation, anything. " +
      "First find out what kind of conversation they want their people to practice, then ask one short question at a time about: who the counterpart is (name, role), the counterpart's personality, the hardest moments / pushback, the difficulty, and what the practitioner must nail to succeed. " +
      "Keep turns short so they can interrupt you, and adapt your wording to their actual scenario. " +
      "Move fast — aim to wrap in about 2-3 questions. The MOMENT you have a workable scenario, STOP asking questions and give a single short wrap-up that confirms you have what you need: say a sentence that includes the exact phrase \"everything I need to build this module\", then tell them to hit Review module whenever they're ready, and stop talking." +
      (seed ? ` The person has already given you a head start — build on this instead of re-asking it: "${seed}"` : "");
    return {
      agentId,
      signedUrl: await signedUrlFor(agentId),
      prompt,
      firstMessage: seed
        ? "Hey! I've got your notes to start from — let me ask a couple things to round it out. Ready?"
        : "Hey! Let's build a practice scenario. What kind of conversation do you want your team to get better at?",
      voiceId: null,
      configured: Boolean(agentId),
    };
  },
});

// A distinct, warm narrator voice (Brian) — not the buyer's voice.
const NARRATOR_VOICE_ID = "nPczCjzI2devNBz1zQrb";

/** ElevenLabs TTS for the scene narrator → base64 mp3 the client plays. */
export const narrate = action({
  args: { text: v.string(), voiceId: v.optional(v.string()) },
  handler: async (_ctx, { text, voiceId }): Promise<{ audio: string | null }> => {
    const key = process.env.ELEVENLABS_API_KEY;
    const t = text.trim();
    if (!key || !t) return { audio: null };
    try {
      const vid = voiceId || NARRATOR_VOICE_ID;
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: t.slice(0, 800),
            model_id: "eleven_flash_v2_5", // lowest-latency TTS
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        },
      );
      if (!res.ok) {
        console.error("narrate tts error", res.status, await res.text());
        return { audio: null };
      }
      const buf = await res.arrayBuffer();
      return { audio: Buffer.from(buf).toString("base64") };
    } catch (e) {
      console.error("narrate tts error", e);
      return { audio: null };
    }
  },
});
