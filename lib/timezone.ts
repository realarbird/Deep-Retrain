/**
 * The learner's local calendar, on the server.
 *
 * The browser sends both its IANA zone name (e.g. "America/New_York") and its
 * current UTC offset. The name gets daylight saving right for dates in the
 * past; the offset is the fallback when the name is missing or unknown.
 */

export interface Zone {
  /** A validated IANA zone name, or null to use the fixed offset. */
  name: string | null;
  /** `Date.prototype.getTimezoneOffset()` value: minutes behind UTC (UTC-7 => 420). */
  offsetMinutes: number;
}

export interface LocalParts {
  /** YYYY-MM-DD */
  dateKey: string;
  /** 0–23 */
  hour: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const DAY_MS = 86_400_000;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(name: string): Intl.DateTimeFormat | null {
  const hit = formatters.get(name);
  if (hit) return hit;
  try {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: name,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    if (formatters.size > 200) formatters.clear();
    formatters.set(name, f);
    return f;
  } catch {
    return null;
  }
}

export function sanitizeOffset(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-840, Math.min(840, Math.round(n)));
}

export function resolveZone(name: string | null | undefined, offsetMinutes: unknown): Zone {
  const trimmed = typeof name === "string" ? name.trim().slice(0, 64) : "";
  const valid = trimmed && /^[A-Za-z0-9_+\-/]+$/.test(trimmed) && formatterFor(trimmed) ? trimmed : null;
  return { name: valid, offsetMinutes: sanitizeOffset(offsetMinutes) };
}

export function localParts(date: Date, zone: Zone): LocalParts {
  const f = zone.name ? formatterFor(zone.name) : null;
  if (f) {
    const parts: Record<string, string> = {};
    for (const p of f.formatToParts(date)) parts[p.type] = p.value;
    return {
      dateKey: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour) % 24,
      weekday: WEEKDAYS[parts.weekday] ?? 0,
    };
  }
  const shifted = new Date(date.getTime() - zone.offsetMinutes * 60_000);
  return { dateKey: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours(), weekday: shifted.getUTCDay() };
}

export function zoneDateKey(date: Date, zone: Zone): string {
  return localParts(date, zone).dateKey;
}

/** Calendar arithmetic on YYYY-MM-DD keys, independent of daylight saving. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

/** Weekday (0 = Sunday) of a YYYY-MM-DD key. */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The UTC instant at which a local calendar day starts. Uses the zone name when
 * there is one (searching around the fixed-offset guess for the first instant
 * of that day), otherwise the fixed offset.
 */
export function startOfLocalDay(dateKey: string, zone: Zone): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d) + zone.offsetMinutes * 60_000;
  if (!zone.name) return new Date(guess);
  // Daylight saving moves midnight by at most a few hours either way.
  for (let deltaMin = -180; deltaMin <= 180; deltaMin += 30) {
    const t = guess + deltaMin * 60_000;
    if (localParts(new Date(t), zone).dateKey === dateKey && localParts(new Date(t - 30 * 60_000), zone).dateKey !== dateKey) {
      return new Date(t);
    }
  }
  return new Date(guess);
}

export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
