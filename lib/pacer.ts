/**
 * Anti-cramming pacer: a daily cognitive cap on micro-reviews.
 * Pure helpers live here; the DB count lives in `countReviewsToday`.
 */

export const DEFAULT_DAILY_CAP = 15;

export function dailyCap(): number {
  const n = Number.parseInt(process.env.DAILY_COGNITIVE_CAP ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
}

/**
 * Bounds of the user's local calendar day, expressed as UTC instants.
 * `tzOffsetMinutes` follows `Date.prototype.getTimezoneOffset()` (UTC-7 => 420).
 */
export function localDayBounds(now: Date, tzOffsetMinutes: number): { start: Date; end: Date } {
  const offsetMs = tzOffsetMinutes * 60_000;
  const local = new Date(now.getTime() - offsetMs);
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(localMidnight + offsetMs);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export interface CapStatus {
  used: number;
  limit: number;
  remaining: number;
  reached: boolean;
  resetsAt: string;
}

export function capStatus(used: number, limit: number, resetsAt: Date): CapStatus {
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    reached: used >= limit,
    resetsAt: resetsAt.toISOString(),
  };
}

export function sanitizeTzOffset(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-840, Math.min(840, Math.round(n)));
}
