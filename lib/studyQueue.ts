/**
 * Building a study session: which cards, in what order, and how each one is
 * asked. Pure, so the "no answers leave the server" rule can be tested.
 */
import { daysUntilExam } from "@/lib/examPlan";
import type { DifficultyTier, StudyMode } from "@/lib/leitner";
import {
  cardSourceHash,
  pickStatement,
  resolvePractice,
  type PracticeCard,
  type ResolvedPractice,
  type Sibling,
} from "@/lib/practice";
import type { DefaultMode } from "@/lib/settingsSchema";
import { localParts, startOfLocalDay, type Zone } from "@/lib/timezone";

export const MAX_SESSION = 25;

export interface QueueCard extends PracticeCard {
  deckId: unknown;
  currentQuestion: string;
  leitnerBox: number;
  difficultyTier: string;
  reviewCount?: number | null;
  latencyHistory?: number[] | null;
  nextReviewDate: Date;
  revealedAt?: Date | null;
  lastReviewedAt?: Date | null;
}

export interface QueueDeck {
  _id: unknown;
  title: string;
  examDate?: string | null;
}

/** What the learner sees before answering. Never the answer. */
export type StudyPrompt =
  | { kind: "open"; question: string }
  | { kind: "flip"; question: string }
  | { kind: "choice"; question: string; options: string[] }
  | { kind: "truefalse"; statement: string; statementId: string }
  | { kind: "cloze"; text: string };

export interface StudyItem {
  id: string;
  deckId: string;
  deckTitle: string;
  conceptTitle: string;
  box: number;
  tier: DifficultyTier;
  reviewCount: number;
  lastLatencyMs: number | null;
  mode: StudyMode;
  prompt: StudyPrompt;
  practiceVersion: string;
}

/** The answer was shown (Flip or Listen) but never rated: the card can only be rated now. */
export function revealedSinceReview(card: Pick<QueueCard, "revealedAt" | "lastReviewedAt">): boolean {
  if (!card.revealedAt) return false;
  return !card.lastReviewedAt || new Date(card.revealedAt).getTime() > new Date(card.lastReviewedAt).getTime();
}

export interface ModeContext {
  freeRecall: "write" | "voice";
  /** The browser can turn speech into text. */
  speech: boolean;
  practice: ResolvedPractice;
}

/** The mode a card is actually asked in, given what was requested and what the card supports. */
export function pickMode(requested: DefaultMode, card: QueueCard, ctx: ModeContext): StudyMode {
  if (revealedSinceReview(card)) return "flip";
  const freeRecall: StudyMode = ctx.freeRecall === "voice" && ctx.speech ? "voice" : "write";
  switch (requested) {
    case "auto":
      if (card.leitnerBox <= 1) return ctx.practice.choice ? "choice" : "flip";
      if (card.leitnerBox === 2) return ctx.practice.cloze ? "cloze" : "write";
      return freeRecall;
    case "choice":
      return ctx.practice.choice ? "choice" : "flip";
    case "truefalse":
      return ctx.practice.trueFalse ? "truefalse" : "flip";
    case "cloze":
      return ctx.practice.cloze ? "cloze" : "write";
    case "voice":
      return ctx.speech ? "voice" : "write";
    default:
      return requested;
  }
}

/**
 * Overdue cards first, then decks with an exam in the next week, then the
 * rest with decks taking turns (mixing topics helps more than blocking them).
 */
export function orderDue<C extends QueueCard>(cards: C[], decks: QueueDeck[], now: Date, zone: Zone): C[] {
  const todayStart = startOfLocalDay(localParts(now, zone).dateKey, zone).getTime();
  const examSoon = new Set(
    decks
      .filter((d) => {
        const days = daysUntilExam(d.examDate, now, zone);
        return days !== null && days >= 0 && days <= 7;
      })
      .map((d) => String(d._id)),
  );
  const byDate = [...cards].sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime());
  const overdue = byDate.filter((c) => new Date(c.nextReviewDate).getTime() < todayStart);
  const rest = byDate.filter((c) => new Date(c.nextReviewDate).getTime() >= todayStart);
  const soon = rest.filter((c) => examSoon.has(String(c.deckId)));

  const byDeck = new Map<string, C[]>();
  for (const c of rest) {
    if (examSoon.has(String(c.deckId))) continue;
    const key = String(c.deckId);
    byDeck.set(key, [...(byDeck.get(key) ?? []), c]);
  }
  const interleaved: C[] = [];
  const queues = [...byDeck.values()];
  while (queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) interleaved.push(next);
    }
  }
  return [...overdue, ...soon, ...interleaved];
}

export function teachQuestion(title: string): string {
  return `Explain ${title} to someone who has never heard of it.`;
}

export function buildPrompt(card: QueueCard, mode: StudyMode, practice: ResolvedPractice): StudyPrompt {
  switch (mode) {
    case "choice":
      if (practice.choice) return { kind: "choice", question: practice.choice.question, options: [...practice.choice.options] };
      break;
    case "truefalse":
      if (practice.trueFalse) return { kind: "truefalse", ...pickStatement(card, practice.trueFalse) };
      break;
    case "cloze":
      if (practice.cloze) return { kind: "cloze", text: practice.cloze.text };
      break;
    case "teach":
      return { kind: "open", question: teachQuestion(card.conceptTitle) };
    case "flip":
    case "listen":
      return { kind: "flip", question: card.currentQuestion };
  }
  return { kind: "open", question: card.currentQuestion };
}

/** Allow-listed fields only: no core fact, key points, answer index or cloze answers. */
export function toStudyItem(card: QueueCard, mode: StudyMode, practice: ResolvedPractice, deckTitle: string): StudyItem {
  const prompt = buildPrompt(card, mode, practice);
  return {
    id: String(card._id),
    deckId: String(card.deckId),
    deckTitle,
    conceptTitle: card.conceptTitle,
    box: card.leitnerBox,
    tier: (["recall", "application", "synthesis"].includes(card.difficultyTier) ? card.difficultyTier : "recall") as DifficultyTier,
    reviewCount: card.reviewCount ?? 0,
    lastLatencyMs: card.latencyHistory?.at(-1) ?? null,
    mode: prompt.kind === "open" && (mode === "choice" || mode === "truefalse" || mode === "cloze") ? "write" : mode,
    prompt,
    practiceVersion: `${practice.source === "stored" ? "s" : "h"}:${cardSourceHash(card)}`,
  };
}

/** Plan a whole session: order the due cards, pick each card's mode, and build its item. */
export function buildSession(
  cards: QueueCard[],
  decks: QueueDeck[],
  siblingsByDeck: Map<string, Sibling[]>,
  {
    requested,
    limit,
    now,
    zone,
    freeRecall,
    speech,
  }: { requested: DefaultMode; limit: number; now: Date; zone: Zone; freeRecall: "write" | "voice"; speech: boolean },
): StudyItem[] {
  const titles = new Map(decks.map((d) => [String(d._id), d.title]));
  return orderDue(cards, decks, now, zone)
    .slice(0, Math.max(0, Math.min(limit, MAX_SESSION)))
    .map((card) => {
      const siblings = (siblingsByDeck.get(String(card.deckId)) ?? []).filter((s) => s.conceptTitle !== card.conceptTitle);
      const practice = resolvePractice(card, siblings);
      const mode = pickMode(requested, card, { freeRecall, speech, practice });
      return toStudyItem(card, mode, practice, titles.get(String(card.deckId)) ?? "");
    });
}
