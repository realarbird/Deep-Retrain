/** The card shape the Cards tab works with. Your own cards, so answers included. */
import { recallAt } from "@/lib/retention";

export interface CardRowSource {
  _id: unknown;
  deckId: unknown;
  conceptTitle: string;
  coreFact: string;
  expectedKeyPoints: string[];
  currentQuestion: string;
  leitnerBox: number;
  difficultyTier: string;
  nextReviewDate: Date;
  lastReviewedAt?: Date | null;
  reviewCount?: number | null;
  lapses?: number | null;
  lastScore?: number | null;
  suspended?: boolean | null;
}

export interface CardRow {
  id: string;
  deckId: string;
  conceptTitle: string;
  question: string;
  coreFact: string;
  expectedKeyPoints: string[];
  box: number;
  tier: string;
  nextReviewDate: string;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapses: number;
  lastScore: number | null;
  suspended: boolean;
  /** Estimated recall right now, 0–100, or null if never reviewed. */
  recall: number | null;
}

export function toCardRow(c: CardRowSource, now = new Date()): CardRow {
  const recall = recallAt(c, now);
  return {
    id: String(c._id),
    deckId: String(c.deckId),
    conceptTitle: c.conceptTitle,
    question: c.currentQuestion,
    coreFact: c.coreFact,
    expectedKeyPoints: [...c.expectedKeyPoints],
    box: c.leitnerBox,
    tier: c.difficultyTier,
    nextReviewDate: new Date(c.nextReviewDate).toISOString(),
    lastReviewedAt: c.lastReviewedAt ? new Date(c.lastReviewedAt).toISOString() : null,
    reviewCount: c.reviewCount ?? 0,
    lapses: c.lapses ?? 0,
    lastScore: c.lastScore ?? null,
    suspended: Boolean(c.suspended),
    recall: recall === null ? null : Math.round(recall * 100),
  };
}
