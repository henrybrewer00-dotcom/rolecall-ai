import { useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigate } from "react-router-dom";
import { Button, Spinner, DifficultyBadge, EmptyState } from "@/components/ui";
import { ButtonHoldAndRelease } from "@/components/ButtonHoldAndRelease";
import { formatRelativeTime } from "@/lib/utils";
import { Plus, Pencil, CalendarClock, Eye, X } from "lucide-react";

type ModuleStatus = "draft" | "scheduled" | "published";

type Module = {
  _id: Id<"modules">;
  _creationTime: number;
  title: string;
  description: string;
  scenario: { buyerName: string; buyerTitle: string; company: string; difficulty: string };
  objectives: string[];
  status: ModuleStatus;
  scheduledFor?: number;
  publishedAt?: number;
  kind?: "team" | "personal";
};

function MetaLine({ m }: { m: Module }) {
  return (
    <p className="text-xs text-ink-400">
      Buyer: {m.scenario.buyerName} · {m.scenario.buyerTitle}
      <span className="mx-1.5">·</span>
      <span className="font-mono">{m.objectives.length}</span> objectives
    </p>
  );
}

export default function Modules() {
  const navigate = useNavigate();
  const modules = useQuery(api.modules.listMine);
  const publish = useMutation(api.modules.publish);
  const schedule = useMutation(api.modules.schedule);
  const unschedule = useMutation(api.modules.unschedule);
  const remove = useMutation(api.modules.remove);

  const [scheduleOpenId, setScheduleOpenId] = useState<Id<"modules"> | null>(null);
  const [scheduleValue, setScheduleValue] = useState("");

  if (modules === undefined) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }

  const team = (modules as Module[]).filter((m) => m.kind !== "personal");
  const drafts = team.filter((m) => m.status === "draft");
  const scheduled = team.filter((m) => m.status === "scheduled");
  const published = team.filter((m) => m.status === "published");
  const allEmpty = team.length === 0;

  function openSchedule(id: Id<"modules">) {
    setScheduleOpenId(id);
    setScheduleValue("");
  }
  function closeSchedule() {
    setScheduleOpenId(null);
    setScheduleValue("");
  }
  function confirmSchedule(id: Id<"modules">) {
    const ms = new Date(scheduleValue).getTime();
    if (ms > Date.now()) void schedule({ moduleId: id, scheduledFor: ms });
    closeSchedule();
  }

  function ScheduleControl({ m }: { m: Module }) {
    if (scheduleOpenId === m._id) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            className="input h-9 w-full py-1 text-sm sm:w-auto"
            value={scheduleValue}
            onChange={(e) => setScheduleValue(e.target.value)}
          />
          <Button variant="primary" onClick={() => confirmSchedule(m._id)} disabled={!scheduleValue}>
            Set
          </Button>
          <Button variant="ghost" onClick={closeSchedule} aria-label="Cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }
    return (
      <Button variant="ghost" onClick={() => openSchedule(m._id)}>
        <CalendarClock className="h-4 w-4" /> Schedule
      </Button>
    );
  }

  function CardShell({ m, children }: { m: Module; children: ReactNode }) {
    return (
      <div className="glass flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-ink-900">{m.title}</h3>
          <DifficultyBadge difficulty={m.scenario.difficulty} />
        </div>
        <p className="line-clamp-2 text-sm text-ink-500">{m.description}</p>
        <MetaLine m={m} />
        {children}
      </div>
    );
  }

  function EditButton({ m }: { m: Module }) {
    return (
      <button className="btn-soft" onClick={() => navigate("/app/create?edit=" + m._id)}>
        <Pencil className="h-4 w-4" /> Edit
      </button>
    );
  }

  function Section({ title, items, render }: { title: string; items: Module[]; render: (m: Module) => ReactNode }) {
    if (items.length === 0) return null;
    return (
      <section className="flex flex-col gap-3">
        <h2 className="label flex items-center gap-2">
          {title}
          <span className="font-mono text-ink-400">{items.length}</span>
        </h2>
        <div className="grid gap-3 md:grid-cols-2">{items.map((m) => render(m))}</div>
      </section>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-ink-900 sm:text-3xl">Modules</h1>
          <p className="mt-1 text-sm text-ink-500">Everything you've built — drafts, scheduled, and live.</p>
        </div>
        <Button variant="primary" onClick={() => navigate("/app/create")}>
          <Plus className="h-4 w-4" /> Create module
        </Button>
      </header>

      {allEmpty ? (
        <EmptyState
          title="No modules yet"
          description="Build your first training module — talk it through and the AI drafts it for you."
          action={<Button onClick={() => navigate("/app/create")}>Create a module</Button>}
        />
      ) : (
        <div className="flex flex-col gap-10">
          <Section
            title="Drafts"
            items={drafts}
            render={(m) => (
              <CardShell key={m._id} m={m}>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <EditButton m={m} />
                  <ScheduleControl m={m} />
                  <ButtonHoldAndRelease
                    tone="primary"
                    icon="send"
                    label="Hold to publish"
                    onConfirm={() => void publish({ moduleId: m._id })}
                  />
                  <ButtonHoldAndRelease
                    tone="danger"
                    icon="trash"
                    label="Hold to delete"
                    onConfirm={() => void remove({ moduleId: m._id })}
                  />
                </div>
              </CardShell>
            )}
          />

          <Section
            title="Scheduled"
            items={scheduled}
            render={(m) => (
              <CardShell key={m._id} m={m}>
                {m.scheduledFor !== undefined && (
                  <span className="pill w-fit">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Publishes {new Date(m.scheduledFor).toLocaleString()}
                  </span>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <EditButton m={m} />
                  <Button variant="ghost" onClick={() => void unschedule({ moduleId: m._id })}>
                    Cancel schedule
                  </Button>
                  <ButtonHoldAndRelease
                    tone="primary"
                    icon="send"
                    label="Hold to publish"
                    onConfirm={() => void publish({ moduleId: m._id })}
                  />
                  <ButtonHoldAndRelease
                    tone="danger"
                    icon="trash"
                    label="Hold to delete"
                    onConfirm={() => void remove({ moduleId: m._id })}
                  />
                </div>
              </CardShell>
            )}
          />

          <Section
            title="Published"
            items={published}
            render={(m) => (
              <CardShell key={m._id} m={m}>
                <span className="pill w-fit">
                  Live · published {formatRelativeTime(m.publishedAt ?? m._creationTime)}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Button variant="ghost" onClick={() => navigate("/app/module/" + m._id)}>
                    <Eye className="h-4 w-4" /> View
                  </Button>
                  <ButtonHoldAndRelease
                    tone="danger"
                    icon="trash"
                    label="Hold to delete"
                    onConfirm={() => void remove({ moduleId: m._id })}
                  />
                </div>
              </CardShell>
            )}
          />
        </div>
      )}
    </div>
  );
}
