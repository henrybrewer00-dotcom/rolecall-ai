import { useEffect, useRef, useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigate } from "react-router-dom";
import { Spinner, DifficultyBadge } from "./ui";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  Sparkles,
  Plus,
  Users,
  LayoutGrid,
  PlayCircle,
  BookOpen,
  Check,
  ArrowUpRight,
  Mic,
  Volume2,
  VolumeX,
} from "lucide-react";

type Ref = { kind: "rep" | "module" | "attempt"; id: string; label: string; reason?: string };
type Draft = {
  module: {
    title: string;
    description: string;
    goal?: string;
    scenario: { buyerName: string; buyerTitle: string; company: string; difficulty: string; objections: string[] };
    objectives: string[];
  };
  repId?: string;
  repName?: string;
  createdModuleId?: string;
};
type Msg = { role: "user" | "assistant"; content: string; at: number; refs?: Ref[]; draft?: Draft };

const SUGGESTIONS_TEAM = [
  "Who's struggling to close?",
  "Compare my top and bottom rep",
  "Draft a price-objection course for our weakest rep",
  "Which objective does the team miss most?",
];
const SUGGESTIONS_PERSONAL = [
  "Where am I losing points?",
  "How's my talk ratio and pace?",
  "What should I drill next?",
  "Build me a drill for handling objections",
];

/**
 * Lightweight Markdown: paragraphs, `- ` bullets, and **bold**. A bullet that
 * starts with a `**Label:**` renders as a distinct boxed row — the scannable
 * "box answer" look. No deps.
 */
