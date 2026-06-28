import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Spinner, EmptyState } from "@/components/ui";
import { HivemindChat } from "@/components/HivemindChat";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  ArrowLeft,
  Gavel,
  Drama,
  Megaphone,
  Lightbulb,
  Sparkles,
  MessageSquare,
  Network,
  type LucideIcon,
} from "lucide-react";

type Tab = "chat" | "mind";

/**
 * The Hivemind: a conversational agent over the whole training dataset ("Chat")
 * plus the live visualization of what every AI agent is thinking ("The mind").
 * Managers chat in team scope; reps chat with their personal coach.
 */
export default function Hivemind() {
  const viewer = useQuery(api.users.viewer);
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get("q") ?? undefined;
  const [tab, setTab] = useState<Tab>(params.get("tab") === "mind" ? "mind" : "chat");

  // A pending ?q means the user asked from the dashboard — land them in Chat.
  useEffect(() => {
    if (initialQuery) setTab("chat");
  }, [initialQuery]);

  const scope: "team" | "personal" = viewer?.role === "manager" ? "team" : "personal";

  function consumeQuery() {
    if (params.has("q")) {
      params.delete("q");
      setParams(params, { replace: true });
    }
  }

  return (
    <div className="w-full max-w-full animate-fade-up space-y-5 overflow-x-hidden">
      <Header scope={scope} />

      <div className="inline-flex rounded-[10px] border border-ink-900/12 bg-white p-1">
        {(
          [
            { key: "chat" as const, label: "Chat", icon: MessageSquare },
            { key: "mind" as const, label: "The mind", icon: Network },
          ]
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[7px] px-3.5 py-1.5 text-sm font-semibold transition",
                active ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-900",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "chat" ? (
        <HivemindChat scope={scope} initialQuery={initialQuery} onConsumeQuery={consumeQuery} />
      ) : (
        <MindView />
      )}
    </div>
  );
}

type AgentKey = "grader" | "buyer" | "coach" | "strategist";

const AGENT_META: Record<AgentKey, { icon: LucideIcon; color: string; ring: string; chip: string }> = {
  grader: { icon: Gavel, color: "text-violet-600", ring: "ring-violet-300", chip: "bg-violet-100 text-violet-700" },
  buyer: { icon: Drama, color: "text-magenta-600", ring: "ring-magenta-300", chip: "bg-magenta-300/40 text-magenta-600" },
  coach: { icon: Megaphone, color: "text-accent-700", ring: "ring-accent-300", chip: "bg-accent-100 text-accent-700" },
  strategist: { icon: Lightbulb, color: "text-amber-600", ring: "ring-amber-300", chip: "bg-amber-100 text-amber-700" },
};

