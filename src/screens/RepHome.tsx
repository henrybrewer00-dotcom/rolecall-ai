import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigate } from "react-router-dom";
import { Button, DifficultyBadge, EmptyState, Spinner } from "@/components/ui";
import { cn, scoreColor } from "@/lib/utils";
import { Flame } from "lucide-react";

export default function RepHome() {
  const list = useQuery(api.assignments.listForRep);
  const myStats = useQuery(api.analytics.myStats, {});
  const startAttempt = useMutation(api.attempts.start);
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);

  if (list === undefined) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <EmptyState
        title="No training assigned yet"
        description="When your manager publishes a module, it'll show up here to practice."
      />
    );
  }

  const passedCount = list.filter((item) => item.passed).length;
  const bestScores = list
    .map((item) => item.bestScore)
    .filter((s): s is number => s !== null);
  const avgBest =
    bestScores.length > 0
      ? Math.round(bestScores.reduce((a, b) => a + b, 0) / bestScores.length)
      : null;

  async function handleStart(moduleId: Id<"modules">) {
    setStarting(moduleId);
    try {
      const id = await startAttempt({ moduleId });
      navigate(`/app/practice/${id}`);
    } catch {
      setStarting(null);
    }
  }

  return (
    <div className="w-full space-y-6 animate-fade-up">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold text-ink-900">Your training</h1>
        <p className="text-sm text-ink-500">
          Practice as much as you want — you get instant feedback every time.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="glass p-4">
          <div className="label">Assigned</div>
          <div className="mt-1 font-mono text-2xl font-bold text-ink-900">{list.length}</div>
        </div>
        <div className="glass p-4">
          <div className="label">Passed</div>
          <div className="mt-1 font-mono text-2xl font-bold text-accent-600">{passedCount}</div>
        </div>
        <div className="glass p-4">
          <div className="label">Avg best</div>
          <div
            className={cn(
              "mt-1 font-mono text-2xl font-bold",
              avgBest !== null ? scoreColor(avgBest) : "text-ink-400",
            )}
          >
            {avgBest !== null ? avgBest : "—"}
          </div>
        </div>
        <button
          onClick={() => navigate("/app/leaderboard")}
          className="glass p-4 text-left transition-colors hover:border-accent-400"
        >
          <div className="label inline-flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-accent-600" /> Day streak
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-ink-900">{myStats?.currentStreak ?? 0}</span>
            {myStats && myStats.rank > 0 && (
              <span className="text-xs font-medium text-ink-400">rank #{myStats.rank}</span>
            )}
          </div>
        </button>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {list.map((item) => {
          const { module, assignment, attemptCount, bestScore, passed } = item;
          if (!module) return null;
          const { scenario } = module;

          return (
            <article key={assignment._id} className="glass flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-ink-900">{module.title}</h2>
                  <DifficultyBadge difficulty={scenario.difficulty} />
                </div>
                {passed ? (
                  <span className="pill border-accent-300/60 bg-accent-100 text-accent-700">✓ Passed</span>
                ) : attemptCount > 0 ? (
                  <span className="pill border-accent-300/60 bg-accent-100 text-accent-600">In progress</span>
                ) : (
                  <span className="pill text-ink-500">Not started</span>
                )}
              </div>

              <p className="line-clamp-2 text-sm text-ink-500">{module.description}</p>

              <p className="text-xs text-ink-400">
                Buyer: {scenario.buyerName} · {scenario.buyerTitle} at {scenario.company}
              </p>

              <div className="mt-auto flex items-end justify-between gap-3 pt-2">
                <div className="space-y-0.5 text-sm">
                  {bestScore !== null ? (
                    <div>
                      <span className={cn("font-mono font-bold", scoreColor(bestScore))}>{bestScore}</span>
                      <span className="text-ink-400">/100</span>
                    </div>
                  ) : (
                    <div className="text-ink-400">No attempts yet</div>
                  )}
                  <div className="text-xs text-ink-400">
                    {attemptCount} {attemptCount === 1 ? "attempt" : "attempts"}
                  </div>
                </div>

                <Button
                  loading={starting === module._id}
                  onClick={() => handleStart(module._id)}
                >
                  {attemptCount > 0 ? "Practice again" : "Start practice call"}
                </Button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
