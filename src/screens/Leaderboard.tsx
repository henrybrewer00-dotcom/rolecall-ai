import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Spinner, EmptyState } from "@/components/ui";
import { cn, scoreColor, initials, formatRelativeTime } from "@/lib/utils";
import { Trophy, Flame, Crown } from "lucide-react";

const MEDAL = ["#e8b923", "#9aa3ad", "#c08457"]; // gold / silver / bronze

export default function Leaderboard() {
  const navigate = useNavigate();
  const rows = useQuery(api.analytics.leaderboard, {});
  const me = useQuery(api.analytics.myStats, {});
  const viewer = useQuery(api.users.viewer);
  const isManager = viewer?.role === "manager";

  if (rows === undefined) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }

  const ranked = rows.filter((r) => r.attempts > 0);
  const idle = rows.filter((r) => r.attempts === 0);

  return (
    <div className="w-full space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-accent-300 text-ink-900">
          <Trophy className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">Leaderboard</h1>
          <p className="text-sm text-ink-500">Ranked by average score across team practice calls.</p>
        </div>
      </header>

      {/* Your standing (reps especially) */}
      {me && !isManager && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MyStat label="Your rank" value={me.rank > 0 ? `#${me.rank}` : "—"} icon={<Crown className="h-4 w-4" />} />
          <MyStat label="Avg score" value={String(me.avgScore)} color={scoreColor(me.avgScore)} />
          <MyStat label="Day streak" value={String(me.currentStreak)} icon={<Flame className="h-4 w-4 text-accent-600" />} />
          <MyStat label="This week" value={`${me.thisWeekCount} calls`} />
        </div>
      )}

      {ranked.length === 0 ? (
        <EmptyState
          title="No ranked reps yet"
          description="Once your team starts completing practice calls, the leaderboard fills in here."
        />
      ) : (
        <ul className="space-y-2">
          {ranked.map((r, i) => {
            const isMe = viewer && r.repId === viewer._id;
            const clickable = isManager;
            return (
              <li key={r.repId}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && navigate(`/app/rep/${r.repId}`)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors sm:gap-4 sm:px-4",
                    isMe ? "border-accent-400 bg-accent-50" : "border-ink-900/10 bg-white",
                    clickable && "hover:border-ink-900/25",
                  )}
                >
                  {/* Rank */}
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold tabular-nums"
                    style={
                      i < 3
                        ? { backgroundColor: MEDAL[i], color: "#1a1d12" }
                        : { backgroundColor: "rgba(20,22,26,0.06)", color: "#5b6470" }
                    }
                  >
                    {i + 1}
                  </span>
                  {/* Avatar */}
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-200 text-xs font-bold text-ink-900">
                    {initials(r.name)}
                  </span>
                  {/* Name + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold text-ink-900">{r.name}</span>
                      {isMe && <span className="pill shrink-0 text-[10px] text-accent-700">You</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-400">
                      <span>{r.attempts} {r.attempts === 1 ? "call" : "calls"}</span>
                      {r.currentStreak > 0 && (
                        <span className="inline-flex items-center gap-0.5 font-medium text-accent-700">
                          <Flame className="h-3 w-3" /> {r.currentStreak}d
                        </span>
                      )}
                      {r.lastActiveAt && <span className="hidden sm:inline">· {formatRelativeTime(r.lastActiveAt)}</span>}
                    </div>
                  </div>
                  {/* Scores */}
                  <div className="shrink-0 text-right">
                    <div className={cn("font-mono text-xl font-extrabold tabular-nums leading-none", scoreColor(r.avgScore))}>
                      {r.avgScore}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-400">best {r.bestScore}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Reps who haven't started */}
      {idle.length > 0 && (
        <div className="space-y-2">
          <h2 className="label">Yet to practice</h2>
          <div className="flex flex-wrap gap-2">
            {idle.map((r) => {
              const isMe = viewer && r.repId === viewer._id;
              return (
                <button
                  key={r.repId}
                  type="button"
                  disabled={!isManager}
                  onClick={() => isManager && navigate(`/app/rep/${r.repId}`)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                    isMe ? "border-accent-400 bg-accent-50 text-ink-900" : "border-ink-900/10 bg-white text-ink-500",
                  )}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-ink-900/[0.06] text-[9px] font-bold text-ink-500">
                    {initials(r.name)}
                  </span>
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MyStat({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: ReactNode }) {
  return (
    <div className="glass flex flex-col gap-1 p-4">
      <span className="label inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className={cn("font-mono text-2xl font-extrabold tabular-nums text-ink-900", color)}>{value}</span>
    </div>
  );
}
