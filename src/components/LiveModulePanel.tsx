import { cn } from "@/lib/utils";
import { Check, FileText } from "lucide-react";

export type ModulePreview = {
  title: string;
  description: string;
  buyerName: string;
  buyerTitle: string;
  company: string;
  personality: string;
  objections: string[];
  objectives: string[];
  rubric: string[];
  difficulty: string;
};

/** Live "the module filling out as you talk/type" panel. */
export function LiveModulePanel({ preview, className }: { preview: ModulePreview | null; className?: string }) {
  return (
    <div className={cn("surface overflow-y-auto p-4", className)}>
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-400">
        <FileText className="h-3.5 w-3.5" /> Building your module
        {preview && (
          <span className="ml-auto inline-flex items-center gap-1 text-accent-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-500" />
            live
          </span>
        )}
      </div>
      <Field label="Title" value={preview?.title} />
      <Field label="What it's about" value={preview?.description} multiline />
      <Field label="Counterpart" value={preview ? [preview.buyerName, preview.buyerTitle].filter(Boolean).join(" · ") : ""} />
      <Field label="Company" value={preview?.company} />
      <Field label="Personality" value={preview?.personality} multiline />
      <Field label="Difficulty" value={preview?.difficulty} />
      <List label="Pushback / objections" items={preview?.objections} />
      <List label="Must nail" items={preview?.objectives} check />
      <List label="Grading rubric" items={preview?.rubric} />
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  return (
    <div className="mb-2.5">
      <div className="label mb-0.5">{label}</div>
      {value ? (
        <div className={cn("animate-fade-up text-ink-900", multiline ? "text-xs leading-relaxed text-ink-700" : "text-sm font-semibold")}>
          {value}
        </div>
      ) : (
        <div className="h-3 w-1/2 rounded shimmer" />
      )}
    </div>
  );
}

function List({ label, items, check }: { label: string; items?: string[]; check?: boolean }) {
  return (
    <div className="mb-2.5">
      <div className="label mb-1">{label}</div>
      {items && items.length ? (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-ink-700 animate-fade-up">
              {check ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent-600" />
              ) : (
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
              )}
              {it}
            </li>
          ))}
        </ul>
      ) : (
        <div className="h-3 w-2/3 rounded shimmer" />
      )}
    </div>
  );
}
