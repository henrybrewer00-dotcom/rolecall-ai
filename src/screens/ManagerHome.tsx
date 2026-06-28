import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigate } from "react-router-dom";
import { Button, DifficultyBadge, EmptyState, Spinner } from "@/components/ui";
import { ButtonHoldAndRelease } from "@/components/ButtonHoldAndRelease";
import { AISearchBar } from "@/components/AISearchBar";
import { cn, scoreColor } from "@/lib/utils";
import {
  Plus,
  Sparkles,
  Copy,
  Link2,
  BarChart3,
  Trophy,
  LayoutGrid,
  BookOpen,
  Check,
  ArrowUpRight,
} from "lucide-react";

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="glass flex flex-col gap-1.5 p-5">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-3xl font-extrabold text-ink-900", valueClassName)}>{value}</span>
    </div>
  );
}

/** Inline SVG line chart for the team score trend (0..100, inverted Y). */
function TrendChart({ trend }: { trend: { day: string; at: number; score: number }[] }) {
  const scores = trend.map((t) => t.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const n = trend.length;
  const points = trend.map((t, i) => {
    const x = n === 1 ? 50 : (i / (n - 1)) * 100;
    const y = 40 - (Math.max(0, Math.min(100, t.score)) / 100) * 40;
    return { x, y };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="space-y-3">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label="Team score trend"
      >
        <polyline
          points={polyline}
          fill="none"
          className="stroke-accent-500"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.4}
            className="fill-accent-400"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] font-mono text-ink-400">
        <span>low {min}</span>
        <span>high {max}</span>
      </div>
    </div>
  );
}

