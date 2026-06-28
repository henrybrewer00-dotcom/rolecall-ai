import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Live activity indicator shown while a rep is on a practice call (or typing).
 * `mode="live"` shows an indeterminate sweeping gradient; `mode="speaking"`
 * pulses brighter. Optional elapsed/limit renders a determinate fill.
 */
export function CallProgress({
  mode = "live",
  elapsed,
  limit,
  className,
}: {
  mode?: "live" | "speaking" | "idle";
  elapsed?: number;
  limit?: number;
  className?: string;
}) {
  const determinate = typeof elapsed === "number" && typeof limit === "number" && limit > 0;
  const pct = determinate ? Math.min(100, (elapsed! / limit!) * 100) : 0;

  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-ink-900/10", className)}>
      {determinate ? (
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%`, backgroundImage: "linear-gradient(90deg,#22d3bb,#a78bfa,#f472b6)" }}
        />
      ) : (
        <motion.div
          className="absolute top-0 h-full w-1/3 rounded-full"
          style={{ backgroundImage: "linear-gradient(90deg,transparent,#22d3bb,#a78bfa,transparent)" }}
          animate={{ left: ["-33%", "100%"] }}
          transition={{ duration: mode === "speaking" ? 1.1 : 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}
