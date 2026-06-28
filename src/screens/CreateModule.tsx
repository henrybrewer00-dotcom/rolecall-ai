import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DIFFICULTIES, type Difficulty, type ModuleDraft } from "@/lib/types";
import { Button, Spinner, DifficultyBadge } from "@/components/ui";
import { VoiceInterview } from "@/components/VoiceInterview";
import { LiveModulePanel, type ModulePreview } from "@/components/LiveModulePanel";
import { VOICES } from "@/lib/voices";
import { PreviewCall } from "@/components/PreviewCall";
import { ButtonHoldAndRelease } from "@/components/ButtonHoldAndRelease";
import { cn } from "@/lib/utils";
import { Sparkles, Plus, X, ArrowLeft, Send, Scale, Mic, Keyboard, CalendarClock, Phone } from "lucide-react";

type Mode = "choose" | "voice" | "interview" | "review";

type RubricRow = { name: string; weight: number; description: string };

type Draft = {
  title: string;
  description: string;
  goal: string;
  scenario: {
    buyerName: string;
    buyerTitle: string;
    company: string;
    personality: string;
    objections: string[];
    difficulty: Difficulty;
  };
  objectives: string[];
  rubric: RubricRow[];
  voiceId?: string;
};

const BUILD_LINES = [
  "Reading the interview…",
  "Designing the buyer…",
  "Mapping the objections…",
  "Weighting the rubric…",
  "Polishing the module…",
];

function toDraft(d: ModuleDraft): Draft {
  return {
    title: d.title,
    description: d.description,
    goal: d.goal ?? "",
    scenario: {
      buyerName: d.scenario.buyerName,
      buyerTitle: d.scenario.buyerTitle,
      company: d.scenario.company,
      personality: d.scenario.personality,
      objections: [...d.scenario.objections],
      difficulty: d.scenario.difficulty,
    },
    objectives: [...d.objectives],
    rubric: (d.rubric ?? []).map((r) => ({ name: r.name, weight: r.weight, description: r.description })),
    voiceId: d.voiceId,
  };
}

/**
 * Text inputs that opt out of password-manager autofill (1Password / LastPass /
 * Dashlane) — these are content fields, not credentials, so the "menu is
 * available, press down arrow to select" overlay is just noise here.
 */
function TInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other" />;
}
function TArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other" />;
}

