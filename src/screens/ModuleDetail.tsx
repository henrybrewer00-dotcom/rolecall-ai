import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button, DifficultyBadge, Spinner } from "@/components/ui";
import { ButtonHoldAndRelease } from "@/components/ButtonHoldAndRelease";
import { cn, scoreColor, formatRelativeTime } from "@/lib/utils";
import { ArrowLeft, Target, ListChecks, Pencil } from "lucide-react";

export default function ModuleDetail() {
  const { moduleId } = useParams();
  const mid = moduleId as Id<"modules">;
  const data = useQuery(api.analytics.moduleDetail, { moduleId: mid });
  const navigate = useNavigate();
  const publish = useMutation(api.modules.publish);
  const remove = useMutation(api.modules.remove);

  if (data === undefined) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="glass animate-fade-up flex flex-col items-center gap-3 p-12 text-center">
        <h2 className="text-lg font-bold text-ink-900">Module not found</h2>
        <p className="text-sm text-ink-500">It may have been deleted.</p>
        <Link to="/app">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const { module, stats, reps } = data;
  const { scenario } = module;
  const isDraft = module.status === "draft";
  const sortedReps = [...reps].sort((a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1));

  const repStatusPill: Record<string, string> = {
    passed: "bg-accent-100 text-accent-700 border-accent-300/60",
    in_progress: "bg-accent-100 text-accent-600 border-accent-300/60",
    assigned: "bg-white/60 text-ink-500 border-white/60",
  };
  const repStatusLabel: Record<string, string> = {
    passed: "Passed",
    in_progress: "In progress",
    assigned: "Assigned",
  };

  return (
    <div className="w-full animate-fade-up space-y-6">
      {/* Back link */}
      <Link
        to="/app"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-extrabold text-ink-900 sm:text-2xl">{module.title}</h1>
            <DifficultyBadge difficulty={scenario.difficulty} />
            <span
              className={cn(
                "pill border",
                isDraft
                  ? "bg-amber-100 text-amber-600 border-amber-300/60"
                  : "bg-accent-100 text-accent-700 border-accent-300/60",
              )}
            >
              {isDraft ? "Draft" : "Published"}
            </span>
          </div>
          <p className="max-w-2xl text-sm text-ink-500">{module.description}</p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => navigate(`/app/create?edit=${mid}`)}>
            <Pencil className="h-4 w-4" /> Edit{isDraft ? "" : " & republish"}
          </Button>
          {isDraft && (
            <ButtonHoldAndRelease
              tone="primary"
              icon="send"
              label="Hold to publish"
              holdingLabel="Publishing…"
              holdDuration={1000}
              onConfirm={() => publish({ moduleId: mid })}
            />
          )}
          <ButtonHoldAndRelease
            tone="danger"
            icon="trash"
            label="Hold to delete"
            holdingLabel="Deleting…"
            holdDuration={1600}
            onConfirm={async () => {
              await remove({ moduleId: mid });
              navigate("/app");
            }}
          />
        </div>
      </div>

      {/* Buyer + Objectives */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass space-y-3 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-accent-600" />
            <span className="label">The buyer</span>
          </div>
          <div className="space-y-1">
            <p className="font-bold text-ink-900">
              {scenario.buyerName}
              <span className="font-normal text-ink-500">
                {" "}
                — {scenario.buyerTitle} at {scenario.company}
              </span>
            </p>
            <p className="text-sm text-ink-600">{scenario.personality}</p>
          </div>
          {scenario.objections.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="label">Objections</span>
              <ul className="space-y-1">
                {scenario.objections.map((o, i) => (
                  <li key={i} className="text-sm italic text-ink-500">
                    “{o}”
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="glass space-y-3 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-accent-600" />
            <span className="label">Objectives</span>
          </div>
          <ol className="space-y-2.5">
            {module.objectives.map((obj, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-ink-700">
                <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-accent-100 font-mono text-[11px] font-bold text-accent-700">
                  {i + 1}
                </span>
                <span>{obj}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Rubric */}
      <div className="glass space-y-4 p-5 sm:p-6">
        <h2 className="text-base font-bold text-ink-900">Grading rubric</h2>
        {module.rubric && module.rubric.length > 0 ? (
          <ul className="space-y-4">
            {module.rubric.map((c, i) => (
              <li key={i} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-ink-900">{c.name}</span>
                  <span className="pill border border-accent-300/60 bg-accent-100 font-mono text-accent-600">
                    {c.weight}%
                  </span>
                </div>
                <p className="text-sm text-ink-500">{c.description}</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-900/5">
                  <div
                    className="h-full rounded-full bg-accent-400"
                    style={{ width: `${Math.max(0, Math.min(100, c.weight))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-400">No custom rubric (graded holistically).</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="glass space-y-1.5 p-5">
          <span className="label">Assigned</span>
          <p className="font-mono text-3xl font-extrabold text-ink-900">{stats.assigned}</p>
        </div>
        <div className="glass space-y-1.5 p-5">
          <span className="label">Pass rate</span>
          <p className="font-mono text-3xl font-extrabold text-ink-900">{stats.passRate}%</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-900/5">
            <div
              className="h-full rounded-full bg-accent-400"
              style={{ width: `${Math.max(0, Math.min(100, stats.passRate))}%` }}
            />
          </div>
        </div>
        <div className="glass space-y-1.5 p-5">
          <span className="label">Avg score</span>
          <p className={cn("font-mono text-3xl font-extrabold", scoreColor(stats.avg))}>{stats.avg}</p>
        </div>
        <div className="glass space-y-1.5 p-5">
          <span className="label">Range</span>
          <p className="font-mono text-3xl font-extrabold text-ink-900">
            {stats.range ? `${stats.range.min}–${stats.range.max}` : "—"}
          </p>
        </div>
      </div>

      {/* Reps table */}
      <div className="glass space-y-4 p-5 sm:p-6">
        <h2 className="text-base font-bold text-ink-900">Rep performance</h2>
        {sortedReps.length === 0 ? (
          <p className="text-sm text-ink-400">No reps assigned yet.</p>
        ) : (
          <div className="space-y-2">
            <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1fr] gap-3 px-3 sm:grid">
              <span className="label">Rep</span>
              <span className="label">Status</span>
              <span className="label text-right">Best</span>
              <span className="label text-right">Attempts</span>
              <span className="label text-right">Last</span>
            </div>
            {sortedReps.map((r) => (
              <button
                key={r.repId}
                type="button"
                onClick={() => navigate("/app/rep/" + r.repId)}
                className="grid w-full grid-cols-2 items-center gap-3 rounded-md border border-white/40 bg-white/40 px-3 py-3 text-left transition-colors hover:bg-white/70 sm:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1fr]"
              >
                <span className="font-semibold text-ink-900">{r.repName}</span>
                <span className="justify-self-start sm:justify-self-auto">
                  <span className={cn("pill border", repStatusPill[r.status])}>{repStatusLabel[r.status]}</span>
                </span>
                <span
                  className={cn(
                    "font-mono font-bold sm:text-right",
                    r.bestScore !== null ? scoreColor(r.bestScore) : "text-ink-400",
                  )}
                >
                  {r.bestScore !== null ? r.bestScore : "—"}
                </span>
                <span className="font-mono text-ink-600 sm:text-right">{r.attempts}</span>
                <span className="text-sm text-ink-400 sm:text-right">{formatRelativeTime(r.lastAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
