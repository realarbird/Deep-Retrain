/**
 * Leitner spaced-repetition rules for DeepRetain.
 *
 * Accuracy decides whether a memory holds; response latency decides whether
 * it holds *fluently*. Only fast + accurate recall earns a promotion.
 */

export type DifficultyTier = "recall" | "application" | "synthesis";
export type ReviewOutcome = "promote" | "hesitation" | "reset";

/** Review interval in days for Leitner Boxes 1–5. */
export const BOX_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;
export const MIN_BOX = 1;
export const MAX_BOX = 5;

/** Answers at or above this latency count as hesitation. */
export const LATENCY_THRESHOLD_MS = 12_000;
/** Scores at or above this percentage count as accurate. */
export const ACCURACY_THRESHOLD = 80;

const DAY_MS = 24 * 60 * 60 * 1000;

export function clampBox(box: number): number {
  if (!Number.isFinite(box)) return MIN_BOX;
  return Math.min(MAX_BOX, Math.max(MIN_BOX, Math.round(box)));
}

export function intervalForBox(box: number): number {
  return BOX_INTERVALS_DAYS[clampBox(box) - 1];
}

export function tierForBox(box: number): DifficultyTier {
  const b = clampBox(box);
  if (b === 1) return "recall";
  if (b === 2) return "application";
  return "synthesis";
}

/** The tier a card would move to if it were promoted from `box`. */
export function nextTier(box: number): DifficultyTier {
  return tierForBox(clampBox(box) + 1);
}

export interface OutcomeInput {
  score: number;
  latencyMs: number;
  box: number;
  now?: Date;
}

export interface OutcomeResult {
  outcome: ReviewOutcome;
  newBox: number;
  nextReviewDate: Date;
  difficultyTier: DifficultyTier;
  intervalDays: number;
  isAccurate: boolean;
  isFast: boolean;
}

export function decideOutcome({ score, latencyMs, box, now = new Date() }: OutcomeInput): OutcomeResult {
  const currentBox = clampBox(box);
  const isAccurate = score >= ACCURACY_THRESHOLD;
  const isFast = latencyMs < LATENCY_THRESHOLD_MS;

  let outcome: ReviewOutcome;
  let newBox: number;
  if (!isAccurate) {
    outcome = "reset";
    newBox = MIN_BOX;
  } else if (isFast) {
    outcome = "promote";
    newBox = clampBox(currentBox + 1);
  } else {
    outcome = "hesitation";
    newBox = currentBox;
  }

  const intervalDays = intervalForBox(newBox);
  return {
    outcome,
    newBox,
    nextReviewDate: new Date(now.getTime() + intervalDays * DAY_MS),
    difficultyTier: tierForBox(newBox),
    intervalDays,
    isAccurate,
    isFast,
  };
}

export const TIER_LABELS: Record<DifficultyTier, string> = {
  recall: "Recall",
  application: "Application",
  synthesis: "Synthesis",
};
