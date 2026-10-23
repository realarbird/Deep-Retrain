/**
 * Exam planner: spread the last reviews over the days before a test instead
 * of letting a long interval carry a card past it, and say honestly whether
 * the daily cap leaves room for all of them.
 */
import { clampBox } from "@/lib/leitner";
import { recallAt, retentionAt, stabilityForBox, type RecallCard } from "@/lib/retention";
import { addDays, daysBetween, isDateKey, localParts, startOfLocalDay, type Zone } from "@/lib/timezone";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Closer than this, reviews keep their own dates: pulling them in would bring cards back every day. */
export const EXAM_PULL_MIN_DAYS = 3;
/** Never schedule a pulled review sooner than this. */
const MIN_GAP_MS = 12 * HOUR_MS;

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface ExamWindowInput {
  next: Date;
  examDate: string | null | undefined;
  now: Date;
  zone: Zone;
  cardId: string;
}

/**
 * Move a review that would land on or after exam day to one of the last three
 * days before it (picked by card, so they don't all pile onto one day).
 */
export function applyExamWindow({ next, examDate, now, zone, cardId }: ExamWindowInput): { date: Date; adjusted: boolean } {
  if (!isDateKey(examDate)) return { date: next, adjusted: false };
  const examStart = startOfLocalDay(examDate, zone);
  const daysLeft = (examStart.getTime() - now.getTime()) / DAY_MS;
  if (daysLeft <= EXAM_PULL_MIN_DAYS || next.getTime() < examStart.getTime()) return { date: next, adjusted: false };

  const daysBefore = 1 + (hash(cardId) % 3);
  const target = startOfLocalDay(addDays(examDate, -daysBefore), zone);
  return { date: new Date(Math.max(target.getTime(), now.getTime() + MIN_GAP_MS)), adjusted: true };
}

export interface ForecastDay {
  date: string;
  /** Cards that come due on this day (overdue cards count on day 0). */
  due: number;
  /** Cards left over from earlier days because the cap was full. */
  carried: number;
  /** What fits under the cap on this day. */
  scheduled: number;
  /** What doesn't fit, and rolls to the next day. */
  overflow: number;
  capacity: number;
}

/**
 * Due cards per local day for the next `days` days. Each day takes at most the
 * daily cap (today: whatever is left of it); the rest rolls over.
 */
export function forecastDue(
  dueDates: Date[],
  { days, now, zone, cap, usedToday }: { days: number; now: Date; zone: Zone; cap: number; usedToday: number },
): ForecastDay[] {
  const today = localParts(now, zone).dateKey;
  const counts = new Map<string, number>();
  for (const d of dueDates) {
    const key = d.getTime() <= now.getTime() ? today : localParts(d, zone).dateKey;
    if (key < today) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out: ForecastDay[] = [];
  let carry = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const due = counts.get(date) ?? 0;
    const capacity = i === 0 ? Math.max(0, cap - usedToday) : cap;
    const total = carry + due;
    const scheduled = Math.min(total, capacity);
    out.push({ date, due, carried: carry, scheduled, overflow: total - scheduled, capacity });
    carry = total - scheduled;
  }
  return out;
}

export interface ReadinessCard extends RecallCard {
  nextReviewDate: Date | string;
}

export interface Readiness {
  /** Average estimated recall on exam morning if the scheduled reviews before it all pass. */
  keepUp: number;
  /** Average estimated recall on exam morning if you stop studying today. */
  stopToday: number;
  cards: number;
}

/**
 * Two honest numbers for an exam: what recall looks like if you keep up, and
 * if you stop today. Cards never reviewed count as 0 when you stop.
 */
export function deckReadiness(cards: ReadinessCard[], examAt: Date, now: Date): Readiness | null {
  if (!cards.length) return null;
  let keepUp = 0;
  let stopToday = 0;
  for (const card of cards) {
    const idle = recallAt(card, examAt) ?? 0;
    stopToday += idle;

    const due = new Date(card.nextReviewDate);
    const reviewAt = new Date(Math.max(due.getTime(), now.getTime()));
    if (reviewAt.getTime() < examAt.getTime()) {
      // Assume the review passes: one box up, recall restarts from that day.
      const box = clampBox(card.reviewCount ? card.leitnerBox + 1 : 2);
      keepUp += retentionAt((examAt.getTime() - reviewAt.getTime()) / DAY_MS, stabilityForBox(box));
    } else {
      keepUp += idle;
    }
  }
  return { keepUp: keepUp / cards.length, stopToday: stopToday / cards.length, cards: cards.length };
}

/** Whole local days from today until the exam (0 = today), or null if there's no valid date. */
export function daysUntilExam(examDate: string | null | undefined, now: Date, zone: Zone): number | null {
  if (!isDateKey(examDate)) return null;
  return daysBetween(localParts(now, zone).dateKey, examDate);
}