function MindView() {
  const data = useQuery(api.hivemind.overview);
  const synthesize = useAction(api.ai.synthesizeMind);
  const navigate = useNavigate();

  const [filter, setFilter] = useState<AgentKey | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [aiNarrative, setAiNarrative] = useState(false);
  const [thinking, setThinking] = useState(false);
  const requested = useRef(false);

  // Ask the hive to synthesize a richer narrative once data is loaded.
  useEffect(() => {
    if (!data || requested.current) return;
    requested.current = true;
    if (data.stats.callsAnalyzed === 0) {
      setNarrative(data.consensus);
      return;
    }
    setThinking(true);
    synthesize({})
      .then((res) => {
        setNarrative(res.narrative || data.consensus);
        setAiNarrative(res.ai);
      })
      .catch(() => setNarrative(data.consensus))
      .finally(() => setThinking(false));
  }, [data, synthesize]);

  const thoughts = useMemo(() => {
    if (!data) return [];
    return filter ? data.thoughts.filter((t) => t.agent === filter) : data.thoughts;
  }, [data, filter]);

  if (data === undefined) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }
  if (data === null) {
    return <EmptyState title="Sign in to see the hive" description="The Hivemind reads the AI's work across your calls." />;
  }

  const empty = data.stats.callsAnalyzed === 0 && data.thoughts.length === 0;

  return (
    <div className="space-y-6">
      {/* ── The central mind ────────────────────────────────────────────────── */}
      <div className="glass-strong relative overflow-hidden p-5 sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-50 blur-3xl"
          style={{ backgroundImage: "radial-gradient(circle,#d3f24c66,transparent 70%)" }}
        />
        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
          <MindOrb mood={data.stats.mood} active={data.stats.agentsActive} />

          <div className="min-w-0 flex-1 space-y-4 text-left">
            <div className="flex flex-wrap items-center justify-start gap-2">
              <span className="label">Collective consciousness</span>
              <span className="pill text-[10px] capitalize text-ink-500">mood: {data.stats.mood}</span>
              {aiNarrative && (
                <span className="pill text-[10px] text-accent-700">
                  <Sparkles className="h-3 w-3" /> live synthesis
                </span>
              )}
            </div>

            <p className="min-h-[4.5rem] break-words text-left text-base font-medium leading-relaxed text-ink-800 sm:min-h-[3.5rem] sm:text-lg">
              {thinking && !narrative ? (
                <span className="inline-flex items-center gap-2 text-ink-400">
                  <Spinner className="h-4 w-4" /> the hive is thinking…
                </span>
              ) : (
                <Typewriter text={narrative ?? data.consensus} />
              )}
            </p>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Calls analyzed" value={data.stats.callsAnalyzed} />
              <Stat label="Agents active" value={`${data.stats.agentsActive}/4`} />
              <Stat label="Avg score" value={data.stats.avgScore || "—"} />
              <Stat label="Pass rate" value={`${data.stats.passRate}%`} />
            </div>
          </div>
        </div>
      </div>

      {/* ── The agents ──────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">The minds</h2>
          {filter && (
            <button onClick={() => setFilter(null)} className="text-xs font-semibold text-accent-700 hover:text-accent-800">
              Clear filter
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.agents.map((a) => {
            const meta = AGENT_META[a.key as AgentKey];
            const Icon = meta.icon;
            const selected = filter === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setFilter(selected ? null : (a.key as AgentKey))}
                className={cn(
                  "group rounded-md border bg-white p-4 text-left transition",
                  selected ? "border-ink-900" : "border-ink-900/[0.12] hover:border-ink-900/30",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f8f7f2] ring-2",
                      a.active ? meta.ring : "ring-ink-900/10",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", a.active ? meta.color : "text-ink-300")} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold leading-tight text-ink-900">{a.name}</div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          a.active ? "animate-pulse-soft bg-accent-500" : "bg-ink-300",
                        )}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                        {a.active ? "active" : "idle"}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-ink-500">{a.role}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* ── Thought stream ──────────────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
            Thought stream {filter && <span className="text-ink-400">· {AGENT_META[filter] ? filter : ""}</span>}
          </h2>
          {empty ? (
            <EmptyState
              title="The hive is asleep"
              description="Run a practice call and the agents will start grading, reflecting, and spotting patterns here."
            />
          ) : thoughts.length === 0 ? (
            <div className="glass px-5 py-10 text-center text-sm text-ink-500">
              No thoughts from this agent yet.
            </div>
          ) : (
            <ol className="relative space-y-2.5 pl-1">
              <AnimatePresence initial={false}>
                {thoughts.map((t, i) => {
                  const meta = AGENT_META[t.agent as AgentKey];
                  const Icon = meta.icon;
                  const clickable = !!t.link;
                  return (
                    <motion.li
                      key={t.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.2) }}
                    >
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => {
                          if (!t.link) return;
                          navigate(
                            t.link.kind === "attempt"
                              ? "/app/feedback/" + t.link.id
                              : "/app/module/" + t.link.id,
                          );
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-md border border-ink-900/[0.1] bg-white p-3.5 text-left transition",
                          clickable ? "cursor-pointer hover:border-ink-900/30" : "cursor-default",
                        )}
                      >
                        <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", meta.chip)}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.chip)}>
                              {t.agent}
                            </span>
                            {t.meta && <span className="min-w-0 truncate text-[11px] text-ink-400">{t.meta}</span>}
                            <span className="ml-auto shrink-0 text-[11px] text-ink-400">
                              {t.at ? formatRelativeTime(t.at) : ""}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "mt-1 break-words text-sm leading-relaxed",
                              t.tone === "good" ? "text-ink-800" : t.tone === "bad" ? "text-rose-700" : "text-ink-700",
                            )}
                          >
                            {t.text}
                          </p>
                        </div>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          )}
        </div>

        {/* ── Synapses ────────────────────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Synapses</h2>
          <div className="glass p-5">
            {data.synapses.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-400">
                Objective patterns appear once calls are graded.
              </p>
            ) : (
              <>
                <p className="mb-4 text-xs text-ink-500">
                  How reliably each objective fires across graded calls — the hive's memory.
                </p>
                <ul className="space-y-3.5">
                  {data.synapses.map((s) => (
                    <li key={s.objective} className="space-y-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{s.objective}</span>
                        <span className={cn("shrink-0 font-mono text-sm font-bold", synapseColor(s.hitRate))}>
                          {s.hitRate}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-900/10">
                        <div
                          className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${s.hitRate}%`, backgroundColor: synapseBar(s.hitRate) }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────────── */

/** The pulsing "brain" at the center of the hive. */
function MindOrb({ mood, active }: { mood: string; active: number }) {
  const alarmed = mood === "alarmed" || mood === "concerned";
  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center">
      {[0, 1, 2].map((r) => (
        <span
          key={r}
          className="absolute rounded-full border"
          style={{
            height: `${68 + r * 22}px`,
            width: `${68 + r * 22}px`,
            borderColor: alarmed ? "rgba(244,63,94,0.25)" : "rgba(170,207,36,0.35)",
            animation: `pulse-soft ${2.4 + r * 0.6}s ease-in-out infinite`,
            animationDelay: `${r * 0.3}s`,
          }}
        />
      ))}
      <span
        className="grid h-16 w-16 place-items-center rounded-full text-ink-900 shadow-glow"
        style={{ backgroundImage: "linear-gradient(135deg,#d4f55e,#aedb24)" }}
      >
        <BrainGlyph />
      </span>
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-ink-900/10 bg-white px-2 py-0.5 text-[10px] font-bold text-ink-600">
        {active} active
      </span>
    </div>
  );
}

function BrainGlyph() {
  // Concentric "neural" arcs — lightweight, no extra deps.
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 4c-2 0-3 1.4-3 3 0 .3 0 .6.1.9C8 8.2 7 9.3 7 10.8c0 .9.4 1.7 1 2.2-.4.5-.6 1.1-.6 1.8 0 1.6 1.3 2.7 2.9 2.7.4 1 1.3 1.5 2.2 1.5" />
      <path d="M12 4c2 0 3 1.4 3 3 0 .3 0 .6-.1.9 1.1.4 2.1 1.5 2.1 3 0 .9-.4 1.7-1 2.2.4.5.6 1.1.6 1.8 0 1.6-1.3 2.7-2.9 2.7-.4 1-1.3 1.5-2.2 1.5" />
      <path d="M12 4v15" />
    </svg>
  );
}

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return;
    const id = setInterval(() => {
      setN((prev) => {
        if (prev >= text.length) {
          clearInterval(id);
          return prev;
        }
        return prev + 2;
      });
    }, 16);
    return () => clearInterval(id);
  }, [text]);
  return (
    <span>
      {text.slice(0, n)}
      {n < text.length && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent-500 align-middle" />}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-ink-900/[0.1] bg-[#f8f7f2] px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-bold text-ink-900">{value}</div>
    </div>
  );
}

function synapseColor(hitRate: number): string {
  if (hitRate >= 70) return "text-accent-600";
  if (hitRate >= 50) return "text-amber-500";
  return "text-rose-500";
}
function synapseBar(hitRate: number): string {
  if (hitRate >= 70) return "#5f7d16";
  if (hitRate >= 50) return "#f59e0b";
  return "#f43f5e";
}

function Header({ scope }: { scope?: "team" | "personal" }) {
  return (
    <div className="space-y-3">
      <Link
        to="/app"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Hivemind</h1>
        <p className="text-sm text-ink-500">
          The collective mind of every AI agent behind your calls
          {scope === "personal" ? " — what they're learning about you." : " — what they're learning about the team."}
        </p>
      </div>
    </div>
  );
}
