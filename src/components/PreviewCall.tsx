import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { useConversation } from "@elevenlabs/react";
import { api } from "../../convex/_generated/api";
import { Button, Spinner } from "@/components/ui";
import { VoicePoweredOrb } from "@/components/VoicePoweredOrb";
import { cn } from "@/lib/utils";
import { Mic, X, Sparkles, Phone } from "lucide-react";

type Scenario = {
  buyerName: string;
  buyerTitle: string;
  company: string;
  personality: string;
  objections: string[];
  difficulty: string;
};

/**
 * Author preview: the senior salesperson talks to the buyer built from the
 * current (possibly unsaved) draft — no graded attempt — and can adjust the
 * scenario by voice. `onAdjust` revises the draft in the parent and returns the
 * updated scenario, which we use to auto-reconnect so the change is heard live.
 */
export function PreviewCall({
  title,
  description,
  scenario,
  voiceId,
  onAdjust,
  onClose,
}: {
  title: string;
  description: string;
  scenario: Scenario;
  voiceId?: string;
  onAdjust: (instruction: string) => Promise<Scenario | null>;
  onClose: () => void;
}) {
  const getPreviewConfig = useAction(api.elevenlabs.getPreviewConfig);
  const [sc, setSc] = useState<Scenario>(scenario); // live scenario (updated by adjustments)
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "ending">("idle");
  const [lastLine, setLastLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [applying, setApplying] = useState(false);
  const [adjustNote, setAdjustNote] = useState<string | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const speakingRef = useRef(false);
  const scRef = useRef<Scenario>(scenario);

  const conversation = useConversation({
    onConnect: () => setPhase("live"),
    onError: () => setError("Call error — check mic permissions."),
    onMessage: (msg: { source?: string; message?: string }) => {
      if (!msg.message) return;
      const who = msg.source === "user" ? "You" : scRef.current.buyerName.split(" ")[0];
      setLastLine(`${who}: ${msg.message}`);
    },
  });
  const live = phase === "live" || conversation.status === "connected";
  useEffect(() => {
    speakingRef.current = conversation.isSpeaking;
  }, [conversation.isSpeaking]);
  useEffect(() => {
    scRef.current = sc;
  }, [sc]);

  /** Connect to the buyer built from a specific scenario. */
  const connect = useCallback(
    async (useScenario: Scenario) => {
      setError(null);
      setPhase("connecting");
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError("Microphone access is needed to preview.");
        setPhase("idle");
        return;
      }
      let config;
      try {
        config = await getPreviewConfig({ title, description, scenario: useScenario, voiceId });
      } catch {
        setError("Couldn't build the buyer.");
        setPhase("idle");
        return;
      }
      if (!config.configured || (!config.agentId && !config.signedUrl)) {
        setError("Live voice isn't configured on this deployment.");
        setPhase("idle");
        return;
      }
      try {
        const args: Record<string, unknown> = {
          connectionType: "webrtc",
          overrides: {
            agent: { prompt: { prompt: config.prompt }, firstMessage: config.firstMessage, language: "en" },
            ...(config.voiceId ? { tts: { voiceId: config.voiceId } } : {}),
          },
        };
        if (config.signedUrl) args.signedUrl = config.signedUrl;
        else args.agentId = config.agentId;
        await conversation.startSession(args as never);
      } catch {
        setError("Couldn't connect to the buyer (the agent must allow prompt overrides).");
        setPhase("idle");
      }
    },
    [conversation, getPreviewConfig, title, description, voiceId],
  );

  const stop = useCallback(async () => {
    setPhase("ending");
    try {
      const t = Date.now();
      while (speakingRef.current && Date.now() - t < 4000) await new Promise((r) => setTimeout(r, 150));
    } catch {
      /* ignore */
    }
    try {
      await conversation.endSession();
    } catch {
      /* ignore */
    }
    setPhase("idle");
  }, [conversation]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      try {
        void conversation.endSession();
      } catch {
        /* ignore */
      }
      recRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const voiceIn =
    typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  async function applyAdjust(instruction: string) {
    setApplying(true);
    setAdjustNote(null);
    try {
      const next = await onAdjust(instruction);
      if (!next) {
        setAdjustNote("Nothing to change.");
        return;
      }
      setSc(next);
      scRef.current = next;
      if (live) {
        // Auto-reload: reconnect so the buyer reflects the change immediately.
        setAdjustNote("Applied — reconnecting with your change…");
        try {
          await conversation.endSession();
        } catch {
          /* ignore */
        }
        await connect(next);
        setAdjustNote(`Applied “${instruction}”.`);
      } else {
        setAdjustNote(`Applied “${instruction}”. Tap “Talk to the buyer” to hear it.`);
      }
    } catch {
      setAdjustNote("Couldn't apply that — try rephrasing.");
    } finally {
      setApplying(false);
    }
  }

  function toggleAdjustMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const SR = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const instruction = finalText.trim();
      if (instruction) void applyAdjust(instruction);
    };
    rec.onerror = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const firstName = sc.buyerName.split(" ")[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="label text-accent-700">Preview the buyer</div>
            <h2 className="truncate text-lg font-bold text-ink-900">{sc.buyerName}</h2>
            <p className="truncate text-xs text-ink-500">
              {sc.buyerTitle} · {sc.company}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-400 transition hover:bg-ink-900/[0.06] hover:text-ink-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stage */}
        <div className="mt-4 flex flex-col items-center">
          <VoicePoweredOrb active={conversation.isSpeaking} size={150} />
          <div className="mt-4 h-5 text-sm">
            {phase === "connecting" && <span className="text-ink-500">Connecting…</span>}
            {live && <span className="font-mono font-semibold text-accent-600">● Live</span>}
            {phase === "idle" && <span className="text-ink-400">Tap to talk to {firstName}.</span>}
            {phase === "ending" && <span className="text-ink-500">Ending…</span>}
          </div>
          {live && lastLine && (
            <p className="mt-2 max-w-md animate-fade-up text-center text-sm text-ink-500">{lastLine}</p>
          )}
          {error && <p className="mt-2 max-w-md text-center text-sm text-rose-500">{error}</p>}

          <div className="mt-4 flex gap-2">
            {!live && phase !== "connecting" && phase !== "ending" && (
              <Button onClick={() => void connect(sc)} className="px-6">
                <Phone className="h-4 w-4" /> Talk to the buyer
              </Button>
            )}
            {phase === "connecting" && <Button loading className="px-6">Connecting</Button>}
            {live && (
              <Button variant="danger" onClick={() => void stop()} className="px-6">
                Hang up
              </Button>
            )}
          </div>
        </div>

        {/* Adjust by voice */}
        <div className="mt-5 rounded-md border border-ink-900/10 bg-[#f8f7f2] p-4">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-600" />
            <span className="text-sm font-bold text-ink-900">Adjust by voice</span>
          </div>
          <p className="mb-3 text-xs text-ink-500">
            Speak a change and the scenario updates live — e.g. “make her more skeptical about comp” or “add an
            objection about remote work.”
          </p>
          {voiceIn ? (
            <button
              onClick={toggleAdjustMic}
              disabled={applying}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50",
                listening
                  ? "animate-pulse border-rose-400 bg-rose-50 text-rose-600"
                  : "border-ink-900/15 bg-white text-ink-700 hover:border-ink-900/35",
              )}
            >
              {applying ? (
                <>
                  <Spinner className="h-4 w-4" /> Applying…
                </>
              ) : (
                <>
                  <Mic className={cn("h-4 w-4", listening && "text-rose-500")} />
                  {listening ? "Listening… tap to apply" : "Tap & say a change"}
                </>
              )}
            </button>
          ) : (
            <p className="text-xs text-ink-400">Voice isn't supported in this browser — use the AI-revise box in the editor.</p>
          )}
          {adjustNote && <p className="mt-2 text-xs font-medium text-accent-700">{adjustNote}</p>}
        </div>
      </div>
    </div>
  );
}
