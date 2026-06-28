import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigate, useParams } from "react-router-dom";
import { Button, DifficultyBadge, Spinner, ScoreRing } from "@/components/ui";
import { cn, scoreColor } from "@/lib/utils";
import { Check, X, MessageSquareQuote } from "lucide-react";

const SCORING_LINES = [
  "Replaying the conversation…",
  "Checking each objective…",
  "Weighing the objections…",
  "Measuring your talk time…",
  "Writing your coaching…",
];

function Equalizer() {
  const bars = [0.45, 0.8, 0.55, 1, 0.65, 0.85, 0.4];
  return (
    <div className="flex h-10 items-end justify-center gap-1.5">
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-accent-400/80 animate-eq"
          style={{ height: `${h * 100}%`, animationDelay: `${i * 0.11}s` }}
        />
      ))}
    </div>
  );
}

/** Color for a rubric / analytic fill bar based on a 0..100 value. */
function barColor(score: number): string {
  if (score >= 70) return "#5f7d16";
  if (score >= 50) return "#f59e0b";
  return "#f43f5e";
}

export default function Feedback() {
  const { attemptId } = useParams();
  const aid = attemptId as Id<"attempts">;
  const attempt = useQuery(api.attempts.get, { attemptId: aid });
  const navigate = useNavigate();
  const startAttempt = useMutation(api.attempts.start);

  const [lineIdx, setLineIdx] = useState(0);
  const [selectedMoment, setSelectedMoment] = useState<number | null>(null);
  const [startingAgain, setStartingAgain] = useState(false);

  const isScoring =
    attempt != null &&
    (attempt.status !== "done" || typeof attempt.score !== "number");

  useEffect(() => {
    if (!isScoring) return;
    const id = setInterval(() => {
      setLineIdx((i) => (i + 1) % SCORING_LINES.length);
    }, 1400);
    return () => clearInterval(id);
  }, [isScoring]);

  // 1. Loading
  if (attempt === undefined) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }

  // 2. Not found
  if (attempt === null) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="glass flex flex-col items-center gap-4 px-8 py-16 text-center">
          <h3 className="text-lg font-bold text-ink-900">Attempt not found</h3>
          <p className="max-w-sm text-sm text-ink-500">
            We couldn't find that practice call. It may have been removed.
          </p>
          <Button onClick={() => navigate("/app")}>Back to training</Button>
        </div>
      </div>
    );
  }

  const module = attempt.module;

  // 3. Scoring
  if (isScoring) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="glass-strong relative overflow-hidden p-10 text-center animate-fade-up">
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-50 blur-3xl"
            style={{ backgroundImage: "radial-gradient(circle,#5f7d1655,transparent 70%)" }}
          />
          <div className="relative flex flex-col items-center gap-6">
            <Equalizer />
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-ink-900">
                Scoring your call…
              </h2>
              {module && (
                <p className="text-sm text-ink-500">
                  Grading your call with{" "}
                  <span className="font-semibold text-ink-700">
                    {module.scenario.buyerName}
                  </span>
                </p>
              )}
            </div>
            <p
              key={lineIdx}
              className="text-sm font-medium text-accent-600 animate-fade-up"
            >
              {SCORING_LINES[lineIdx]}
            </p>
            <span className="pill text-[11px] text-ink-400">No need to refresh.</span>
          </div>
        </div>
      </div>
    );
  }

  // 4. Done
  const score = attempt.score as number;
  const passed = attempt.passed ?? attempt.verdict?.decision === "pass";
  const objectiveHits = attempt.objectiveHits ?? [];
  const fixes = attempt.fixes ?? [];
  const moments = attempt.moments ?? [];
  const rubricScores = attempt.rubricScores ?? [];
  const analytics = attempt.analytics;

  const analyticChips = analytics
    ? [
        {
          label: "Talk ratio",
          value: `${analytics.talkRatio}%`,
          caption: "Aim 40–55%",
        },
        {
          label: "Filler words",
          value: `${analytics.fillerCount}`,
          caption: "Fewer is crisper",
        },
        {
          label: "Pace",
          value: `${analytics.wordsPerMin} wpm`,
          caption: "Steady, ~130–160",
        },
        {
          label: "Questions asked",
          value: `${analytics.questionsAsked}`,
          caption: "Curiosity wins",
        },
      ]
    : [];

  const handlePracticeAgain = async () => {
    setStartingAgain(true);
    try {
      const id = await startAttempt({ moduleId: attempt.moduleId });
      navigate("/app/practice/" + id);
    } catch {
      setStartingAgain(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* Header */}
      <div className="animate-fade-up space-y-1">
        <span className="label">Scorecard</span>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            {module?.title ?? "Practice call"}
          </h1>
          {module && <DifficultyBadge difficulty={module.scenario.difficulty} />}
        </div>
      </div>

      {/* Hero score */}
      <div className="glass-strong p-10 text-center animate-fade-up">
        <div className="flex flex-col items-center gap-6">
          <div className="relative animate-score-pop">
            <ScoreRing score={score} size={200} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn(
                  "text-6xl font-mono font-bold leading-none",
                  scoreColor(score),
                )}
              >
                {score}
              </span>
              <span className="mt-1 text-xs font-mono text-ink-400">/100</span>
            </div>
          </div>

          <span
            className={cn(
              "inline-flex items-center rounded-full px-4 py-1 text-xs font-bold uppercase tracking-widest",
              passed
                ? "bg-accent-100 text-accent-700"
                : "bg-rose-100 text-rose-600",
            )}
          >
            {passed ? "PASS" : "KEEP PRACTICING"}
          </span>

          {attempt.verdict?.line && (
            <p className="max-w-xl text-2xl font-semibold leading-snug text-ink-900">
              {attempt.verdict.line}
            </p>
          )}
        </div>
      </div>

      {/* Coach's note (left by a manager) */}
      {attempt.coachNote && (
        <div className="animate-fade-up rounded-md border border-accent-300 bg-accent-50 p-5 sm:p-6">
          <div className="mb-1.5 flex items-center gap-2">
            <MessageSquareQuote className="h-4 w-4 text-accent-700" />
            <span className="label text-accent-700">Note from your coach</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{attempt.coachNote}</p>
        </div>
      )}

      {/* Rubric */}
      {rubricScores.length > 0 && (
        <div className="glass p-6 animate-fade-up">
          <h2 className="mb-4 text-base font-bold text-ink-900">How you scored</h2>
          <ul className="space-y-5">
            {rubricScores.map((r, i) => (
              <li key={i} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink-800">
                    {r.name}
                  </span>
                  <span className="pill text-[10px] text-ink-400">
                    {r.weight}%
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-sm font-mono font-bold",
                      scoreColor(r.score),
                    )}
                  >
                    {r.score}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-900/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: `${Math.max(0, Math.min(100, r.score))}%`,
                      backgroundColor: barColor(r.score),
                    }}
                  />
                </div>
                {r.note && <p className="text-xs text-ink-400">{r.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Speech analytics */}
      {analytics && (
        <div className="glass p-6 animate-fade-up">
          <h2 className="mb-4 text-base font-bold text-ink-900">
            Speech analytics
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {analyticChips.map((chip) => (
              <div
                key={chip.label}
                className="glass-subtle flex flex-col gap-1 rounded-md p-4"
              >
                <span className="label text-[10px]">{chip.label}</span>
                <span className="text-xl font-mono font-bold text-ink-900">
                  {chip.value}
                </span>
                <span className="text-[11px] text-ink-400">{chip.caption}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-400">
            Longest monologue: {analytics.longestMonologueSec}s. Pauses to check
            in keep the buyer engaged.
          </p>
        </div>
      )}

      {/* Objectives */}
      {objectiveHits.length > 0 && (
        <div className="glass p-6 animate-fade-up">
          <h2 className="mb-4 text-base font-bold text-ink-900">Objectives</h2>
          <ul className="space-y-3">
            {objectiveHits.map((o, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full",
                    o.met ? "bg-accent-100" : "bg-rose-100",
                  )}
                  aria-hidden
                >
                  {o.met ? (
                    <Check className="h-4 w-4 text-accent-600" strokeWidth={3} />
                  ) : (
                    <X className="h-4 w-4 text-rose-500" strokeWidth={3} />
                  )}
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-ink-800">{o.objective}</p>
                  {o.note && <p className="text-xs text-ink-400">{o.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fixes */}
      {fixes.length > 0 && (
        <div className="glass p-6 animate-fade-up">
          <h2 className="mb-4 text-base font-bold text-ink-900">
            Fix these next time
          </h2>
          <ol className="space-y-3">
            {fixes.map((fix, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-100 text-xs font-bold font-mono text-accent-700">
                  {i + 1}
                </span>
                <p className="text-sm text-ink-700">{fix}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Replay */}
      {moments.length > 0 && (
        <div className="glass p-6 animate-fade-up">
          <h2 className="mb-4 text-base font-bold text-ink-900">Call replay</h2>
          <ol className="relative space-y-1">
            <span
              className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-px bg-ink-900/15"
              aria-hidden
            />
            {moments.map((m, i) => {
              const selected = selectedMoment === i;
              const dot =
                m.tone === "good"
                  ? "bg-accent-500"
                  : m.tone === "bad"
                    ? "bg-rose-500"
                    : "bg-ink-300";
              return (
                <li key={i} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectedMoment(selected ? null : i)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors",
                      selected
                        ? "bg-white/60 ring-1 ring-accent-300"
                        : "hover:bg-white/40",
                    )}
                  >
                    <span
                      className={cn(
                        "relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white/70",
                        dot,
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs text-ink-400">
                          {m.timestamp}
                        </span>
                        <span className="text-xs font-bold text-ink-800">
                          {m.label}
                        </span>
                      </div>
                      <p className="text-sm italic text-ink-600">{m.line}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 animate-fade-up">
        <Button onClick={handlePracticeAgain} loading={startingAgain}>
          Practice again
        </Button>
        <button
          type="button"
          className="btn-soft"
          onClick={() => navigate("/app")}
        >
          Back to training
        </button>
      </div>
    </div>
  );
}
