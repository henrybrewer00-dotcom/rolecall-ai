import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Spinner, DifficultyBadge, EmptyState } from "@/components/ui";
import { cn, scoreColor } from "@/lib/utils";
import { Target, Lock, Sparkles, Play, ShieldCheck } from "lucide-react";

export default function PracticeZone() {
  const navigate = useNavigate();
  const weak = useQuery(api.analytics.myWeakSpots);
  const drills = useQuery(api.modules.listPersonal);
  const buildDrill = useAction(api.ai.personalizedDrill);
  const startAttempt = useMutation(api.attempts.start);

  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practicing, setPracticing] = useState<string | null>(null);

  async function handleBuild() {
    setError(null);
    setBuilding(true);
    try {
      const id = await buildDrill({});
      if (!id) {
        setError("Couldn't build a drill yet — run a few graded calls first.");
        return;
      }
      const a = await startAttempt({ moduleId: id, visibility: "private" });
      navigate("/app/practice/" + a);
    } catch {
      setError("Something went wrong building your drill. Try again in a moment.");
    } finally {
      setBuilding(false);
    }
  }

  async function handlePractice(moduleId: Id<"modules">) {
    setError(null);
    setPracticing(moduleId);
    try {
      const a = await startAttempt({ moduleId, visibility: "private" });
      navigate("/app/practice/" + a);
    } catch {
      setError("Couldn't start that drill. Try again in a moment.");
      setPracticing(null);
    }
  }

  const weakObjectives = weak?.weakObjectives ?? [];

  return (
    <div className="w-full space-y-6 animate-fade-up">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <span
            className="grid h-9 w-9 place-items-center rounded-md text-white shadow-glow"
            style={{ backgroundImage: "linear-gradient(135deg,#5f7d16,#9cc81d 60%,#cdf24a)" }}
          >
            <Target className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-extrabold text-ink-900 sm:text-2xl">Practice</h1>
        </div>
        <span className="pill border-accent-300/60 bg-accent-100 text-accent-700">
          <Lock className="h-3.5 w-3.5" />
          Private to you — nothing here is shared with your manager.
        </span>
      </header>

      <section className="glass-strong relative overflow-hidden p-5 sm:p-6">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-2xl"
          style={{ backgroundImage: "linear-gradient(135deg,#5f7d16,#9cc81d 60%,#cdf24a)" }}
        />
        <div className="relative space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-accent-600">
              <Sparkles className="h-4 w-4" />
              <span className="label text-accent-600">Personalized for you</span>
            </div>
            <h2 className="text-xl font-bold text-ink-900">Sharpen your weak spots</h2>
            <p className="max-w-xl text-sm text-ink-500">
              {weak && weakObjectives.length > 0
                ? "Here's where you're slipping most. Build a private drill and I'll target exactly these."
                : "Run a few graded calls and I'll build drills around what trips you up."}
            </p>
          </div>

          {weak && weakObjectives.length > 0 && (
            <ul className="space-y-2.5">
              {weakObjectives.map((o) => (
                <li key={o.objective} className="surface flex items-center gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-ink-800">{o.objective}</span>
                      <span className={cn("shrink-0 font-mono text-sm font-bold", scoreColor(o.hitRate))}>
                        hit {o.hitRate}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-900/[0.06]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          o.hitRate >= 70
                            ? "bg-accent-500"
                            : o.hitRate >= 50
                              ? "bg-amber-400"
                              : "bg-rose-400",
                        )}
                        style={{ width: `${Math.max(4, Math.min(100, o.hitRate))}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-400">{o.samples} calls</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleBuild} loading={building}>
              <Sparkles className="h-4 w-4" />
              Build me a personalized drill
            </Button>
            {weak && (
              <span className="text-xs text-ink-400">
                Based on {weak.attempts} graded {weak.attempts === 1 ? "call" : "calls"}
              </span>
            )}
          </div>

          {error && <p className="text-sm font-medium text-rose-500">{error}</p>}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-ink-900">Your private drills</h2>
          <Lock className="h-3.5 w-3.5 text-ink-400" />
        </div>

        {drills === undefined ? (
          <div className="grid min-h-[20vh] place-items-center">
            <Spinner className="h-7 w-7 text-accent-500" />
          </div>
        ) : drills.length === 0 ? (
          <EmptyState
            title="No drills yet"
            description="Build your first personalized drill above — it targets exactly what you keep missing."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {drills.map((d) => (
              <article key={d._id} className="glass flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-bold text-ink-900">{d.title}</h3>
                  <DifficultyBadge difficulty={d.scenario.difficulty} />
                </div>
                <p className="line-clamp-2 text-sm text-ink-500">{d.description}</p>
                <p className="text-xs text-ink-400">
                  Buyer: {d.scenario.buyerName} · {d.scenario.buyerTitle}
                </p>
                <div className="mt-auto pt-1">
                  <Button
                    variant="ghost"
                    onClick={() => handlePractice(d._id)}
                    loading={practicing === d._id}
                  >
                    <Play className="h-4 w-4" />
                    Practice
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="flex items-center justify-center gap-2 pt-2 text-xs text-ink-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>This is your space. Scores and transcripts here never reach your manager.</span>
      </footer>
    </div>
  );
}
