import { useEffect, useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button, DifficultyBadge, Spinner } from "@/components/ui";
import { cn, scoreColor, formatRelativeTime } from "@/lib/utils";
import { ArrowLeft, Check, X, ChevronDown, MessageSquare, Sparkles, MessageSquareQuote } from "lucide-react";

/** Manager's coaching note on a single attempt — the rep sees it on their scorecard. */
function CoachNoteEditor({ attemptId, initial }: { attemptId: Id<"attempts">; initial?: string }) {
  const setCoachNote = useMutation(api.attempts.setCoachNote);
  const [note, setNote] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNote(initial ?? "");
  }, [initial, attemptId]);

  const dirty = note.trim() !== (initial ?? "").trim();

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await setCoachNote({ attemptId, note });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="label inline-flex items-center gap-1.5">
        <MessageSquareQuote className="h-3.5 w-3.5" /> Coaching note
      </h3>
      <p className="text-xs text-ink-400">Leave a note the rep sees on their scorecard.</p>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        rows={3}
        placeholder="e.g. Great discovery — but slow down on pricing and let them react."
        className="input min-h-[72px] w-full resize-y leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} loading={saving} disabled={!dirty} className="px-5">
          {note.trim() ? "Save note" : "Clear note"}
        </Button>
        {saved && !dirty && <span className="text-xs font-medium text-accent-700">Saved ✓</span>}
      </div>
    </div>
  );
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function barColor(score: number): string {
  if (score >= 80) return "#33450e";
  if (score >= 70) return "#5f7d16";
  if (score >= 50) return "#f59e0b";
  return "#f43f5e";
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="glass flex flex-col gap-1 p-4">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-2xl font-extrabold tabular-nums text-ink-900", color)}>{value}</span>
    </div>
  );
}

/** Inline SVG sparkline of chronological scores. */
function Sparkline({ scores }: { scores: number[] }) {
  const w = 640;
  const h = 72;
  const pad = 6;

  if (scores.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: 72 }}>
        <line
          x1={pad}
          y1={h / 2}
          x2={w - pad}
          y2={h / 2}
          stroke="rgba(15,23,42,0.12)"
          strokeWidth={2}
          strokeDasharray="4 6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const max = Math.max(...scores, 100);
  const min = Math.min(...scores, 0);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (scores.length - 1);
  const points = scores.map((s, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (s - min) / range) * (h - pad * 2);
    return { x, y };
  });
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = scores[scores.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: 72 }}>
      <path d={line} fill="none" stroke={barColor(last)} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={barColor(scores[i])} />
      ))}
    </svg>
  );
}

function AnalyticsChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-subtle flex flex-col gap-0.5 px-3 py-2">
      <span className="label">{label}</span>
      <span className="font-mono text-base font-extrabold tabular-nums text-ink-900">{value}</span>
    </div>
  );
}

