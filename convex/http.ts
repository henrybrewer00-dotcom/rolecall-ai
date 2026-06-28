import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

/**
 * Public endpoint ElevenLabs hits when a practice call ends. Stores the transcript
 * on the attempt, flips it to "scoring", and schedules grading.
 *   https://<deployment>.convex.site/elevenlabs/webhook
 */
const elevenLabsWebhook = httpAction(async (ctx, request) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const data = body?.data ?? body;
  const conversationId: string | undefined = data?.conversation_id ?? data?.conversationId ?? body?.conversation_id;

  const turns: any[] = data?.transcript ?? data?.transcript_turns ?? [];
  const transcriptText = Array.isArray(turns)
    ? turns
        .map((t) => {
          const role = (t.role ?? t.speaker ?? "agent").toString().toLowerCase();
          const who = role.includes("user") || role.includes("rep") || role.includes("human") ? "Rep" : "Buyer";
          const msg = t.message ?? t.text ?? t.content ?? "";
          return msg ? `${who}: ${msg}` : "";
        })
        .filter(Boolean)
        .join("\n")
    : typeof data?.transcript === "string"
      ? data.transcript
      : "";

  await ctx.runMutation(internal.attempts.attachTranscriptByCallId, {
    elevenLabsCallId: conversationId,
    callTranscript: transcriptText || "(empty transcript received)",
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

http.route({ path: "/elevenlabs/webhook", method: "POST", handler: elevenLabsWebhook });

export default http;
