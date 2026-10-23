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

/** Write's base time. Answers at or above a card's time count as hesitation; harder and longer cards get more. */
export const LATENCY_THRESHOLD_MS = 12_000;
/** Scores at or above this percentage count as accurate. */
export const ACCURACY_THRESHOLD = 80;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every way of answering a card. Each one is graded, moves the card, and counts toward the daily cap. */
export const STUDY_MODES = ["write", "voice", "teach", "flip", "listen", "choice", "truefalse", "cloze"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

/** Who decides the score: Gemma, a stored answer key, or the learner's own rating. */
export type Grader = "model" | "answer-key" | "self";

export interface ModeRule {
  /**
   * The base time: answers at or above it count as hesitation. A card gets more on top for a harder
   * question, more to read or a longer answer (lib/answerTime.ts). Null when the mode sets its own pace (Listen).
   */
  latencyMs: number | null;
  /** The highest box this mode can promote a card into. Box 5 always takes an answer Gemma grades. */
  topBox: number;
  grader: Grader;
}

export const MODE_RULES: Record<StudyMode, ModeRule> = {
  write: { latencyMs: LATENCY_THRESHOLD_MS, topBox: MAX_BOX, grader: "model" },
  // The browser needs a second or two to notice you've stopped talking.
  voice: { latencyMs: 15_000, topBox: MAX_BOX, grader: "model" },
  teach: { latencyMs: 90_000, topBox: MAX_BOX, grader: "model" },
  flip: { latencyMs: 8_000, topBox: 4, grader: "self" },
  listen: { latencyMs: null, topBox: 4, grader: "self" },
  // Recognising an answer is easier than recalling it, so these stop at box 3.
  choice: { latencyMs: 8_000, topBox: 3, grader: "answer-key" },
  truefalse: { latencyMs: 6_000, topBox: 3, grader: "answer-key" },
  cloze: { latencyMs: 10_000, topBox: 4, grader: "answer-key" },
};

export function isStudyMode(value: unknown): value is StudyMode {
  return typeof value === "string" && (STUDY_MODES as readonly string[]).includes(value);
}

export const SELF_RATINGS = ["again", "hard", "good", "easy"] as const;
export type SelfRating = (typeof SELF_RATINGS)[number];

/** Flip and Listen ratings as scores. "Hard" passes but never counts as fluent. */
export function selfRatingScore(rating: SelfRating): { score: number; forceHesitation: boolean } {
  switch (rating) {
    case "again":
      return { score: 20, forceHesitation: false };
    case "hard":
      return { score: 80, forceHesitation: true };
    case "good":
      return { score: 90, forceHesitation: false };
    case "easy":
      return { score: 100, forceHesitation: false };
  }
}

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
  mode?: StudyMode;
  /** This card's time (lib/answerTime.ts). Left out, the mode's base time applies; null means no limit. */
  latencyThresholdMs?: number | null;
  /** Count the answer as slow whatever the stopwatch says (a "Hard" self-rating). */
  forceHesitation?: boolean;
}

export interface OutcomeResult {
  outcome: ReviewOutcome;
  newBox: number;
  nextReviewDate: Date;
  difficultyTier: DifficultyTier;
  intervalDays: number;
  isAccurate: boolean;
  isFast: boolean;
  /** A fluent pass that stayed put because the mode's top box was reached. */
  boxCapped: boolean;
  latencyThresholdMs: number | null;
}

export function decideOutcome({
  score,
  latencyMs,
  box,
  now = new Date(),
  mode = "write",
  latencyThresholdMs,
  forceHesitation = false,
}: OutcomeInput): OutcomeResult {
  const rule = MODE_RULES[mode];
  const threshold = latencyThresholdMs === undefined ? rule.latencyMs : latencyThresholdMs;
  const currentBox = clampBox(box);
  const isAccurate = score >= ACCURACY_THRESHOLD;
  const isFast = !forceHesitation && (threshold === null || latencyMs < threshold);

  let outcome: ReviewOutcome;
  let newBox: number;
  let boxCapped = false;
  if (!isAccurate) {
    outcome = "reset";
    newBox = MIN_BOX;
  } else if (isFast) {
    outcome = "promote";
    const target = clampBox(currentBox + 1);
    // A correct answer never moves a card down, even in a mode with a lower ceiling.
    newBox = Math.min(target, Math.max(currentBox, rule.topBox));
    boxCapped = newBox < target;
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
    boxCapped,
    latencyThresholdMs: threshold,
  };
}

export const TIER_LABELS: Record<DifficultyTier, string> = {
  recall: "Recall",
  application: "Application",
  synthesis: "Synthesis",
};
