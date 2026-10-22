/**
 * Forgetting-curve maths.
 *
 * Ebbinghaus-style exponential decay R(t) = e^(-t / S), where S is memory
 * stability in days. Each spaced review restores recall and multiplies S.
 */

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

export function buildLatencyTrend(
  logs: LatencyLog[],
  { days = 28, now = new Date(), tzOffsetMinutes = 0 }: { days?: number; now?: Date; tzOffsetMinutes?: number } = {},
): LatencyTrendPoint[] {
  const buckets = new Map<string, { total: number; count: number }>();
  for (const log of logs) {
    const key = localDateKey(new Date(log.reviewedAt), tzOffsetMinutes);
    const b = buckets.get(key) ?? { total: 0, count: 0 };
    b.total += log.responseLatencyMs;
    b.count += 1;
    buckets.set(key, b);
  }

  const todayKey = localDateKey(now, tzOffsetMinutes);
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const series: LatencyTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const b = buckets.get(key);
    series.push({
      date: key,
      avgSeconds: b ? round1(b.total / b.count / 1000) : null,
      movingAvgSeconds: null,
      reviews: b?.count ?? 0,
    });
  }

  // 7-day trailing moving average of the daily averages (each study day counts once).
  for (let i = 0; i < series.length; i++) {
    const window = series
      .slice(Math.max(0, i - 6), i + 1)
      .map((p) => p.avgSeconds)
      .filter((v): v is number => v !== null);
    series[i].movingAvgSeconds = window.length
      ? round1(window.reduce((a, b) => a + b, 0) / window.length)
      : null;
  }

  return series;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