function Rich({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const isList = lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l));
        if (isList) {
          return (
            <div key={bi} className="space-y-1.5">
              {lines.map((l, li) => {
                const body = l.replace(/^\s*[-*]\s+/, "");
                const m = body.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/);
                if (m) {
                  return (
                    <div
                      key={li}
                      className="flex flex-col gap-0.5 rounded-lg border border-ink-900/[0.08] bg-[#f8f7f2] px-3 py-2 sm:flex-row sm:items-baseline sm:gap-2.5"
                    >
                      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-accent-700">
                        {m[1]}
                      </span>
                      <span className="text-sm leading-snug text-ink-800">{inline(m[2])}</span>
                    </div>
                  );
                }
                return (
                  <div key={li} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-500" />
                    <span>{inline(body)}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        return (
          <p key={bi} className="leading-relaxed">
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-bold text-ink-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function HivemindChat({
  scope,
  initialQuery,
  onConsumeQuery,
}: {
  scope: "team" | "personal";
  initialQuery?: string;
  onConsumeQuery?: () => void;
}) {
  const thread = useQuery(api.hivemindChat.activeThread);
  const respond = useAction(api.ai.hivemindRespond);
  const startThread = useMutation(api.hivemindChat.startThread);
  const materialize = useMutation(api.hivemindChat.materializeDraft);
  const navigate = useNavigate();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const threadIdRef = useRef<Id<"hivemindThreads"> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);
  const recognitionRef = useRef<any>(null);
  const spokenRef = useRef(0);

  const voiceIn =
    typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const voiceOut = typeof window !== "undefined" && "speechSynthesis" in window;

  if (thread) threadIdRef.current = thread._id;

  const messages: Msg[] = (thread?.messages as Msg[]) ?? [];
  const lastIsOptimistic =
    optimistic !== null && (messages.length === 0 || messages[messages.length - 1].content !== optimistic);

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    setInput("");
    setSending(true);
    setOptimistic(q);
    try {
      let id = threadIdRef.current;
      if (!id) {
        id = await startThread({});
        threadIdRef.current = id;
      }
      await respond({ threadId: id, message: q });
    } finally {
      setSending(false);
      setOptimistic(null);
    }
  }

  // Fire the question the user typed on the dashboard.
  useEffect(() => {
    if (initialQuery && !autoSent.current) {
      autoSent.current = true;
      void send(initialQuery);
      onConsumeQuery?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Keep pinned to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  // Speak new assistant replies aloud while "speak replies" is on.
  useEffect(() => {
    if (!ttsOn || !voiceOut) return;
    if (messages.length <= spokenRef.current) return;
    const last = messages[messages.length - 1];
    spokenRef.current = messages.length;
    if (!last || last.role !== "assistant") return;
    const clean = last.content.replace(/\*\*/g, "").replace(/^\s*[-*]\s+/gm, "").slice(0, 700);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, ttsOn]);

  // Dictate into the composer; auto-send when the user stops talking.
  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      const t = finalText.trim();
      if (t) void send(t);
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function toggleTts() {
    setTtsOn((on) => {
      const next = !on;
      if (next) spokenRef.current = messages.length; // only speak future replies
      else if (voiceOut) window.speechSynthesis.cancel();
      return next;
    });
  }

  async function newChat() {
    const id = await startThread({});
    threadIdRef.current = id;
    autoSent.current = true; // don't re-fire the URL query
  }

  async function approveDraft(messageIndex: number) {
    const id = threadIdRef.current;
    if (!id) return;
    const { moduleId, scope: s } = await materialize({ threadId: id, messageIndex });
    // Personal drills live in the practice zone; manager modules open to review/publish.
    navigate(s === "personal" ? "/app/drills" : "/app/module/" + moduleId);
  }

  const suggestions = scope === "team" ? SUGGESTIONS_TEAM : SUGGESTIONS_PERSONAL;
  const empty = messages.length === 0 && !lastIsOptimistic && !sending;

  return (
    <div className="glass-strong flex h-[min(72vh,720px)] flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-ink-900/[0.08] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-accent-300 to-accent-500 text-ink-900 shadow-glow">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-bold text-ink-900">Hivemind</div>
            <div className="text-[11px] text-ink-500">
              {scope === "team" ? "Chatting with all your team's data" : "Your personal coach — everything it knows about you"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {voiceOut && (
            <button
              onClick={toggleTts}
              aria-label={ttsOn ? "Mute spoken replies" : "Speak replies aloud"}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full border transition",
                ttsOn
                  ? "border-accent-500 bg-accent-100 text-accent-700"
                  : "border-ink-900/12 bg-white text-ink-500 hover:text-ink-900",
              )}
            >
              {ttsOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={newChat} className="btn-soft h-8 px-3 text-xs">
              <Plus className="h-3.5 w-3.5" />
              New chat
            </button>
          )}
        </div>
      </div>

      {/* Message stream */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {empty ? (
          <div className="grid h-full place-items-center px-2 text-center">
            <div className="max-w-md space-y-4">
              <p className="text-base font-semibold text-ink-800">
                Ask me anything about {scope === "team" ? "your team" : "your calls"}.
              </p>
              <p className="text-sm text-ink-500">
                I can read every score, transcript, talk ratio and rubric — and draft a
                {scope === "team" ? " personalized course for any rep." : " drill tuned to your weak spots."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-ink-900/15 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:border-ink-900/40 hover:text-ink-900"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <UserBubble key={i} text={m.content} />
              ) : (
                <AssistantBubble
                  key={i}
                  msg={m}
                  scope={scope}
                  onRef={(r) => {
                    if (r.kind === "attempt") navigate("/app/feedback/" + r.id);
                    else if (r.kind === "module") navigate("/app/module/" + r.id);
                    else if (r.kind === "rep" && scope === "team") navigate("/app/rep/" + r.id);
                  }}
                  onApprove={() => approveDraft(i)}
                  onOpenModule={(id) => navigate(scope === "personal" ? "/app/drills" : "/app/module/" + id)}
                />
              ),
            )}
            {lastIsOptimistic && <UserBubble text={optimistic!} />}
            {sending && <Thinking />}
          </>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-ink-900/[0.08] bg-white/60 px-4 py-3 sm:px-5">
        <div className="flex items-end gap-2 rounded-[10px] border border-ink-900/15 bg-white p-1.5 shadow-sm transition focus-within:border-ink-900/40">
          {voiceIn && (
            <button
              onClick={toggleMic}
              aria-label={listening ? "Stop listening" : "Speak your question"}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border transition",
                listening
                  ? "animate-pulse border-rose-400 bg-rose-50 text-rose-600"
                  : "border-ink-900/12 bg-white text-ink-500 hover:text-ink-900",
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder={
              listening
                ? "Listening…"
                : scope === "team"
                  ? "Ask about a rep, or 'draft a course for…'"
                  : "Ask your coach anything…"
            }
            className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || sending}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-accent-400 text-ink-900 transition hover:bg-accent-500 disabled:opacity-40"
          >
            {sending ? <Spinner className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
        {voiceIn && (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-medium text-ink-400">
            <Mic className={cn("h-3 w-3", listening && "text-rose-500")} />
            <span>
              {listening
                ? "Listening… tap to stop"
                : voiceOut
                  ? "Tap to speak — answers are read aloud"
                  : "Tap to speak your question"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink-900 px-4 py-2.5 text-sm text-white">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({
  msg,
  scope,
  onRef,
  onApprove,
  onOpenModule,
}: {
  msg: Msg;
  scope: "team" | "personal";
  onRef: (r: Ref) => void;
  onApprove: () => void;
  onOpenModule: (id: string) => void;
}) {
  const refs = (msg.refs ?? []).filter((r) => !(r.kind === "rep" && scope === "personal"));
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f8f7f2] ring-1 ring-ink-900/10">
        <Sparkles className="h-3.5 w-3.5 text-accent-600" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="text-sm text-ink-800">
          <Rich text={msg.content} />
        </div>

        {refs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {refs.map((r, i) => (
              <button
                key={i}
                onClick={() => onRef(r)}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-900/12 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 transition hover:border-ink-900/35 hover:text-ink-900"
              >
                {r.kind === "rep" ? (
                  <Users className="h-3 w-3 text-accent-600" />
                ) : r.kind === "module" ? (
                  <LayoutGrid className="h-3 w-3 text-accent-500" />
                ) : (
                  <PlayCircle className="h-3 w-3 text-violet-500" />
                )}
                {r.label}
              </button>
            ))}
          </div>
        )}

        {msg.draft && (
          <DraftCard draft={msg.draft} scope={scope} onApprove={onApprove} onOpenModule={onOpenModule} />
        )}
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  scope,
  onApprove,
  onOpenModule,
}: {
  draft: Draft;
  scope: "team" | "personal";
  onApprove: () => void;
  onOpenModule: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const created = !!draft.createdModuleId;
  const m = draft.module;
  return (
    <div className="overflow-hidden rounded-xl border border-accent-300/60 bg-white">
      <div className="flex items-center gap-2 border-b border-accent-300/40 bg-accent-100/60 px-4 py-2">
        <BookOpen className="h-3.5 w-3.5 text-accent-700" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-accent-700">
          Drafted course{draft.repName ? ` · for ${draft.repName}` : ""}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink-900">{m.title}</span>
            <DifficultyBadge difficulty={m.scenario.difficulty} />
          </div>
          <p className="mt-1 text-sm text-ink-500">{m.description}</p>
        </div>
        <div className="rounded-lg bg-ink-900/[0.03] px-3 py-2 text-xs text-ink-600">
          <span className="font-semibold text-ink-700">Buyer:</span> {m.scenario.buyerName}, {m.scenario.buyerTitle} ·{" "}
          {m.scenario.company}
        </div>
        <ul className="space-y-1">
          {m.objectives.slice(0, 5).map((o, i) => (
            <li key={i} className="flex gap-2 text-xs text-ink-700">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" />
              {o}
            </li>
          ))}
        </ul>
        {created ? (
          <button onClick={() => onOpenModule(draft.createdModuleId!)} className="btn-soft w-full justify-center">
            <ArrowUpRight className="h-4 w-4" />
            {scope === "team" ? "Open module to review & publish" : "Open drill"}
          </button>
        ) : (
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await onApprove();
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-accent-400 px-4 py-2.5 text-sm font-bold text-ink-900 transition hover:bg-accent-500 disabled:opacity-50"
          >
            {busy ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {scope === "team" ? `Create & target ${draft.repName ?? "this rep"}` : "Add to my drills"}
          </button>
        )}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f8f7f2] ring-1 ring-ink-900/10">
        <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent-600" />
      </span>
      <div className="flex items-center gap-1.5 pt-1.5 text-sm text-ink-400">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-300 [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-300 [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-300" />
        <span className="ml-1.5 text-xs">the hive is thinking…</span>
      </div>
    </div>
  );
}
