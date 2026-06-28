import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate, Link } from "react-router-dom";
import { DifficultyBadge, Spinner, EmptyState } from "@/components/ui";
import { cn, scoreColor, formatRelativeTime } from "@/lib/utils";
import { ArrowLeft, Search } from "lucide-react";

type Filter = "all" | "passed" | "failed" | "progress";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed" },
  { key: "progress", label: "In progress" },
];

export default function AllActivity() {
  const rows = useQuery(api.analytics.allActivity);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.repName.toLowerCase().includes(q) && !r.moduleTitle.toLowerCase().includes(q)) {
        return false;
      }
      if (filter === "passed") return r.passed === true;
      if (filter === "failed") return r.passed === false;
      if (filter === "progress") return r.status === "active" || r.status === "scoring";
      return true;
    });
  }, [rows, query, filter]);

  const summary = useMemo(() => {
    if (!rows) return { total: 0, passed: 0, avg: null as number | null };
    const scored = rows.filter((r) => r.score != null);
    const avg = scored.length
      ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length)
      : null;
    return {
      total: rows.length,
      passed: rows.filter((r) => r.passed === true).length,
      avg,
    };
  }, [rows]);

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
        <Header />
        <EmptyState
          title="No activity yet"
          description="Practice calls across your team will show up here."
        />
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-up space-y-6">
      <Header />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Filter by rep or module…"
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
                filter === f.key
                  ? "bg-accent-500 text-white shadow-glow"
                  : "text-ink-600 hover:text-ink-900",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryChip label="Total calls" value={<span className="font-mono">{summary.total}</span>} />
        <SummaryChip label="Passed" value={<span className="font-mono text-accent-600">{summary.passed}</span>} />
        <SummaryChip
          label="Avg score"
          value={
            summary.avg == null ? (
              <span className="text-ink-400">—</span>
            ) : (
              <span className={cn("font-mono", scoreColor(summary.avg))}>{summary.avg}</span>
            )
          }
        />
      </div>

      <div className="glass overflow-hidden p-0">
        <div className="hidden grid-cols-[1.4fr_1.6fr_auto_1fr_auto] gap-4 border-b border-white/40 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:grid">
          <span>Rep</span>
          <span>Module</span>
          <span>Difficulty</span>
          <span>Result</span>
          <span className="text-right">When</span>
        </div>
        <ul>
          {filtered.length === 0 ? (
            <li className="px-5 py-10 text-center text-sm text-ink-500">No calls match your filters.</li>
          ) : (
            filtered.map((r) => {
              const openable = r.score != null || r.status === "scoring";
              return (
                <li
                  key={r.attemptId}
                  onClick={() => {
                    if (openable) navigate("/app/feedback/" + r.attemptId);
                  }}
                  className={cn(
                    "grid grid-cols-2 items-center gap-x-4 gap-y-1 border-b border-white/30 px-5 py-3.5 text-sm last:border-0 sm:grid-cols-[1.4fr_1.6fr_auto_1fr_auto]",
                    openable && "cursor-pointer transition hover:bg-white/40",
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/app/rep/" + r.repId);
                    }}
                    className="truncate text-left font-bold text-ink-900 hover:text-accent-600"
                  >
                    {r.repName}
                  </button>
                  <span className="truncate text-ink-700">{r.moduleTitle}</span>
                  <span className="justify-self-start sm:justify-self-auto">
                    <DifficultyBadge difficulty={r.difficulty} />
                  </span>
                  <span className="col-span-2 sm:col-span-1">
                    <ResultCell status={r.status} score={r.score} passed={r.passed} />
                  </span>
                  <span className="col-span-2 text-ink-400 sm:col-span-1 sm:text-right">
                    {formatRelativeTime(r.at)}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

function Header() {
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
        <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">All activity</h1>
        <p className="text-sm text-ink-500">Every practice call across your team.</p>
      </div>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="glass-strong flex flex-col gap-1 px-4 py-3">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{label}</span>
      <span className="text-xl font-bold">{value}</span>
    </div>
  );
}

function ResultCell({
  status,
  score,
  passed,
}: {
  status: "active" | "scoring" | "done";
  score: number | null;
  passed: boolean | null;
}) {
  if (score != null) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className={cn("font-mono text-base font-bold", scoreColor(score))}>{score}</span>
        {passed != null && (
          <span
            className={cn(
              "pill",
              passed ? "bg-accent-100 text-accent-700" : "bg-rose-100 text-rose-600",
            )}
          >
            {passed ? "Pass" : "Fail"}
          </span>
        )}
      </span>
    );
  }
  if (status === "scoring") {
    return (
      <span className="pill inline-flex items-center gap-1.5 text-accent-600">
        <Spinner className="h-3 w-3" />
        scoring…
      </span>
    );
  }
  return <span className="pill text-ink-500">in progress</span>;
}