export default function ManagerHome() {
  const data = useQuery(api.analytics.managerDashboard);
  const overview = useQuery(api.analytics.overview);
  const suggestions = useQuery(api.suggestions.listPending);
  const invite = useQuery(api.users.myInvite);
  const library = useQuery(api.modules.library);
  const navigate = useNavigate();

  const suggestForManager = useAction(api.ai.suggestForManager);
  const approve = useMutation(api.suggestions.approve);
  const dismiss = useMutation(api.suggestions.dismiss);
  const publish = useMutation(api.modules.publish);
  const createFromTemplate = useMutation(api.modules.createFromTemplate);

  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  if (data === undefined) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }
  if (data === null) return null;

  function goAsk() {
    const query = q.trim();
    navigate(query ? `/app/hivemind?q=${encodeURIComponent(query)}` : "/app/hivemind");
  }

  async function askAi() {
    setAsking(true);
    try {
      await suggestForManager({});
    } finally {
      setAsking(false);
    }
  }

  function copy(kind: "link" | "code", text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1600);
  }

  const trend = overview?.trend ?? [];
  const leaderboard = overview?.leaderboard ?? [];
  const inviteLink = invite ? `${window.location.origin}/join/${invite.code}` : "";

  return (
    <div className="w-full animate-fade-up space-y-6">
      {/* 1. Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-ink-900 sm:text-2xl">Welcome back, {data.manager.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data.manager.title ? `${data.manager.title} · ` : ""}Here's how your team is performing today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => navigate("/app/create")}>
            <Plus className="h-4 w-4" />
            Create a module
          </Button>
          <button className="btn-soft" onClick={() => navigate("/app/activity")}>
            See all activity
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. Ask the Hivemind — a launcher into the full conversational agent. */}
      <section className="glass-strong space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-ink-700">
            <Sparkles className="h-4 w-4 text-accent-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">Ask your team's data</h2>
          </div>
          <span className="hidden text-[11px] text-ink-400 sm:inline">
            Opens a conversation — it reads every score, transcript &amp; rubric, and drafts courses.
          </span>
        </div>
        <AISearchBar value={q} onChange={setQ} onSubmit={goAsk} placeholder="Ask anything — 'who's struggling to close?'" />
        <div className="flex flex-wrap gap-2">
          {[
            "Who's struggling to close?",
            "Compare my top and bottom rep",
            "Draft a course for my weakest rep",
          ].map((s) => (
            <button
              key={s}
              onClick={() => navigate(`/app/hivemind?q=${encodeURIComponent(s)}`)}
              className="rounded-full border border-ink-900/12 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-ink-900/35 hover:text-ink-900"
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* 3. Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Reps" value={data.repCount} />
        <StatCard label="Modules" value={data.moduleCount} />
        <StatCard label="Published" value={data.publishedCount} />
        <StatCard label="Team avg" value={data.teamAvg} valueClassName={scoreColor(data.teamAvg)} />
      </div>

      {/* 4. Trend + Invite */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Score trend */}
        <section className="glass space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-100 text-accent-700">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-ink-900">Score trend</h2>
              <p className="text-xs text-ink-500">Team average over time</p>
            </div>
          </div>
          {trend.length >= 2 ? (
            <TrendChart trend={trend} />
          ) : (
            <p className="py-8 text-center text-sm text-ink-400">Run more calls to see the trend.</p>
          )}
        </section>

        {/* Invite */}
        {invite && (
          <section className="glass flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-300/30 text-accent-600">
                <Link2 className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink-900">Invite your reps</h2>
                <p className="text-xs text-ink-500">Share to onboard {invite.team}</p>
              </div>
            </div>

            <div className="glass-subtle rounded-md px-5 py-4 text-center">
              <span className="label">Invite code</span>
              <div className="mt-1 font-mono text-3xl font-extrabold tracking-widest text-ink-900">
                {invite.code}
              </div>
            </div>

            <div className="break-all rounded-md bg-ink-900/[0.04] px-4 py-2.5 text-xs font-mono text-ink-500">
              {inviteLink}
            </div>

            <div className="flex gap-2">
              <button className="btn-soft flex-1" onClick={() => copy("link", inviteLink)}>
                {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "link" ? "Copied" : "Copy link"}
              </button>
              <button className="btn-soft flex-1" onClick={() => copy("code", invite.code)}>
                {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "code" ? "Copied" : "Copy code"}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* 5. Leaderboard */}
      <section className="glass space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-amber-100 text-amber-600">
            <Trophy className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink-900">Rep leaderboard</h2>
            <p className="text-xs text-ink-500">Ranked by best score</p>
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">No graded attempts yet.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <div className="min-w-[480px] space-y-2">
              <div className="grid grid-cols-[2.5rem_1fr_4rem_4rem_4rem_4rem] items-center gap-3 px-3 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                <span>#</span>
                <span>Rep</span>
                <span className="text-right">Best</span>
                <span className="text-right">Avg</span>
                <span className="text-right">Calls</span>
                <span className="text-right">Passed</span>
              </div>
              {leaderboard.map((r, i) => (
                <button
                  key={r.repId}
                  onClick={() => navigate("/app/rep/" + r.repId)}
                  className="glass-subtle grid w-full grid-cols-[2.5rem_1fr_4rem_4rem_4rem_4rem] items-center gap-3 rounded-md px-3 py-2.5 text-left transition hover:ring-2 hover:ring-accent-300/50"
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-full font-mono text-xs font-bold",
                      i === 0
                        ? "bg-accent-500 text-white shadow-glow"
                        : "bg-ink-900/[0.06] text-ink-500",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate font-semibold text-ink-900">{r.name}</span>
                  <span className={cn("text-right font-mono font-bold", scoreColor(r.best))}>{r.best}</span>
                  <span className="text-right font-mono text-ink-700">{r.avg}</span>
                  <span className="text-right font-mono text-ink-500">{r.attempts}</span>
                  <span className="text-right font-mono text-ink-500">{r.passed}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 6. AI suggestions */}
      <section className="glass-strong space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-300/30 text-accent-600">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-ink-900">AI suggestions</h2>
              <p className="text-xs text-ink-500">Let AI propose your next training module.</p>
            </div>
          </div>
          <Button variant="magenta" loading={asking} onClick={askAi}>
            <Sparkles className="h-4 w-4" />
            Ask AI for a suggestion
          </Button>
        </div>

        {suggestions && suggestions.length > 0 ? (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <div
                key={s._id}
                className="glass-subtle flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-ink-700">{s.rationale}</p>
                  <p className="font-bold text-ink-900">{s.draft.title}</p>
                  <p className="text-sm text-ink-500">{s.draft.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={async () => {
                      const id = await approve({ suggestionId: s._id });
                      // Open the editable draft (not the read-only module page) so
                      // the manager can tweak the scenario/rubric before publishing.
                      navigate("/app/create?edit=" + id);
                    }}
                  >
                    Review &amp; edit
                  </Button>
                  <Button variant="ghost" onClick={() => dismiss({ suggestionId: s._id })}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">No suggestions right now — ask the AI to analyze your team.</p>
        )}
      </section>

      {/* 7. Scenario library */}
      <section className="glass space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-300/30 text-accent-600">
            <BookOpen className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink-900">Start from the library</h2>
            <p className="text-xs text-ink-500">Skip the interview — launch a prebuilt scenario.</p>
          </div>
        </div>

        {library === undefined ? (
          <div className="grid place-items-center py-6">
            <Spinner className="h-5 w-5 text-accent-500" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {library.map((t) => (
              <div key={t.id} className="glass-subtle flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink-900">{t.title}</span>
                  <DifficultyBadge difficulty={t.scenario.difficulty} />
                </div>
                <p className="flex-1 text-sm text-ink-500">{t.description}</p>
                <button
                  className="btn-soft self-start"
                  onClick={async () => {
                    const id = await createFromTemplate({ templateId: t.id });
                    navigate("/app/module/" + id);
                  }}
                >
                  Use this
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 8. Modules */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-100 text-accent-700">
            <LayoutGrid className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-bold text-ink-900">Your modules</h2>
        </div>

        {data.modules.length === 0 ? (
          <EmptyState
            title="No modules yet"
            description="Interview the AI and it'll build your first training module."
            action={
              <Button variant="primary" onClick={() => navigate("/app/create")}>
                <Plus className="h-4 w-4" />
                Create a module
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {data.modules.map((m) => {
              const published = m.module.status === "published";
              return (
                <div
                  key={m.module._id}
                  onClick={() => navigate("/app/module/" + m.module._id)}
                  className="glass flex cursor-pointer flex-col gap-4 p-5 transition hover:shadow-glow md:flex-row md:items-center md:justify-between"
                >
                  {/* Left */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink-900">{m.module.title}</span>
                      <DifficultyBadge difficulty={m.module.scenario.difficulty} />
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                          published
                            ? "border-accent-300/60 bg-accent-100 text-accent-700"
                            : "border-amber-300/60 bg-amber-100 text-amber-600",
                        )}
                      >
                        {published ? "Published" : "Draft"}
                      </span>
                    </div>
                    <p className="max-w-xl truncate text-sm text-ink-500">{m.module.description}</p>
                  </div>

                  {/* Right: stats */}
                  <div className="flex shrink-0 flex-wrap items-center gap-6">
                    <div className="w-40 space-y-1.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-900/10">
                        <div
                          className="h-full rounded-full bg-accent-500 transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, m.passRate))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-ink-500">
                        <span className="font-mono">{m.passRate}% pass</span>
                        <span className="font-mono">
                          {m.passed}/{m.assigned} reps
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={cn("font-mono text-lg font-bold", scoreColor(m.avgScore))}>
                        {m.avgScore}
                      </div>
                      {m.range && (
                        <div className="font-mono text-[11px] text-ink-400">
                          {m.range.min}–{m.range.max}
                        </div>
                      )}
                    </div>

                    {!published && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <ButtonHoldAndRelease
                          tone="primary"
                          icon="send"
                          label="Hold to publish"
                          holdingLabel="Publishing…"
                          holdDuration={1000}
                          onConfirm={() => void publish({ moduleId: m.module._id as Id<"modules"> })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