export default function CreateModule() {
  const navigate = useNavigate();

  const startedRef = useRef(false);
  const [mode, setMode] = useState<Mode>("choose");
  const [interviewId, setInterviewId] = useState<Id<"interviews"> | null>(null);

  const start = useMutation(api.interviews.start);
  const create = useMutation(api.modules.create);
  const publish = useMutation(api.modules.publish);
  const scheduleModule = useMutation(api.modules.schedule);
  const removeModule = useMutation(api.modules.remove);
  const interviewRespond = useAction(api.ai.interviewRespond);
  const generateModule = useAction(api.ai.generateModule);
  const reviseDraft = useAction(api.ai.reviseDraft);
  const previewDraftAction = useAction(api.ai.previewDraft);
  const updateModule = useMutation(api.modules.update);

  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit") as Id<"modules"> | null;
  const editingModule = useQuery(api.modules.get, editId ? { moduleId: editId } : "skip");
  const [savedModuleId, setSavedModuleId] = useState<Id<"modules"> | null>(null);

  const iv = useQuery(api.interviews.get, interviewId ? { interviewId } : "skip");
  const [livePreview, setLivePreview] = useState<ModulePreview | null>(null);
  const previewBusy = useRef(false);

  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [buildLine, setBuildLine] = useState(0);
  const [error, setError] = useState<string | null>(null);


  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviseText, setReviseText] = useState("");
  const [revising, setRevising] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Begin the interview when entering that mode (guard against StrictMode double-mount).
  useEffect(() => {
    if ((mode !== "interview" && mode !== "voice") || startedRef.current) return;
    startedRef.current = true;
    start({})
      .then((id) => setInterviewId(id))
      .catch(() => setError("Couldn't start the interview. Please try again."));
  }, [mode, start]);

  // Auto-scroll the chat to the bottom on new turns / typing.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [iv?.turns.length, sending]);

  // Rotate the "building…" status lines.
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => setBuildLine((i) => (i + 1) % BUILD_LINES.length), 1400);
    return () => clearInterval(t);
  }, [generating]);

  // Resume editing a saved draft (?edit=<moduleId>).
  useEffect(() => {
    if (editingModule && !draft) {
      setDraft(toDraft(editingModule as unknown as ModuleDraft));
      setSavedModuleId(editingModule._id);
      setMode("review");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingModule]);

  // Live "building your module" while typing — re-extract as the chat grows.
  useEffect(() => {
    if (mode !== "interview" || !iv || iv.turns.length === 0 || previewBusy.current) return;
    previewBusy.current = true;
    previewDraftAction({ turns: iv.turns.map((t) => ({ role: t.role, text: t.text })) })
      .then((p) => setLivePreview(p))
      .catch(() => {})
      .finally(() => {
        previewBusy.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iv?.turns.length, mode]);

  /** Persist the current draft as a saved module (status draft) so nothing is lost. */
  async function persistDraft(d: Draft): Promise<Id<"modules">> {
    const rubric = d.rubric
      .map((r) => ({ name: r.name.trim(), weight: Number(r.weight) || 0, description: r.description.trim() }))
      .filter((r) => r.name.length > 0);
    return await create({
      interviewId: interviewId ?? undefined,
      title: d.title.trim() || "Untitled module",
      description: d.description.trim(),
      goal: d.goal.trim() || undefined,
      scenario: {
        buyerName: d.scenario.buyerName.trim(),
        buyerTitle: d.scenario.buyerTitle.trim(),
        company: d.scenario.company.trim(),
        personality: d.scenario.personality.trim(),
        objections: d.scenario.objections.map((o) => o.trim()).filter(Boolean),
        difficulty: d.scenario.difficulty,
      },
      objectives: d.objectives.map((o) => o.trim()).filter(Boolean),
      rubric: rubric.length > 0 ? rubric : undefined,
    });
  }

  async function send(textArg?: string) {
    const text = (textArg ?? answer).trim();
    if (!text || sending || !interviewId) return;
    setError(null);
    setSending(true);
    try {
      const r = await interviewRespond({ interviewId, answer: text });
      setAnswer("");
      if (r.readyToGenerate) setReady(true);
    } catch {
      setError("That message didn't go through. Try again.");
    } finally {
      setSending(false);
    }
  }

  /** Jump straight to a blank editor for fully manual building. */
  function openManual() {
    setDraft({
      title: "",
      description: "",
      goal: "",
      scenario: {
        buyerName: "",
        buyerTitle: "",
        company: "",
        personality: "",
        objections: ["", "", ""],
        difficulty: "medium" as Difficulty,
      },
      objectives: [""],
      rubric: [],
    });
    setSavedModuleId(null);
    setMode("review");
  }

  async function buildFromInterview() {
    if (!interviewId || generating) return;
    setError(null);
    setGenerating(true);
    setBuildLine(0);
    try {
      const d = await generateModule({ interviewId });
      const dd = toDraft(d);
      setDraft(dd);
      try {
        setSavedModuleId(await persistDraft(dd)); // auto-save so it's never lost
      } catch { /* keep editing even if save fails */ }
      setMode("review");
    } catch {
      setError("Couldn't build the module. Keep chatting and try again.");
    } finally {
      setGenerating(false);
    }
  }

  function patch(p: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }
  function patchScenario(p: Partial<Draft["scenario"]>) {
    setDraft((d) => (d ? { ...d, scenario: { ...d.scenario, ...p } } : d));
  }

  /** Create-or-update the saved module from the current draft and return its id. */
  async function commitDraft(d: Draft): Promise<Id<"modules">> {
    const rubric = d.rubric
      .map((r) => ({ name: r.name.trim(), weight: Number(r.weight) || 0, description: r.description.trim() }))
      .filter((r) => r.name.length > 0);
    const scenarioFields = {
      buyerName: d.scenario.buyerName.trim(),
      buyerTitle: d.scenario.buyerTitle.trim(),
      company: d.scenario.company.trim(),
      personality: d.scenario.personality.trim(),
      objections: d.scenario.objections.map((o) => o.trim()).filter(Boolean),
      difficulty: d.scenario.difficulty,
    };
    const objectives = d.objectives.map((o) => o.trim()).filter(Boolean);
    // Update the auto-saved draft in place, or create one.
    if (savedModuleId) {
      await updateModule({
        moduleId: savedModuleId,
        title: d.title.trim(),
        description: d.description.trim(),
        goal: d.goal.trim() || undefined,
        scenario: scenarioFields,
        objectives,
        rubric: rubric.length > 0 ? rubric : undefined,
        voiceId: d.voiceId || undefined,
      });
      return savedModuleId;
    }
    const moduleId = await create({
      interviewId: interviewId ?? undefined,
      title: d.title.trim(),
      description: d.description.trim(),
      goal: d.goal.trim() || undefined,
      scenario: scenarioFields,
      objectives,
      rubric: rubric.length > 0 ? rubric : undefined,
      voiceId: d.voiceId || undefined,
    });
    setSavedModuleId(moduleId);
    return moduleId;
  }

  async function save(alsoPublish: boolean) {
    if (!draft || saving) return;
    if (!draft.title.trim() || draft.objectives.filter((o) => o.trim()).length === 0) return;
    setError(null);
    setSaving(true);
    try {
      const moduleId = await commitDraft(draft);
      if (alsoPublish) await publish({ moduleId });
      navigate(alsoPublish ? "/app/module/" + moduleId : "/app/modules");
    } catch {
      setError("Couldn't save the module. Try again.");
      setSaving(false);
    }
  }

  /** Save the draft and schedule it to auto-publish at the chosen time. */
  async function scheduleDraft() {
    if (!draft || saving) return;
    if (!draft.title.trim() || draft.objectives.filter((o) => o.trim()).length === 0) return;
    const whenMs = scheduleAt ? new Date(scheduleAt).getTime() : NaN;
    if (!Number.isFinite(whenMs) || whenMs <= Date.now()) {
      setError("Pick a date and time in the future to schedule.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const moduleId = await commitDraft(draft);
      await scheduleModule({ moduleId, scheduledFor: whenMs });
      navigate("/app/modules");
    } catch {
      setError("Couldn't schedule the module. Try again.");
      setSaving(false);
    }
  }

  /** Throw away this draft (deletes the auto-saved module too). */
  async function discardDraft() {
    try {
      if (savedModuleId) await removeModule({ moduleId: savedModuleId });
    } catch {
      /* ignore */
    }
    setSavedModuleId(null);
    setDraft(null);
    navigate("/app/modules");
  }

  /** Apply a free-text/voice revision to the current draft (throws on failure). Returns the new draft. */
  async function applyRevision(instruction: string): Promise<Draft | null> {
    const ins = instruction.trim();
    if (!ins || !draft) return null;
    const revised = await reviseDraft({
      instruction: ins,
      draft: {
        title: draft.title,
        description: draft.description,
        goal: draft.goal,
        scenario: { ...draft.scenario, objections: [...draft.scenario.objections] },
        objectives: [...draft.objectives],
        rubric: draft.rubric.map((r) => ({ name: r.name, weight: Number(r.weight) || 0, description: r.description })),
      },
    });
    // Keep the chosen buyer voice across a revision.
    const next: Draft = { ...toDraft(revised), voiceId: draft.voiceId };
    setDraft(next);
    return next;
  }

  async function reviseWithAI() {
    const instruction = reviseText.trim();
    if (!instruction || revising || !draft) return;
    setError(null);
    setRevising(true);
    try {
      await applyRevision(instruction);
      setReviseText("");
    } catch {
      setError("Couldn't apply that change. Try rephrasing.");
    } finally {
      setRevising(false);
    }
  }

  // ---- BUILDING FROM INTERVIEW (full-bleed) ----
  if (generating) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <div className="glass-strong flex min-h-[60vh] flex-col items-center justify-center gap-6 p-10 text-center animate-fade-up">
          <Spinner className="h-10 w-10 text-accent-500" />
          <div>
            <h2 className="text-lg font-extrabold text-ink-900">Building your module…</h2>
            <p className="mt-2 text-sm text-ink-500 transition-all">{BUILD_LINES[buildLine]}</p>
          </div>
          <div className="flex gap-1.5">
            {BUILD_LINES.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-6 rounded-full transition-colors",
                  i <= buildLine ? "bg-accent-500" : "bg-ink-900/10",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- REVIEW ----
  if (mode === "review" && draft) {
    const canSave = draft.title.trim().length > 0 && draft.objectives.some((o) => o.trim().length > 0);
    const weightTotal = draft.rubric.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <button
          onClick={() => setMode("choose")}
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 transition hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> start over
        </button>

        {previewOpen && draft && (
          <PreviewCall
            title={draft.title}
            description={draft.description}
            scenario={{ ...draft.scenario, objections: draft.scenario.objections.filter(Boolean) }}
            voiceId={draft.voiceId}
            onAdjust={async (instruction) => {
              const next = await applyRevision(instruction);
              return next
                ? { ...next.scenario, objections: next.scenario.objections.filter(Boolean) }
                : null;
            }}
            onClose={() => setPreviewOpen(false)}
          />
        )}

        <div className="glass-strong space-y-6 p-7 animate-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="label mb-1 text-accent-600">Module draft</div>
              <h1 className="text-xl font-extrabold tracking-tight text-ink-900">Review &amp; publish</h1>
              <p className="mt-1 text-sm text-ink-500">Edit anything by hand, talk to the buyer to test it, or tell the AI what to change. Then save, schedule, or publish.</p>
            </div>
            <Button variant="ghost" onClick={() => setPreviewOpen(true)} className="shrink-0">
              <Phone className="h-4 w-4" /> Preview
            </Button>
          </div>

          {/* Prompt-to-change */}
          <div className="rounded-md border border-accent-400/60 bg-accent-50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-accent-700">
              <Sparkles className="h-3.5 w-3.5" /> Ask AI to change it
            </div>
            <div className="flex items-end gap-2">
              <TArea
                className="input min-h-[60px] flex-1 resize-none bg-white leading-relaxed"
                rows={2}
                value={reviseText}
                placeholder="e.g. make the buyer more hostile, or add a pricing objection"
                disabled={revising}
                onChange={(e) => setReviseText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void reviseWithAI();
                  }
                }}
              />
              <Button onClick={() => void reviseWithAI()} loading={revising} disabled={!reviseText.trim()}>
                <Sparkles className="h-4 w-4" /> Apply
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="label">Title</label>
            <TInput
              className="input"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="e.g. Win-back call with a churned mid-market buyer"
            />
          </div>

          <div className="space-y-1.5">
            <label className="label">Description</label>
            <TArea
              className="input min-h-[80px] resize-y"
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="What this scenario is about and why it matters."
            />
          </div>

          <div className="space-y-1.5">
            <label className="label">Goal</label>
            <TInput
              className="input"
              value={draft.goal}
              onChange={(e) => patch({ goal: e.target.value })}
              placeholder="The one thing the rep should walk away able to do."
            />
            <p className="text-xs text-ink-400">Shown to the rep before the call so they know what they're practicing.</p>
          </div>

          <div className="space-y-4 rounded-md border border-white/60 bg-white/40 p-5">
            <div className="label text-accent-600">The buyer</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="label">Name</label>
                <TInput
                  className="input"
                  value={draft.scenario.buyerName}
                  onChange={(e) => patchScenario({ buyerName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="label">Title</label>
                <TInput
                  className="input"
                  value={draft.scenario.buyerTitle}
                  onChange={(e) => patchScenario({ buyerTitle: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="label">Company</label>
                <TInput
                  className="input"
                  value={draft.scenario.company}
                  onChange={(e) => patchScenario({ company: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="label">Personality</label>
              <TArea
                className="input min-h-[70px] resize-y"
                value={draft.scenario.personality}
                onChange={(e) => patchScenario({ personality: e.target.value })}
                placeholder="How they talk, what they care about, their mood."
              />
            </div>

            <div className="space-y-2">
              <label className="label">Difficulty</label>
              <div className="flex flex-wrap gap-2">
                {DIFFICULTIES.map((d) => {
                  const active = draft.scenario.difficulty === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      title={d.blurb}
                      onClick={() => patchScenario({ difficulty: d.value })}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-sm font-semibold transition",
                        active
                          ? "border-accent-400 bg-accent-100 text-accent-700 shadow-glow"
                          : "border-white/60 bg-white/50 text-ink-500 hover:text-ink-700",
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div className="pt-1">
                <DifficultyBadge difficulty={draft.scenario.difficulty} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="label">Buyer voice</label>
              <p className="text-xs text-ink-400">Auto-matched to the buyer — change it if you like.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {VOICES.map((v) => {
                  const active = (draft.voiceId ?? "") === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => patch({ voiceId: v.id })}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left transition",
                        active
                          ? "border-accent-400 bg-accent-100 shadow-glow"
                          : "border-white/60 bg-white/50 hover:border-ink-900/30",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-semibold text-ink-900">{v.name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-ink-400">{v.gender}</span>
                      </div>
                      <div className="text-xs text-ink-500">{v.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <EditableList
              label="Objections"
              placeholder="e.g. We already have a vendor for this."
              items={draft.scenario.objections}
              onChange={(objections) => patchScenario({ objections })}
            />
          </div>

          <EditableList
            label="What they must nail"
            placeholder="e.g. Reframe price as cost-of-inaction."
            items={draft.objectives}
            onChange={(objectives) => patch({ objectives })}
          />

          {/* RUBRIC */}
          <div className="space-y-4 rounded-md border border-white/60 bg-white/40 p-5">
            <div>
              <div className="label flex items-center gap-1.5 text-accent-600">
                <Scale className="h-3.5 w-3.5" /> Grading rubric
              </div>
              <p className="mt-1 text-sm text-ink-500">
                The AI proposes weighted criteria — approve or tweak.
              </p>
            </div>

            <div className="space-y-2">
              {draft.rubric.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <TInput
                    className="input w-full sm:w-44"
                    value={r.name}
                    placeholder="Criterion"
                    onChange={(e) => {
                      const next = [...draft.rubric];
                      next[i] = { ...next[i], name: e.target.value };
                      patch({ rubric: next });
                    }}
                  />
                  <div className="relative w-24 flex-none">
                    <input
                      className="input pr-7 text-right"
                      type="number"
                      min={0}
                      max={100}
                      value={r.weight}
                      onChange={(e) => {
                        const next = [...draft.rubric];
                        next[i] = { ...next[i], weight: Number(e.target.value) };
                        patch({ rubric: next });
                      }}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                      %
                    </span>
                  </div>
                  <TInput
                    className="input min-w-0 flex-1"
                    value={r.description}
                    placeholder="What good looks like for this criterion."
                    onChange={(e) => {
                      const next = [...draft.rubric];
                      next[i] = { ...next[i], description: e.target.value };
                      patch({ rubric: next });
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Remove criterion"
                    onClick={() => patch({ rubric: draft.rubric.filter((_, j) => j !== i) })}
                    className="grid h-9 w-9 flex-none place-items-center rounded-md border border-white/60 bg-white/50 text-ink-400 transition hover:text-rose-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  patch({ rubric: [...draft.rubric, { name: "", weight: 0, description: "" }] })
                }
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent-600 transition hover:text-accent-700"
              >
                <Plus className="h-4 w-4" /> add criterion
              </button>
              {draft.rubric.length > 0 && (
                <span className={cn("text-xs font-medium", weightTotal === 100 ? "text-accent-600" : "text-ink-400")}>
                  weights total {weightTotal}%
                </span>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void save(true)} loading={saving} disabled={!canSave}>
                Publish to team
              </Button>
              <button
                type="button"
                className="btn-soft inline-flex items-center gap-1.5"
                onClick={() => {
                  setError(null);
                  setScheduleOpen((v) => !v);
                }}
                disabled={!canSave || saving}
              >
                <CalendarClock className="h-4 w-4" /> Schedule
              </button>
              <button
                type="button"
                className="btn-soft"
                onClick={() => void save(false)}
                disabled={!canSave || saving}
              >
                Save as draft
              </button>
              <ButtonHoldAndRelease
                tone="danger"
                icon="trash"
                label="Hold to discard"
                holdingLabel="Discarding…"
                className="ml-auto"
                onConfirm={() => void discardDraft()}
              />
            </div>

            {scheduleOpen && (
              <div className="flex flex-wrap items-end gap-3 rounded-md border border-accent-400/60 bg-accent-50 p-3 animate-fade-up">
                <div className="space-y-1.5">
                  <label className="label flex items-center gap-1.5 text-accent-700">
                    <CalendarClock className="h-3.5 w-3.5" /> Publish automatically at
                  </label>
                  <TInput
                    type="datetime-local"
                    className="input"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                  />
                </div>
                <Button onClick={() => void scheduleDraft()} loading={saving} disabled={!scheduleAt}>
                  Schedule it
                </Button>
                <p className="w-full text-xs text-ink-400">
                  It stays a draft until then — at that time it auto-publishes and assigns to your team.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- VOICE INTERVIEW ----
  if (mode === "voice") {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {interviewId ? (
          <VoiceInterview
            interviewId={interviewId}
            onBuilt={(d) => {
              setDraft(toDraft(d));
              setMode("review");
            }}
            onCancel={() => setMode("choose")}
            onSwitchToText={() => setMode("interview")}
          />
        ) : (
          <div className="glass-strong grid min-h-[40vh] place-items-center">
            <Spinner className="h-7 w-7 text-accent-500" />
          </div>
        )}
      </div>
    );
  }

  // ---- INTERVIEW ----
  if (mode === "interview") {
    const turns = iv?.turns ?? [];
    const showBuild = ready || turns.length >= 12; // only once the AI has enough
    const loadingInterview = interviewId !== null && iv === undefined;

    return (
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <button
          onClick={() => setMode("choose")}
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 transition hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> back
        </button>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="glass-strong flex h-[60vh] flex-col p-0 animate-fade-up">
          <div className="border-b border-white/50 px-6 py-5">
            <div className="label text-accent-600">New module</div>
            <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-ink-900">
              Tell me about the scenario
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              I'll interview you, then build a practice module your team can run.
            </p>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {loadingInterview && (
              <div className="grid h-full place-items-center">
                <Spinner className="h-6 w-6 text-accent-500" />
              </div>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                className={cn("flex animate-fade-up", t.role === "manager" ? "justify-end" : "justify-start")}
              >
                {t.role === "assistant" ? (
                  <div className="glass-subtle max-w-[80%] rounded-md rounded-bl-sm px-4 py-2.5 text-sm text-ink-800">
                    {t.text}
                  </div>
                ) : (
                  <div
                    className="max-w-[80%] rounded-md rounded-br-sm px-4 py-2.5 text-sm font-medium text-white shadow-glow"
                    style={{ backgroundImage: "linear-gradient(135deg,#5f7d16,#33450e)" }}
                  >
                    {t.text}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="glass-subtle flex items-center gap-1 rounded-md rounded-bl-sm px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {showBuild && (
            <div className="border-t border-white/50 px-6 py-3">
              <Button variant="magenta" onClick={() => void buildFromInterview()} className="w-full">
                <Sparkles className="h-4 w-4" /> Review module
              </Button>
            </div>
          )}

          <div className="border-t border-white/50 px-6 py-4">
            {error && <p className="mb-2 text-sm text-rose-500">{error}</p>}
            <div className="flex items-end gap-2">
              <TArea
                className="input min-h-[44px] flex-1 resize-none"
                rows={1}
                value={answer}
                placeholder="Type your answer…"
                disabled={!interviewId || sending}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <Button onClick={() => void send()} loading={sending} disabled={!answer.trim() || !interviewId}>
                <Send className="h-4 w-4" /> Send
              </Button>
            </div>
            {!showBuild && interviewId && (
              <p className="mt-2 text-center text-xs text-ink-400">Keep going — I'll offer “Review module” once I have enough.</p>
            )}
          </div>
        </div>
          <LiveModulePanel preview={livePreview} className="hidden h-[60vh] lg:block" />
        </div>
      </div>
    );
  }

  // ---- CHOOSE ----
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 sm:space-y-10">
      <div className="animate-fade-up text-center sm:text-left">
        <div className="label text-accent-600">New module</div>
        <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">Create a module</h1>
        <p className="mt-2 text-base text-ink-500 sm:text-lg">
          Pick how to build it — you'll review and add any final context before sending.
        </p>
      </div>

      {/* Build options */}
      <div className="grid gap-5 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setMode("voice")}
          className="glass group flex min-h-[230px] flex-col items-start justify-center gap-5 p-7 text-left transition hover:-translate-y-0.5 hover:shadow-glow animate-fade-up sm:p-8"
        >
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-ink-900/15 bg-accent-300 text-ink-900">
            <Mic className="h-7 w-7" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-ink-900">Talk it through</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-500">The AI interviews you out loud and builds it live.</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode("interview")}
          className="glass group flex min-h-[230px] flex-col items-start justify-center gap-5 p-7 text-left transition hover:-translate-y-0.5 hover:shadow-glow animate-fade-up sm:p-8"
        >
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-ink-900/15 bg-white text-ink-900">
            <Keyboard className="h-7 w-7" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-ink-900">Type it out</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-500">Chat with the AI by typing — watch it fill in live.</p>
          </div>
        </button>

        <button
          type="button"
          onClick={openManual}
          className="glass group flex min-h-[230px] flex-col items-start justify-center gap-5 p-7 text-left transition hover:-translate-y-0.5 hover:shadow-glow animate-fade-up sm:p-8"
        >
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-ink-900 bg-ink-900 text-white">
            <Scale className="h-7 w-7" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-ink-900">Build manually</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-500">Fill it in yourself — and still tweak it with AI.</p>
          </div>
        </button>
      </div>

      {error && <p className="text-sm text-rose-500 animate-fade-up">{error}</p>}
    </div>
  );
}

function EditableList({
  label,
  placeholder,
  items,
  onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="label">{label}</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <TInput
              className="input flex-1"
              value={item}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="grid h-9 w-9 flex-none place-items-center rounded-md border border-white/60 bg-white/50 text-ink-400 transition hover:text-rose-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="inline-flex items-center gap-1 text-sm font-semibold text-accent-600 transition hover:text-accent-700"
      >
        <Plus className="h-4 w-4" /> add
      </button>
    </div>
  );
}
