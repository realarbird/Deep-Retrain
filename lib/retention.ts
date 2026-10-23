/**
 * Forgetting-curve maths.
 *
 * Ebbinghaus-style exponential decay R(t) = e^(-t / S), where S is memory
 * stability in days. Each spaced review restores recall and multiplies S.
 */
import { clampBox } from "@/lib/leitner";
import { addDays, localParts, type Zone } from "@/lib/timezone";

export const CRAM_STABILITY_DAYS = 2;
export const SPACED_INITIAL_STABILITY_DAYS = 1.2;
export const STABILITY_GROWTH = 2.5;
/** Cumulative review days implied by Box intervals 1, 3, 7, 14, 30. */
export const SPACED_REVIEW_DAYS = [1, 4, 11, 25, 55];

export interface Exam {
  day: number;
  label: string;
}

/** A class exam on day 28, then the AP Exam on day 41. */
export const EXAMS: Exam[] = [
  { day: 28, label: "Exam" },
  { day: 41, label: "AP Exam" },
];

export interface CramSession {
  day: number;
  /** Recall right after the session, in percent. */
  peak: number;
}

/**
 * The crammer studies for the day 28 exam, then crams again on day 40, the
 * night before the AP Exam. That second burst only gets recall back to 25%.
 */
export const CRAM_SESSIONS: CramSession[] = [
  { day: 28, peak: 100 },
  { day: 40, peak: 25 },
];

/** Runs a day past the AP Exam, so its marker isn't on the chart's edge. */
export const RETENTION_CHART_DAYS = 42;

export function retentionAt(daysSince: number, stabilityDays: number): number {
  return Math.exp(-daysSince / stabilityDays);
}

/** Stability of a card in a Leitner box, on the same model as the landing chart: 1.2 days, ×2.5 per passed review. */
export function stabilityForBox(box: number): number {
  return SPACED_INITIAL_STABILITY_DAYS * STABILITY_GROWTH ** (clampBox(box) - 1);
}

export interface RecallCard {
  leitnerBox: number;
  lastReviewedAt?: Date | string | null;
  reviewCount?: number | null;
}

/** Estimated chance (0–1) of recalling a card at `at`. Null for a card that has never been reviewed. */
export function recallAt(card: RecallCard, at: Date): number | null {
  if (!card.reviewCount || !card.lastReviewedAt) return null;
  const days = Math.max(0, (at.getTime() - new Date(card.lastReviewedAt).getTime()) / 86_400_000);
  return retentionAt(days, stabilityForBox(card.leitnerBox));
}

export interface RetentionPoint {
  day: number;
  /** Null before the first cram session: nothing has been studied yet. */
  cramming: number | null;
  spaced: number;
}

/** Modeled recall of one concept: crammed in bursts before each exam, versus learned on day 0 and reviewed at the Leitner cadence. */
export function buildRetentionCurves(
  days = RETENTION_CHART_DAYS,
  cramSessions = CRAM_SESSIONS,
): { points: RetentionPoint[]; reviewDays: number[]; cramSessions: CramSession[]; exams: Exam[] } {
  const reviewDays = SPACED_REVIEW_DAYS.filter((d) => d <= days);
  const sessions = cramSessions.filter((s) => s.day <= days).sort((a, b) => a.day - b.day);
  const points: RetentionPoint[] = [];

  for (let day = 0; day <= days; day++) {
    let stability = SPACED_INITIAL_STABILITY_DAYS;
    let lastReview = 0;
    for (const r of reviewDays) {
      if (r <= day) {
        lastReview = r;
        stability *= STABILITY_GROWTH;
      }
    }

    // Each cram replaces what is left of the last one, which has faded to almost nothing by then.
    const cram = sessions.findLast((s) => s.day <= day);

    points.push({
      day,
      cramming: cram ? round1(cram.peak * retentionAt(day - cram.day, CRAM_STABILITY_DAYS)) : null,
      spaced: round1(retentionAt(day - lastReview, stability) * 100),
    });
  }

  return { points, reviewDays, cramSessions: sessions, exams: EXAMS.filter((e) => e.day <= days) };
}

export interface LatencyLog {
  reviewedAt: Date;
  responseLatencyMs: number;
}

export interface LatencyTrendPoint {
  date: string;
  avgSeconds: number | null;
  movingAvgSeconds: number | null;
  reviews: number;
}

/** Local calendar date (YYYY-MM-DD) for a JS `getTimezoneOffset()` value. */
export function localDateKey(date: Date, tzOffsetMinutes: number): string {
  return new Date(date.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export interface DailyAveragePoint {
  date: string;
  avg: number | null;
  movingAvg: number | null;
  count: number;
}

export interface TrendOptions {
  days?: number;
  now?: Date;
  tzOffsetMinutes?: number;
  /** Overrides `tzOffsetMinutes` when the learner's IANA zone is known. */
  zone?: Zone;
}

/**
 * Daily averages of one value per local day for the last `days` days, with a
 * 7-day trailing moving average of the daily averages (each study day counts once).
 */
export function dailyAverageTrend<T extends { reviewedAt: Date }>(
  logs: T[],
  valueOf: (log: T) => number | null,
  { days = 28, now = new Date(), tzOffsetMinutes = 0, zone }: TrendOptions = {},
): DailyAveragePoint[] {
  const z: Zone = zone ?? { name: null, offsetMinutes: tzOffsetMinutes };
  const buckets = new Map<string, { total: number; count: number }>();
  for (const log of logs) {
    const value = valueOf(log);
    if (value === null || !Number.isFinite(value)) continue;
    const key = localParts(new Date(log.reviewedAt), z).dateKey;
    const b = buckets.get(key) ?? { total: 0, count: 0 };
    b.total += value;
    b.count += 1;
    buckets.set(key, b);
  }

  const todayKey = localParts(now, z).dateKey;
  const series: DailyAveragePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(todayKey, -i);
    const b = buckets.get(key);
    series.push({ date: key, avg: b ? b.total / b.count : null, movingAvg: null, count: b?.count ?? 0 });
  }

  for (let i = 0; i < series.length; i++) {
    const window = series
      .slice(Math.max(0, i - 6), i + 1)
      .map((p) => p.avg)
      .filter((v): v is number => v !== null);
    series[i].movingAvg = window.length ? window.reduce((a, b) => a + b, 0) / window.length : null;
  }
  return series;
}

export function buildLatencyTrend(logs: LatencyLog[], options: TrendOptions = {}): LatencyTrendPoint[] {
  return dailyAverageTrend(logs, (l) => l.responseLatencyMs / 1000, { days: 28, ...options }).map((p) => ({
    date: p.date,
    avgSeconds: p.avg === null ? null : round1(p.avg),
    movingAvgSeconds: p.movingAvg === null ? null : round1(p.movingAvg),
    reviews: p.count,
  }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