export default function RepDetail() {
  const { repId } = useParams();
  const navigate = useNavigate();
  const data = useQuery(api.analytics.repDetail, { repId: repId as Id<"users"> });
  const assignDrill = useAction(api.ai.assignPersonalizedDrill);
  const [openId, setOpenId] = useState<Id<"attempts"> | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignErr, setAssignErr] = useState<string | null>(null);

  async function assignPersonalized() {
    if (assigning || !repId) return;
    setAssigning(true);
    setAssignErr(null);
    try {
      const moduleId = await assignDrill({ repId: repId as Id<"users"> });
      // Open the editable draft so the manager can change it before publishing
      // (publishing assigns it to this rep).
      if (moduleId) navigate(`/app/create?edit=${moduleId}`);
      else setAssignErr("Couldn't build a drill — try again.");
    } catch {
      setAssignErr("Couldn't build a drill — try again.");
    } finally {
      setAssigning(false);
    }
  }

  if (data === undefined) {
    return (
      <div className="grid w-full place-items-center py-24">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="glass flex w-full flex-col items-center gap-3 px-8 py-16 text-center">
        <h3 className="text-lg font-bold text-ink-900">Rep not found</h3>
        <Link to="/app" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>
    );
  }

  const { rep, stats, attempts } = data;

  const chronological = [...attempts].sort((a, b) => a.attempt.startedAt - b.attempt.startedAt);
  const trendScores = chronological
    .map((a) => a.attempt.score)
    .filter((x): x is number => typeof x === "number");

  return (
    <div className="w-full space-y-6">
      <Link to="/app" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-extrabold text-white shadow-glow"
          style={{ backgroundImage: "linear-gradient(135deg,#5f7d16,#9cc81d 60%,#cdf24a)" }}
        >
          {deriveInitials(rep.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold text-ink-900">{rep.name}</h1>
          <p className="truncate text-sm text-ink-500">
            {rep.title}
            {rep.email ? <span className="text-ink-400"> · {rep.email}</span> : null}
          </p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Button variant="magenta" onClick={() => void assignPersonalized()} loading={assigning}>
            <Sparkles className="h-4 w-4" /> Build personalized drill
          </Button>
          {assignErr && <span className="text-xs text-rose-500">{assignErr}</span>}
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Attempts" value={String(stats.attempts)} />
        <StatCard label="Avg" value={String(stats.avg)} color={scoreColor(stats.avg)} />
        <StatCard label="Best" value={String(stats.best)} color={scoreColor(stats.best)} />
        <StatCard label="Passed" value={String(stats.passed)} />
      </div>

      {/* Canvas: score trend */}
      <div className="glass space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="label">Score trend</h2>
          <span className="text-xs text-ink-400">{trendScores.length} scored</span>
        </div>
        <Sparkline scores={trendScores} />
        {trendScores.length < 2 ? (
          <p className="text-xs text-ink-400">Not enough scored calls to chart a trend yet.</p>
        ) : null}
      </div>

      {/* Call history */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">Call history</h2>

        {attempts.length === 0 ? (
          <p className="text-sm text-ink-400">No practice calls yet.</p>
        ) : (
          <ul className="space-y-3">
            {attempts.map(({ attempt, module }) => {
              const isOpen = openId === attempt._id;
              const hasScore = typeof attempt.score === "number";
              const analytics = attempt.analytics;
              const rubric = attempt.rubricScores;
              const objectives = attempt.objectiveHits;
              const fixes = attempt.fixes;
              return (
                <li key={attempt._id} className="glass overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : attempt._id)}
                    className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate font-bold text-ink-900">
                      {module?.title ?? "Untitled module"}
                    </span>
                    {module ? <DifficultyBadge difficulty={module.scenario.difficulty} /> : null}
                    <span
                      className={cn(
                        "font-mono text-sm font-bold tabular-nums",
                        hasScore ? scoreColor(attempt.score as number) : "text-ink-400",
                      )}
                    >
                      {hasScore ? attempt.score : "—"}
                    </span>
                    {typeof attempt.passed === "boolean" ? (
                      <span
                        className={cn(
                          "pill",
                          attempt.passed
                            ? "border-accent-300/60 bg-accent-100 text-accent-700"
                            : "border-rose-300/60 bg-rose-100 text-rose-600",
                        )}
                      >
                        {attempt.passed ? "Pass" : "Fail"}
                      </span>
                    ) : null}
                    <span className="text-xs text-ink-400">{formatRelativeTime(attempt.startedAt)}</span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-ink-400 transition-transform", isOpen && "rotate-180")}
                    />
                  </button>

                  {isOpen ? (
                    <div className="animate-fade-up space-y-5 border-t border-white/40 px-5 py-5">
                      {attempt.verdict?.line ? (
                        <p className="font-bold text-ink-900">{attempt.verdict.line}</p>
                      ) : null}

                      {/* Speech analytics */}
                      {analytics ? (
                        <div className="space-y-2">
                          <h3 className="label">Speech analytics</h3>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <AnalyticsChip label="Talk ratio" value={`${analytics.talkRatio}%`} />
                            <AnalyticsChip label="Filler words" value={String(analytics.fillerCount)} />
                            <AnalyticsChip label="Pace" value={`${analytics.wordsPerMin} wpm`} />
                            <AnalyticsChip label="Questions" value={String(analytics.questionsAsked)} />
                          </div>
                        </div>
                      ) : null}

                      {/* Rubric breakdown */}
                      {rubric && rubric.length > 0 ? (
                        <div className="space-y-2">
                          <h3 className="label">Rubric</h3>
                          <ul className="space-y-2.5">
                            {rubric.map((r, ri) => (
                              <li key={ri} className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-700">{r.name}</span>
                                  <span className="pill border-white/60 bg-white/50 text-ink-500">x{r.weight}</span>
                                  <span className={cn("font-mono text-sm font-bold tabular-nums", scoreColor(r.score))}>
                                    {r.score}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-900/10">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.max(0, Math.min(100, r.score))}%`,
                                      backgroundColor: barColor(r.score),
                                    }}
                                  />
                                </div>
                                {r.note ? <p className="text-xs text-ink-400">{r.note}</p> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {/* Objectives */}
                      {objectives && objectives.length > 0 ? (
                        <div className="space-y-2">
                          <h3 className="label">Objectives</h3>
                          <ul className="space-y-1.5">
                            {objectives.map((o, oi) => (
                              <li key={oi} className="flex items-start gap-2 text-sm">
                                {o.met ? (
                                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
                                ) : (
                                  <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                                )}
                                <span className="text-ink-700">
                                  {o.objective}
                                  {o.note ? <span className="text-ink-400"> — {o.note}</span> : null}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {/* Fixes */}
                      {fixes && fixes.length > 0 ? (
                        <div className="space-y-2">
                          <h3 className="label">Coaching fixes</h3>
                          <ol className="space-y-1.5">
                            {fixes.map((f, fi) => (
                              <li key={fi} className="flex gap-2 text-sm text-ink-700">
                                <span className="font-mono font-bold text-accent-600">{fi + 1}.</span>
                                <span>{f}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}

                      {/* Transcript */}
                      <div className="space-y-2">
                        <h3 className="label inline-flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5" /> Recording
                        </h3>
                        {attempt.callTranscript ? (
                          <pre className="glass-subtle block max-h-64 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-ink-700">
                            {attempt.callTranscript}
                          </pre>
                        ) : (
                          <p className="text-sm text-ink-400">No transcript.</p>
                        )}
                      </div>

                      {/* Coaching note */}
                      <div className="border-t border-white/40 pt-4">
                        <CoachNoteEditor attemptId={attempt._id} initial={attempt.coachNote} />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
