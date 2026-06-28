import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useConversation } from "@elevenlabs/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ModuleDraft } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { VoicePoweredOrb } from "@/components/VoicePoweredOrb";
import { cn } from "@/lib/utils";
import { ArrowLeft, Sparkles, Mic, Keyboard, Pause, Play, Check, FileText, ArrowRight } from "lucide-react";

type Turn = { role: "assistant" | "manager"; text: string };
type Preview = {
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
};

const BUILD_LINES = ["Reading the interview…", "Designing the buyer…", "Weighting the rubric…", "Polishing the module…"];

export function VoiceInterview({
  interviewId,
  seed,
  onBuilt,
  onCancel,
  onSwitchToText,
}: {
  interviewId: Id<"interviews">;
  seed?: string;
  onBuilt: (draft: ModuleDraft) => void;
  onCancel: () => void;
  onSwitchToText: () => void;
}) {
  const getConfig = useAction(api.elevenlabs.getInterviewConfig);
  const saveTranscript = useMutation(api.interviews.saveTranscript);
  const generateModule = useAction(api.ai.generateModule);
  const previewDraft = useAction(api.ai.previewDraft);

  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "building">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [buildLine, setBuildLine] = useState(0);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ready, setReady] = useState(false); // AI confirmed it has enough → stop & send
  const turnsRef = useRef<Turn[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewBusy = useRef(false);
  const endedRef = useRef(false);

  const conversation = useConversation({
    onConnect: () => setPhase("live"),
    onError: () => setError("Call error — check mic permissions."),
    onMessage: (msg: { source?: string; message?: string }) => {
      const text = msg.message ?? "";
      if (!text) return;
      const role: Turn["role"] = msg.source === "user" ? "manager" : "assistant";
      turnsRef.current = [...turnsRef.current, { role, text }];
      setTurns([...turnsRef.current]);
      // The interviewer signals it's done — stop the call and show "Send module".
      if (role === "assistant" && /everything i need to build|ready to build this|got everything i need|have everything i need/i.test(text)) {
        setReady(true);
      }
    },
  });

  // When the AI confirms it's done, end the session — but let it FINISH its
  // closing line first so it doesn't get cut off mid-sentence.
  useEffect(() => {
    if (!ready || endedRef.current) return;
    const stop = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      (conversation as unknown as { endSession?: () => Promise<void> }).endSession?.().catch(() => {});
    };
    // Hang up shortly after it stops speaking; hard-cap so we never hang on.
    const delay = conversation.isSpeaking ? 6000 : 900;
    const t = setTimeout(stop, delay);
    return () => clearTimeout(t);
  }, [ready, conversation, conversation.isSpeaking]);
  const isSpeaking = conversation.isSpeaking;
  const live = phase === "live" || conversation.status === "connected";

  // Live audio level drives the orb (your voice while talking, the AI's when it answers).
  const [level, setLevel] = useState(0);
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
  const managerTurns = turns.filter((t) => t.role === "manager").length;
  const canBuild = managerTurns >= 2;

  // Auto-scroll the live transcript.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // Live "filling out the module" — re-extract the draft as the user talks.
  useEffect(() => {
    if (!live || managerTurns === 0 || previewBusy.current) return;
    previewBusy.current = true;
    previewDraft({ turns: turnsRef.current })
      .then((p) => setPreview(p))
      .catch(() => {})
      .finally(() => {
        previewBusy.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerTurns, live]);

  function togglePause() {
    const c = conversation as unknown as { setMicMuted?: (m: boolean) => void };
    c.setMicMuted?.(!paused);
    setPaused((p) => !p);
  }

  const start = useCallback(async () => {
    setError(null);
    setPhase("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access is required to talk it through.");
      setPhase("idle");
      return;
    }
    let config;
    try {
      config = await getConfig({ seed });
    } catch {
      setError("Couldn't set up the interviewer.");
      setPhase("idle");
      return;
    }
    if (!config.configured || (!config.agentId && !config.signedUrl)) {
      setNotice("Voice isn't configured here (no ELEVENLABS_AGENT_ID). You can type the interview instead.");
      setPhase("idle");
      return;
    }
    try {
      const args: Record<string, unknown> = {
        connectionType: "webrtc",
        overrides: { agent: { prompt: { prompt: config.prompt }, firstMessage: config.firstMessage, language: "en" } },
      };
      if (config.signedUrl) args.signedUrl = config.signedUrl;
      else args.agentId = config.agentId;
      await conversation.startSession(args as never);
    } catch {
      setError("Couldn't connect. Check the ElevenLabs agent (overrides must be enabled).");
      setPhase("idle");
    }
  }, [conversation, getConfig]);

  const build = useCallback(async () => {
    setPhase("building");
    setBuildLine(0);
    const ticker = setInterval(() => setBuildLine((i) => (i + 1) % BUILD_LINES.length), 1400);
    try {
      await conversation.endSession().catch(() => {});
      const captured = turnsRef.current.length
        ? turnsRef.current
        : [{ role: "manager" as const, text: "Build a realistic cold-call practice module for my reps." }];
      await saveTranscript({ interviewId, turns: captured });
      const draft = await generateModule({ interviewId });
      onBuilt(draft as ModuleDraft);
    } catch {
      setError("Couldn't build the module from the call. Try again or type it.");
      setPhase("live");
    } finally {
      clearInterval(ticker);
    }
  }, [conversation, saveTranscript, generateModule, interviewId, onBuilt]);

  if (phase === "building") {
    return (
      <div className="glass-strong flex min-h-[60vh] flex-col items-center justify-center gap-6 p-10 text-center animate-fade-up">
        <Spinner className="h-10 w-10 text-accent-500" />
        <div>
          <h2 className="text-lg font-extrabold text-ink-900">Building your module…</h2>
          <p className="mt-2 text-sm text-ink-500">{BUILD_LINES[buildLine]}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-xs text-ink-400 transition hover:text-ink-700">
        <ArrowLeft className="h-3.5 w-3.5" /> back
      </button>

      <div className="glass-strong grid gap-6 p-8 animate-fade-up lg:grid-cols-[1fr_340px]">
        {/* Talk stage */}
        <div className="flex flex-col items-center justify-center text-center">
          {paused && live && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              <Pause className="h-3 w-3" /> Paused — your mic is muted
            </div>
          )}
          <div className="label text-accent-600">New module · voice</div>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight text-ink-900">Talk me through the scenario</h1>
          <p className="mt-1 max-w-sm text-sm text-ink-500">
            I'll interview you out loud — just answer naturally, then build the module.
          </p>

          <div className="my-6">
            <VoicePoweredOrb active={isSpeaking} amplitude={live ? level : undefined} size={220} />
          </div>

          <div className="h-5 text-sm">
            {ready && <span className="font-semibold text-accent-700">✓ Got everything I need.</span>}
            {!ready && phase === "connecting" && <span className="text-ink-500">Connecting…</span>}
            {!ready && live && <span className="font-mono font-semibold text-accent-600">● Listening{isSpeaking ? " · speaking" : ""}</span>}
            {!ready && phase === "idle" && <span className="text-ink-400">Ready when you are.</span>}
          </div>
          {error && <p className="mt-3 max-w-sm text-sm text-rose-500">{error}</p>}
          {notice && (
            <p className="mt-3 max-w-sm rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs text-amber-700">{notice}</p>
          )}

          {ready ? (
            <div className="mt-5 w-full max-w-sm animate-fade-up">
              <div className="rounded-md border border-accent-300 bg-accent-50 px-4 py-3 text-sm text-ink-800">
                Perfect — I've got what I need. Review it next: edit anything, ask AI to tweak it, then save as a draft, schedule it, or publish to your team.
              </div>
              <Button variant="primary" onClick={() => void build()} className="mt-4 w-full">
                Review module <ArrowRight className="h-4 w-4" />
              </Button>
              <div className="mt-3 flex items-center justify-center gap-4 text-sm">
                <button onClick={onSwitchToText} className="inline-flex items-center gap-1.5 font-semibold text-ink-500 hover:text-ink-800">
                  <Keyboard className="h-4 w-4" /> Add more by typing
                </button>
                <button onClick={onCancel} className="font-semibold text-ink-400 hover:text-ink-700">Start over</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {!live && phase !== "connecting" && (
                  <Button onClick={() => void start()} className="px-6">
                    <Mic className="h-4 w-4" /> Start talking
                  </Button>
                )}
                {phase === "connecting" && <Button loading className="px-6">Connecting</Button>}
                {live && (
                  <>
                    <Button variant="ghost" onClick={togglePause} className="px-5">
                      {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      {paused ? "Resume" : "Pause"}
                    </Button>
                    <Button variant="primary" onClick={() => void build()} disabled={!canBuild} className="px-6">
                      <Sparkles className="h-4 w-4" /> Review module
                    </Button>
                  </>
                )}
                <button onClick={onSwitchToText} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800">
                  <Keyboard className="h-4 w-4" /> Type instead
                </button>
              </div>
              {live && !canBuild && <p className="mt-3 text-xs text-ink-400">Answer a couple of questions, then you can build.</p>}
            </>
          )}
        </div>

        {/* Right rail: live module fill + transcript */}
        <aside className="flex max-h-[64vh] flex-col gap-4">
          {/* The full module filling out live as you talk */}
          <div className="surface max-h-[40vh] overflow-y-auto p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-400">
              <FileText className="h-3.5 w-3.5" /> Building your module
              {preview && <span className="ml-auto inline-flex items-center gap-1 text-accent-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-500" />live</span>}
            </div>
            <PreviewField label="Title" value={preview?.title} />
            <PreviewField label="What it's about" value={preview?.description} multiline />
            <PreviewField label="Goal" value={preview?.goal} multiline />
            <PreviewField
              label="Counterpart"
              value={preview ? [preview.buyerName, preview.buyerTitle].filter(Boolean).join(" · ") : ""}
            />
            <PreviewField label="Company" value={preview?.company} />
            <PreviewField label="Personality" value={preview?.personality} multiline />
            <PreviewField label="Difficulty" value={preview?.difficulty} />
            <PreviewList label="Pushback / objections" items={preview?.objections} />
            <PreviewList label="Must nail" items={preview?.objectives} check />
            <PreviewList label="Grading rubric" items={preview?.rubric} />
          </div>

          {/* Auto-scrolling transcript */}
          <div className="surface flex min-h-[140px] flex-1 flex-col overflow-hidden p-0">
            <div className="border-b border-ink-900/[0.06] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-400">
              Live transcript
            </div>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
              {turns.length === 0 && <p className="text-sm text-ink-400">Your conversation will appear here…</p>}
              {turns.map((t, i) => (
                <div key={i} className={t.role === "manager" ? "text-right" : "text-left"}>
                  <span
                    className={cn(
                      "inline-block max-w-[92%] rounded-md px-3 py-1.5 text-sm",
                      t.role === "manager"
                        ? "rounded-br-sm bg-accent-300/40 text-ink-900"
                        : "rounded-bl-sm bg-ink-50 text-ink-700",
                    )}
                  >
                    {t.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PreviewField({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  return (
    <div className="mb-2.5">
      <div className="label mb-0.5">{label}</div>
      {value ? (
        <div className={cn("animate-fade-up text-ink-900", multiline ? "text-xs leading-relaxed text-ink-700" : "text-sm font-semibold")}>
          {value}
        </div>
      ) : (
        <div className="h-3 w-1/2 rounded shimmer" />
      )}
    </div>
  );
}

function PreviewList({ label, items, check }: { label: string; items?: string[]; check?: boolean }) {
  return (
    <div className="mb-2.5">
      <div className="label mb-1">{label}</div>
      {items && items.length ? (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-ink-700 animate-fade-up">
              {check ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent-600" />
              ) : (
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
              )}
              {it}
            </li>
          ))}
        </ul>
      ) : (
        <div className="h-3 w-2/3 rounded shimmer" />
      )}
    </div>
  );
}
