/**
 * Shared domain types for RoleCall AI v2 (sales-enablement).
 * Mirrors convex/schema.ts. Prefer the generated Doc/Id types where possible.
 */
import type { Doc, Id } from "../../convex/_generated/dataModel";

export type Difficulty = "easy" | "medium" | "hard" | "brutal";

export const DIFFICULTIES: { value: Difficulty; label: string; blurb: string }[] = [
  { value: "easy", label: "Easy", blurb: "Warm, agreeable. Few objections." },
  { value: "medium", label: "Medium", blurb: "Realistic. Pushes back on price & timing." },
  { value: "hard", label: "Hard", blurb: "Skeptical. Makes the rep earn it." },
  { value: "brutal", label: "Brutal", blurb: "Cold, impatient, ready to hang up." },
];

export type Scenario = {
  buyerName: string;
  buyerTitle: string;
  company: string;
  personality: string;
  objections: string[];
  difficulty: Difficulty;
};

export type RubricCriterion = { name: string; weight: number; description: string };
export type RubricScore = { name: string; weight: number; score: number; note: string };
export type CallAnalytics = {
  talkRatio: number;
  fillerCount: number;
  wordsPerMin: number;
  questionsAsked: number;
  longestMonologueSec: number;
};

export type ModuleDraft = {
  title: string;
  description: string;
  goal?: string;
  scenario: Scenario;
  objectives: string[];
  rubric?: RubricCriterion[];
  voiceId?: string;
};

export type Module = Doc<"modules">;
export type Attempt = Doc<"attempts">;
export type Assignment = Doc<"assignments">;
export type Interview = Doc<"interviews">;
export type Suggestion = Doc<"suggestions">;
export type AppUser = Doc<"users">;

export type Role = "rep" | "manager";

export type ObjectiveHit = { objective: string; met: boolean; note: string };
export type ScoreMoment = { timestamp: string; label: string; line: string; tone: "good" | "bad" | "neutral" };

export type { Id };
