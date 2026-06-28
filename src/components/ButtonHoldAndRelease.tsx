import * as React from "react";
import { useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { Trash2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "danger" | "primary";

interface Props extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  holdDuration?: number;
  label?: string;
  holdingLabel?: string;
  tone?: Tone;
  icon?: "trash" | "send" | "none";
  onConfirm?: () => void;
}

/**
 * Press-and-hold to confirm. The fill sweeps over `holdDuration`; releasing
 * early cancels. Used for destructive / irreversible actions (publish, delete).
 */
export function ButtonHoldAndRelease({
  className,
  holdDuration = 1200,
  label = "Hold to confirm",
  holdingLabel = "Keep holding…",
  tone = "danger",
  icon = "trash",
  onConfirm,
  disabled,
  ...props
}: Props) {
  const [isHolding, setIsHolding] = useState(false);
  const controls = useAnimation();
  const completedRef = React.useRef(false);

  async function start() {
    if (disabled) return;
    completedRef.current = false;
    setIsHolding(true);
    controls.set({ width: "0%" });
    try {
      await controls.start({ width: "100%", transition: { duration: holdDuration / 1000, ease: "linear" } });
      // Reached 100% without release → confirm.
      completedRef.current = true;
      setIsHolding(false);
      onConfirm?.();
      controls.set({ width: "0%" });
    } catch {
      /* interrupted */
    }
  }
  function end() {
    if (completedRef.current) return;
    setIsHolding(false);
    controls.stop();
    controls.start({ width: "0%", transition: { duration: 0.12 } });
  }

  const tones: Record<Tone, string> = {
    danger: "bg-rose-50 hover:bg-rose-50 text-rose-600 border-rose-200",
    primary: "bg-accent-50 hover:bg-accent-50 text-accent-700 border-accent-300",
  };
  const fills: Record<Tone, string> = { danger: "bg-rose-300/50", primary: "bg-accent-300/60" };
  const Icon = icon === "send" ? Send : Trash2;

  return (
    <button
      className={cn(
        "btn relative min-w-[10rem] overflow-hidden border touch-none select-none",
        tones[tone],
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      onMouseDown={start}
      onMouseUp={end}
      onMouseLeave={end}
      onTouchStart={start}
      onTouchEnd={end}
      onTouchCancel={end}
      disabled={disabled}
      {...props}
    >
      <motion.div initial={{ width: "0%" }} animate={controls} className={cn("absolute left-0 top-0 h-full", fills[tone])} />
      <span className="relative z-10 flex w-full items-center justify-center gap-2">
        {icon !== "none" && <Icon className="h-4 w-4" />}
        {isHolding ? holdingLabel : label}
      </span>
    </button>
  );
}
