import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { DifficultyBadge, Spinner, EmptyState } from "@/components/ui";
import { cn, scoreColor, formatRelativeTime } from "@/lib/utils";
import { ArrowLeft, Search, FileText, Clock, X, MessageSquareQuote, ExternalLink } from "lucide-react";

type Filter = "all" | "passed" | "failed" | "transcript";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed" },
  { key: "transcript", label: "Has transcript" },
];

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function History() {
  const rows = useQuery(api.attempts.history);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Id<"attempts"> | null>(null);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        q &&
        !r.repName.toLowerCase().includes(q) &&
        !r.moduleTitle.toLowerCase().includes(q) &&
        !r.buyerName.toLowerCase().includes(q)
      )
        return false;
      if (filter === "passed") return r.passed === true;
      if (filter === "failed") return r.passed === false;
      if (filter === "transcript") return r.hasTranscript;
      return true;
    });
  }, [rows, query, filter]);

  // On desktop, auto-select the first call so the transcript pane isn't empty.
  useEffect(() => {
    if (selected) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      const first = filtered.find((r) => r.hasTranscript) ?? filtered[0];
      if (first) setSelected(first.attemptId as Id<"attempts">);
    }
  }, [filtered, selected]);

  if (rows === undefined) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="w-full animate-fade-up space-y-6">
        <Header count={0} />
        <EmptyState
          title="No calls yet"
          description="Every practice call — and its full transcript — will show up here once reps start practicing."
        />
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-up space-y-6">
      <Header count={rows.length} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Search by rep, module, or buyer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "pill cursor-pointer transition",
                filter === f.key ? "bg-accent-500 text-white shadow-glow" : "text-ink-600 hover:text-ink-900",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Master / detail */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_1.35fr]">
        {/* List */}
        <ul className="space-y-2.5">
          {filtered.length === 0 ? (
            <li className="glass px-5 py-10 text-center text-sm text-ink-500">No calls match your filters.</li>
          ) : (
            filtered.map((r) => {
              const active = selected === r.attemptId;
              return (
                <li key={r.attemptId}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.attemptId as Id<"attempts">)}
                    className={cn(
                      "w-full rounded-md border bg-white p-4 text-left transition",
                      active
                        ? "border-ink-900 shadow-[0_1px_3px_rgba(20,22,26,0.06),0_12px_28px_-22px_rgba(20,22,26,0.22)]"
                        : "border-ink-900/[0.12] hover:border-ink-900/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-bold text-ink-900">{r.moduleTitle}</span>
                          {r.visibility === "private" && (
                            <span className="pill text-[10px] text-ink-400">private</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-500">
                          {r.repName} · vs {r.buyerName}
                        </p>
                      </div>
                      <ScorePill status={r.status} score={r.score} passed={r.passed} />
                    </div>

                    {r.hasTranscript ? (
                      <p className="mt-2 line-clamp-2 text-xs italic text-ink-500">"{r.preview}…"</p>
                    ) : (
                      <p className="mt-2 text-xs text-ink-400">No transcript captured.</p>
                    )}

                    <div className="mt-2.5 flex items-center gap-2.5 text-[11px] text-ink-400">
                      <DifficultyBadge difficulty={r.difficulty} />
                      {r.hasTranscript && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {r.turnCount} lines
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fmtDuration(r.durationSec)}
                      </span>
                      <span className="ml-auto">{formatRelativeTime(r.at)}</span>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {/* Detail (desktop sticky pane) */}
        <div className="hidden lg:block">
          <div className="sticky top-8">
            {selected ? (
              <TranscriptPanel attemptId={selected} />
            ) : (
              <div className="glass grid h-72 place-items-center px-8 text-center text-sm text-ink-400">
                Select a call to read its full transcript.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail (mobile drawer) */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key="drawer"
            className="fixed inset-0 z-50 flex lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-ink-900/40" onClick={() => setSelected(null)} />
            <motion.div
              className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl p-4 pb-8"
              style={{ backgroundColor: "#f1f0ea" }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.24 }}
            >
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink-900/15" />
              <TranscriptPanel attemptId={selected} onClose={() => setSelected(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Transcript rendering ──────────────────────────────────────────────────── */

type Turn = { speaker: string; text: string; isRep: boolean };

function parseTranscript(transcript: string, buyerName: string): Turn[] {
  const buyer = buyerName.toLowerCase();
  const turns: Turn[] = [];
  for (const raw of transcript.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
    if (m) {
      const speaker = m[1].trim();
      const lower = speaker.toLowerCase();
      const isRep = /\b(rep|you|me|seller|candidate|agent\s*\(you\))\b/.test(lower) && !lower.includes(buyer);
      turns.push({ speaker, text: m[2].trim(), isRep });
    } else if (turns.length) {
      // Continuation of the previous speaker's line.
      turns[turns.length - 1].text += " " + line;
    } else {
      turns.push({ speaker: buyerName, text: line, isRep: false });
    }
  }
  return turns;
}

function TranscriptPanel({ attemptId, onClose }: { attemptId: Id<"attempts">; onClose?: () => void }) {
  const attempt = useQuery(api.attempts.get, { attemptId });
  const navigate = useNavigate();

  if (attempt === undefined) {
    return (
      <div className="glass grid h-72 place-items-center">
        <Spinner className="h-7 w-7 text-accent-500" />
      </div>
    );
  }
  if (attempt === null) {
    return <div className="glass px-6 py-10 text-center text-sm text-ink-500">Call not found.</div>;
  }

  const module = attempt.module;
  const buyerName = module?.scenario.buyerName ?? "Buyer";
  const transcript = attempt.callTranscript ?? "";
  const turns = transcript.trim() ? parseTranscript(transcript, buyerName) : [];
  const scored = typeof attempt.score === "number";

  return (
    <div className="glass-strong overflow-hidden">
      {/* Panel header */}
      <div className="flex items-start justify-between gap-3 border-b border-ink-900/[0.08] px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-bold text-ink-900">{module?.title ?? "Practice call"}</h2>
            {module && <DifficultyBadge difficulty={module.scenario.difficulty} />}
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            vs {buyerName}
            {module?.scenario.buyerTitle ? `, ${module.scenario.buyerTitle}` : ""} · {formatRelativeTime(attempt.startedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scored && (
            <span className={cn("font-mono text-2xl font-bold leading-none", scoreColor(attempt.score as number))}>
              {attempt.score}
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full text-ink-400 transition hover:bg-ink-900/[0.06] hover:text-ink-900"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Verdict strip */}
      {attempt.verdict?.line && (
        <div
          className={cn(
            "flex items-center gap-2 border-b border-ink-900/[0.06] px-5 py-2.5 text-sm font-medium",
            attempt.passed ? "bg-accent-50 text-accent-800" : "bg-rose-50 text-rose-700",
          )}
        >
          <MessageSquareQuote className="h-4 w-4 shrink-0" />
          <span className="truncate">{attempt.verdict.line}</span>
        </div>
      )}

      {/* Conversation */}
      <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-5 lg:max-h-[calc(100vh-15rem)]">
        {turns.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-400">
            {attempt.status === "active"
              ? "This call is still in progress."
              : "No transcript was captured for this call."}
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={i} className={cn("flex flex-col gap-1", t.isRep ? "items-end" : "items-start")}>
              <span className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                {t.isRep ? "Rep" : buyerName}
              </span>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  t.isRep
                    ? "rounded-br-sm bg-accent-300 text-ink-900"
                    : "rounded-bl-sm border border-ink-900/[0.1] bg-[#f8f7f2] text-ink-700",
                )}
              >
                {t.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {scored && (
        <div className="border-t border-ink-900/[0.08] px-5 py-3">
          <button
            type="button"
            onClick={() => navigate("/app/feedback/" + attemptId)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 transition hover:text-accent-800"
          >
            View full scorecard
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function Header({ count }: { count: number }) {
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
        <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Call history</h1>
        <p className="text-sm text-ink-500">
          Every practice call and its full transcript{count ? ` — ${count} so far` : ""}.
        </p>
      </div>
    </div>
  );
}

function ScorePill({
  status,
  score,
  passed,
}: {
  status: "active" | "scoring" | "done";
  score: number | null;
  passed: boolean | null;
}): ReactNode {
  if (score != null) {
    return (
      <span
        className={cn(
          "shrink-0 rounded-[3px] px-2 py-0.5 text-xs font-bold font-mono",
          passed ? "bg-accent-100 text-accent-700" : "bg-rose-100 text-rose-600",
        )}
      >
        {score}
      </span>
    );
  }
  if (status === "scoring")
    return (
      <span className="pill shrink-0 text-[10px] text-accent-600">
        <Spinner className="h-3 w-3" /> scoring
      </span>
    );
  return <span className="pill shrink-0 text-[10px] text-ink-400">in progress</span>;
}
