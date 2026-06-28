import { cn } from "@/lib/utils";

/**
 * Animated hero visual: the 3D blob render floats and breathes, a soft color
 * glow pulses behind it, and a live equalizer pulses over the central orb —
 * a "kinda moving" hero without a video file.
 */
export function HeroVisual({ className }: { className?: string }) {
  return (
    <div className={cn("relative aspect-square w-full max-w-[460px]", className)}>
      {/* pulsing color glow behind */}
      <div
        className="absolute inset-[12%] rounded-full blur-3xl animate-pulse-soft"
        style={{ backgroundImage: "radial-gradient(circle at 40% 40%, rgba(34,211,187,0.55), rgba(167,139,250,0.4) 45%, rgba(244,114,182,0.35) 70%, transparent 75%)" }}
      />
      {/* drifting accent blobs */}
      <div className="absolute left-[6%] top-[10%] h-20 w-20 rounded-full bg-accent-300/50 blur-2xl animate-blob-drift" />
      <div className="absolute right-[8%] bottom-[14%] h-24 w-24 rounded-full bg-magenta-300/50 blur-2xl animate-float-slow" />

      {/* the render, gently floating */}
      <img
        src="/hero-blobs.png"
        alt="RoleCall AI"
        className="relative z-10 h-full w-full select-none object-contain animate-float drop-shadow-[0_30px_50px_rgba(15,23,42,0.18)]"
        draggable={false}
      />

      {/* live equalizer over the central orb */}
      <div className="absolute inset-0 z-20 grid place-items-center">
        <div className="flex h-12 items-end gap-1.5" style={{ transform: "translateY(-2%)" }}>
          {[0.5, 0.8, 0.4, 1, 0.65, 0.9, 0.45].map((h, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-white/90 animate-eq"
              style={{ height: `${h * 100}%`, animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
