import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn, difficultyClasses } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 font-bold tracking-tight", className)}>
      <span
        className="grid h-8 w-8 place-items-center rounded-[5px] border border-ink-900/15 text-ink-900"
        style={{ backgroundImage: "linear-gradient(135deg,#d4f55e,#aedb24)" }}
      >
        <EqIcon className="h-4 w-4" />
      </span>
      <span className="font-display text-[16px] font-semibold text-ink-900">
        RoleCall<span className="text-accent-700"> AI</span>
      </span>
    </div>
  );
}

/** Animated equalizer / sound-wave glyph used in the logo and call orb. */
export function EqIcon({ className, animate }: { className?: string; animate?: boolean }) {
  const bars = [0.5, 0.85, 0.35, 1, 0.6];
  return (
    <span className={cn("flex items-end gap-[2px]", className)}>
      {bars.map((h, i) => (
        <span
          key={i}
          className={cn("w-[2px] flex-1 rounded-full bg-current", animate && "animate-eq")}
          style={{ height: `${h * 100}%`, animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "magenta" | "danger";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading, className, children, disabled, ...props },
  ref,
) {
  const variants = { primary: "btn-primary", ghost: "btn-ghost", magenta: "btn-magenta", danger: "btn-danger" };
  return (
    <button ref={ref} className={cn(variants[variant], className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function FullPageLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-4 text-ink-500">
        <Spinner className="h-8 w-8 text-accent-500" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("glass p-6", className)}>{children}</div>;
}

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("pill", className)}>{children}</span>;
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        difficultyClasses(difficulty),
      )}
    >
      {difficulty}
    </span>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center gap-3 px-8 py-16 text-center">
      <h3 className="text-lg font-bold text-ink-900">{title}</h3>
      <p className="max-w-sm text-sm text-ink-500">{description}</p>
      {action}
    </div>
  );
}

/** Circular score ring (0..100). */
export function ScoreRing({ score, size = 180, stroke = 12, className }: { score: number; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = score >= 80 ? "#0d9488" : score >= 70 ? "#14b8a6" : score >= 50 ? "#f59e0b" : "#f43f5e";
  return (
    <svg width={size} height={size} className={className}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
      />
    </svg>
  );
}
