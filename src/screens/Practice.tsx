import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { useConversation } from "@elevenlabs/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, DifficultyBadge, Spinner } from "@/components/ui";
import { CallProgress } from "@/components/CallProgress";
import { VoicePoweredOrb } from "@/components/VoicePoweredOrb";
import { cn } from "@/lib/utils";
import { Lightbulb } from "lucide-react";
import { playNarration, speakNarration, stopNarration } from "@/lib/narrate";

type Turn = { who: "Rep" | "Buyer"; text: string };

const DEMO_CALL_TRANSCRIPT = `Rep: Hi, thanks for the time. I'll keep it quick.
Buyer: I've got a few minutes. Go ahead.
Rep: We help teams cut handling time by about 40%.
Buyer: We already have something for that. Why switch?
Rep: Fair — we sit on top of what you have and kill the exceptions it kicks out.
Buyer: Send me a one-pager and I'll look later.
Rep: Could we grab 20 minutes Thursday to walk your real data?
Buyer: Maybe. Send the one-pager first.`;

export default function Practice() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const aid = attemptId as Id<"attempts">;
  const navigate = useNavigate();

  const attempt = useQuery(api.attempts.get, { attemptId: aid });
  const getCallConfig = useAction(api.elevenlabs.getCallConfig);
  const narrate = useAction(api.elevenlabs.narrate);
  const linkCall = useMutation(api.attempts.linkCall);
  const finishWithTranscript = useMutation(api.attempts.finishWithTranscript);

  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "ending">("idle");
  const [narrating, setNarrating] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const [lastLine, setLastLine] = useState("");

  const conversation = useConversation({
    onConnect: () => setPhase("live"),
    onError: (e: unknown) => setError(typeof e === "string" ? e : "Call error — check mic permissions."),
    onMessage: (msg: { source?: string; message?: string }) => {
      const who: Turn["who"] = msg.source === "user" ? "Rep" : "Buyer";
      const text = msg.message ?? "";
      if (!text) return;
      turnsRef.current.push({ who, text });
      const name = attempt?.module?.scenario.buyerName.split(" ")[0] ?? "Buyer";
      setLastLine(`${who === "Rep" ? "You" : name}: ${text}`);
    },
  });

  const isSpeaking = conversation.isSpeaking;
  const status = conversation.status;

  // Track live speaking state so hang-up can let the buyer finish their sentence.
  const speakingRef = useRef(false);
  useEffect(() => {
    speakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Live audio level — drives the orb: your mic loudness while you talk, the AI's voice when it talks.
  const [level, setLevel] = useState(0);
  const live = phase === "live" || status === "connected";
  useEffect(() => {
    if (!live) {
      setLevel(0);
      return;
    }
    let raf = 0;
    const c = conversation as unknown as { getInputVolume?: () => number; getOutputVolume?: () => number };
    const tick = () => {
      let v = 0;
      try {
        v = Math.max(c.getInputVolume?.() ?? 0, c.getOutputVolume?.() ?? 0);
      } catch {
        /* ignore */
      }
      setLevel((p) => p * 0.55 + Math.min(1, v * 1.8) * 0.45);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [live, conversation]);

  // Live coaching tips (opt-in).
  const liveTip = useAction(api.ai.liveTip);
  const [tipsOn, setTipsOn] = useState(false);
  const [tip, setTip] = useState("");
  const lastTipAt = useRef(0);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // When tips are on, whisper a cue right after the buyer speaks (debounced).
  useEffect(() => {
    if (!tipsOn || phase !== "live" || !attempt?.module) return;
    const turns = turnsRef.current;
    const last = turns[turns.length - 1];
    if (!last || last.who !== "Buyer") return;
    const now = Date.now();
    if (now - lastTipAt.current < 4000) return;
    lastTipAt.current = now;
    const transcript = turns.map((t) => `${t.who}: ${t.text}`).join("\n");
    liveTip({ moduleId: attempt.moduleId, transcript })
      .then((r) => r.tip && setTip(r.tip))
      .catch(() => {});
  }, [lastLine, tipsOn, phase, attempt, liveTip]);

  const startCall = useCallback(async () => {
    setError(null);
    // Fire the narrator IMMEDIATELY, inside the click gesture — browsers block
    // speechSynthesis if it's called after async awaits (getUserMedia/getConfig).
    const mod = attempt?.module;
    const narration = mod
      ? `Here's the situation. ${mod.description}${mod.goal ? ` Your goal: ${mod.goal}.` : ""}`
      : "";
    // Prefer a real ElevenLabs narrator voice; fall back to browser TTS.
    const narrationDone = (async () => {
      if (!narration.trim()) return;
      try {
        const r = await narrate({ text: narration });
        if (r?.audio) {
          await playNarration(r.audio, setNarrating);
          return;
        }
      } catch {
        /* ignore */
      }
      await speakNarration(narration, setNarrating);
    })();
    const abortNarration = () => {
      stopNarration();
      setNarrating(false);
    };
    setPhase("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      abortNarration();
      setError("Microphone access is required to take the call.");
      setPhase("idle");
      return;
    }
    let config;
    try {
      config = await getCallConfig({ attemptId: aid });
    } catch {
      abortNarration();
      setError("Couldn't load the buyer config.");
      setPhase("idle");
      return;
    }
    if (!config.configured || (!config.agentId && !config.signedUrl)) {
      abortNarration();
      setNotice("Live voice isn't configured here. Use “End & score” to run the scoring flow with a sample call.");
      setPhase("idle");
      return;
    }
    // Let the scene finish narrating before the buyer opens.
    await narrationDone;
    try {
      const startArgs: Record<string, unknown> = {
        connectionType: "webrtc",
        overrides: {
          agent: { prompt: { prompt: config.prompt }, firstMessage: config.firstMessage, language: "en" },
          ...(config.voiceId ? { tts: { voiceId: config.voiceId } } : {}),
        },
      };
      if (config.signedUrl) startArgs.signedUrl = config.signedUrl;
      else startArgs.agentId = config.agentId;
      const conversationId = await conversation.startSession(startArgs as never);
      if (typeof conversationId === "string") await linkCall({ attemptId: aid, elevenLabsCallId: conversationId });
    } catch (e) {
      console.error(e);
      setError("Couldn't connect to the buyer. Check the ElevenLabs agent (overrides must be enabled).");
      setPhase("idle");
    }
  }, [conversation, getCallConfig, narrate, linkCall, aid, attempt]);

  const hangUp = useCallback(async () => {
    setPhase("ending");
    stopNarration();
    // Let the buyer finish their current sentence so the last line isn't cut off
    // mid-word — but cap the wait so hang-up always feels responsive.
    try {
      const start = Date.now();
      while (speakingRef.current && Date.now() - start < 4000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      // small tail so the final syllable plays out cleanly
      if (Date.now() - start < 4000) await new Promise((r) => setTimeout(r, 250));
    } catch { /* ignore */ }
    try { await conversation.endSession(); } catch { /* ignore */ }
    const transcript = turnsRef.current.map((t) => `${t.who}: ${t.text}`).join("\n");
    await finishWithTranscript({ attemptId: aid, callTranscript: transcript || DEMO_CALL_TRANSCRIPT }).catch(() => {});
    navigate(`/app/feedback/${aid}`);
  }, [conversation, finishWithTranscript, navigate, aid]);

  const toggleMute = useCallback(() => {
    const anyConv = conversation as unknown as { setMicMuted?: (m: boolean) => void };
    anyConv.setMicMuted?.(!muted);
    setMuted((m) => !m);
  }, [conversation, muted]);

  const mmss = useMemo(() => `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`, [elapsed]);

  if (attempt === undefined) return <div className="grid h-[60vh] place-items-center"><Spinner className="h-8 w-8 text-accent-500" /></div>;
  if (attempt === null || !attempt.module) return <div className="glass p-8 text-center text-ink-500">Attempt not found.</div>;

  const m = attempt.module;
  const s = m.scenario;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Call stage */}
      <div className="glass flex min-h-[64vh] flex-col items-center justify-center p-5 sm:p-8">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-bold text-ink-900">{s.buyerName}</span>
          <DifficultyBadge difficulty={s.difficulty} />
        </div>
        <p className="mb-10 text-xs text-ink-500">{s.buyerTitle} · {s.company}</p>

        {/* voice-powered orb — pulses when the buyer or rep speaks */}
        <VoicePoweredOrb active={isSpeaking} amplitude={live ? level : undefined} size={240} />

        <div className="mt-8 h-6 text-sm">
          {phase === "connecting" && (
            <span className="text-ink-500">
              {narrating ? "🎙 Setting the scene…" : `Connecting to ${s.buyerName.split(" ")[0]}…`}
            </span>
          )}
          {live && <span className="font-mono font-semibold text-accent-600">● Live · {mmss}{muted && <span className="ml-2 text-ink-400">muted</span>}</span>}
          {phase === "idle" && !live && <span className="text-ink-400">Ready when you are.</span>}
          {phase === "ending" && <span className="text-ink-500">Wrapping up & scoring…</span>}
        </div>
        {/* Scene narration — sets up the situation before the buyer speaks. */}
        {!live && phase !== "ending" && (
          <div className="mt-6 w-full max-w-md animate-fade-up rounded-md border border-ink-900/10 bg-[#f8f7f2] p-4 text-left">
            <div className="label mb-1 flex items-center gap-1.5 text-accent-700">🎬 The situation</div>
            <p className="text-sm leading-relaxed text-ink-700">{m.description}</p>
            {m.goal && (
              <p className="mt-2 text-sm leading-relaxed text-ink-800">
                <span className="font-semibold">Your goal:</span> {m.goal}
              </p>
            )}
            <p className="mt-2 text-xs text-ink-400">
              {s.buyerName.split(" ")[0]} will open the conversation — jump right in.
            </p>
          </div>
        )}
        {(live || phase === "connecting") && (
          <div className="mt-5 w-full max-w-md">
            <CallProgress mode={isSpeaking ? "speaking" : "live"} />
          </div>
        )}
        {live && lastLine && <p className="mt-3 max-w-md animate-fade-up text-center text-sm text-ink-500">{lastLine}</p>}
        {live && tipsOn && tip && (
          <div className="mt-4 flex max-w-md animate-fade-up items-start gap-2 rounded-md border border-accent-300/60 bg-accent-50 px-4 py-3 text-left">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
            <span className="text-sm font-medium text-accent-800">{tip}</span>
          </div>
        )}
        {error && <p className="mt-4 max-w-md text-center text-sm text-rose-500">{error}</p>}
        {notice && <p className="mt-4 max-w-md rounded-md border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-center text-xs text-amber-700">{notice}</p>}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {!live && phase !== "connecting" && phase !== "ending" && <Button onClick={startCall} className="px-6">Start the call</Button>}
          {phase === "connecting" && <Button loading className="px-6">Connecting</Button>}
          {live && (
            <>
              <button
                onClick={() => setTipsOn((v) => !v)}
                className={cn(
                  "btn border text-sm",
                  tipsOn ? "border-accent-300 bg-accent-100 text-accent-700" : "border-ink-900/10 bg-white text-ink-600",
                )}
              >
                <Lightbulb className="h-4 w-4" /> Tips {tipsOn ? "on" : "off"}
              </button>
              <Button variant="ghost" onClick={toggleMute} className="px-5">{muted ? "Unmute" : "Mute"}</Button>
              <Button variant="danger" onClick={hangUp} className="px-6">Hang up</Button>
            </>
          )}
          {!live && phase !== "connecting" && <Button variant="danger" onClick={hangUp} className="px-5">End &amp; score</Button>}
        </div>
        <button onClick={() => navigate("/app")} className="mt-8 text-xs text-ink-400 transition hover:text-ink-700">← Cancel and go back</button>
      </div>

      {/* What you're graded on */}
      <aside className="glass h-fit p-6">
        <h2 className="text-sm font-extrabold text-ink-900">{m.title}</h2>
        <p className="mt-1 text-xs text-ink-500">{m.description}</p>
        {m.goal && (
          <div className="mt-4 rounded-md border border-accent-300 bg-accent-50 p-3">
            <div className="label mb-0.5 text-accent-700">Your goal</div>
            <p className="text-sm font-medium text-ink-800">{m.goal}</p>
          </div>
        )}
        <div className="label mt-5 mb-2">You'll be graded on</div>
        <ul className="space-y-2">
          {m.objectives.map((o, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-700">
              <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-accent-100 text-[11px] font-bold text-accent-700">{i + 1}</span>
              <span>{o}</span>
            </li>
          ))}
        </ul>
        <div className="label mt-5 mb-2">Their objections</div>
        <ul className="space-y-1.5">
          {s.objections.map((o, i) => (
            <li key={i} className="text-xs italic text-ink-500">“{o}”</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
