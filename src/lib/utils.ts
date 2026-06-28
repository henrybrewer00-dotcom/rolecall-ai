import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 0..100 score → tailwind text color. */
export function scoreColor(score: number): string {
  if (score >= 80) return "text-accent-600";
  if (score >= 70) return "text-accent-500";
  if (score >= 50) return "text-amber-500";
  return "text-rose-500";
}

export function scoreStroke(score: number): string {
  if (score >= 80) return "stroke-accent-500";
  if (score >= 70) return "stroke-accent-400";
  if (score >= 50) return "stroke-amber-400";
  return "stroke-rose-400";
}

export function difficultyClasses(d: string): string {
  switch (d) {
    case "easy": return "text-accent-700 bg-accent-100 border-accent-300/60";
    case "medium": return "text-violet-600 bg-violet-100 border-violet-300/60";
    case "hard": return "text-amber-600 bg-amber-100 border-amber-300/60";
    case "brutal": return "text-rose-600 bg-rose-100 border-rose-300/60";
    default: return "text-ink-600 bg-white/60 border-white/60";
  }
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
