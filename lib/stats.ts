/**
 * Study statistics. Pure functions over review logs and cards, so every
 * number on the Stats tab can be tested without a database.
 */
import { deckReadiness, daysUntilExam, forecastDue, type ForecastDay, type Readiness } from "@/lib/examPlan";
import { ACCURACY_THRESHOLD, MODE_RULES, STUDY_MODES, type StudyMode } from "@/lib/leitner";
import { dailyAverageTrend, recallAt, type DailyAveragePoint } from "@/lib/retention";
import { addDays, daysBetween, localParts, startOfLocalDay, weekdayOf, type Zone } from "@/lib/timezone";

const DAY_MS = 86_400_000;
/** A gap longer than this starts a new study session. */
const SESSION_GAP_MS = 30 * 60_000;
export const CALENDAR_WEEKS = 26;

/**
 * Current and longest run of consecutive study days. Today counts if you've
 * studied; if not, the current streak is still alive from yesterday.
 */
export function streaks(studyDays: Set<string>, todayKey: string): { current: number; longest: number } {
  let current = 0;
  for (let d = studyDays.has(todayKey) ? 0 : 1; studyDays.has(addDays(todayKey, -d)); d++) current++;

  let longest = 0;
  for (const day of studyDays) {
    if (studyDays.has(addDays(day, -1))) continue; // not the start of a run
    let run = 1;
    while (studyDays.has(addDays(day, run))) run++;
    longest = Math.max(longest, run);
  }
  return { current, longest: Math.max(longest, current) };
}

export interface StatLog {
  reviewedAt: Date;
  score: number;
  responseLatencyMs: number;
  /** The time the card allowed. Older logs have none. */
  latencyThresholdMs?: number | null;
  outcome: string;
  boxBefore: number;
  mode?: string | null;
  confidence?: number | null;
  thinkMs?: number | null;
  device?: { kind?: string | null; label?: string | null } | null;
  capLimit?: number | null;
  simulated?: boolean | null;
  cardId?: unknown;
  deckId?: unknown;
}

export interface StatCard {
  _id: unknown;
  deckId: unknown;
  conceptTitle: string;
  leitnerBox: number;
  nextReviewDate: Date;
  lastReviewedAt?: Date | null;
  reviewCount?: number | null;
  lapses?: number | null;
  lastScore?: number | null;
  latencyHistory?: number[] | null;
  createdAt?: Date | null;
  suspended?: boolean | null;
}

export interface StatDeck {
  _id: unknown;
  title: string;
  examDate?: string | null;
  examLabel?: string | null;
}

export interface StatsInput {
  logs: StatLog[];
  cards: StatCard[];
  decks: StatDeck[];
  now: Date;
  zone: Zone;
  /** Today's daily cap. */
  cap: number;
  usedToday: number;
  rangeDays: number;
}

const passed = (log: StatLog) => log.score >= ACCURACY_THRESHOLD;
const modeOf = (log: StatLog): StudyMode => (STUDY_MODES as readonly string[]).includes(log.mode ?? "") ? (log.mode as StudyMode) : "write";
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
/** The time the card allowed: its own, or for older logs the mode's base. Null when the mode sets its own pace. */
const allowedMs = (log: StatLog): number | null => log.latencyThresholdMs ?? MODE_RULES[modeOf(log)].latencyMs;

// ── Calendar ─────────────────────────────────────────────────────────────

export interface CalendarDay {
  date: string;
  count: number;
  /** 0 none · 1 under a quarter of the cap · 2 under half · 3 under the cap · 4 cap reached */
  level: 0 | 1 | 2 | 3 | 4;
}

/** 26 full weeks ending this week, Sunday first, with each day's count binned against the cap. */
export function buildCalendar(logs: StatLog[], { now, zone, cap }: { now: Date; zone: Zone; cap: number }): CalendarDay[] {
  const today = localParts(now, zone).dateKey;
  const start = addDays(today, -(7 * (CALENDAR_WEEKS - 1) + weekdayOf(today)));
  const counts = new Map<string, number>();
  for (const l of logs) {
    const key = localParts(l.reviewedAt, zone).dateKey;
    if (key >= start && key <= today) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days: CalendarDay[] = [];
  for (let key = start; key <= today; key = addDays(key, 1)) {
    const count = counts.get(key) ?? 0;
    const share = cap ? count / cap : 0;
    const level = count === 0 ? 0 : share >= 1 ? 4 : share >= 0.5 ? 3 : share >= 0.25 ? 2 : 1;
    days.push({ date: key, count, level });
  }
  return days;
}

// ── Habits ───────────────────────────────────────────────────────────────

export interface OutcomeWeek {
  /** First day of the 7-day window. */
  week: string;
  promote: number;
  hesitation: number;
  reset: number;
}

/** Rolling 7-day windows ending today, oldest first. */
export function outcomesByWeek(logs: StatLog[], { now, zone, weeks }: { now: Date; zone: Zone; weeks: number }): OutcomeWeek[] {
  const today = localParts(now, zone).dateKey;
  const out: OutcomeWeek[] = Array.from({ length: weeks }, (_, i) => ({
    week: addDays(today, -(7 * (weeks - i) - 1)),
    promote: 0,
    hesitation: 0,
    reset: 0,
  }));
  for (const l of logs) {
    const ago = daysBetween(localParts(l.reviewedAt, zone).dateKey, today);
    const index = weeks - 1 - Math.floor(ago / 7);
    if (index < 0 || index >= weeks) continue;
    if (l.outcome === "promote" || l.outcome === "hesitation" || l.outcome === "reset") out[index][l.outcome]++;
  }
  return out;
}

export interface PunchCell {
  weekday: number;
  hour: number;
  count: number;
}

export function punchCard(logs: StatLog[], zone: Zone): PunchCell[] {
  const grid = Array.from({ length: 7 * 24 }, (_, i) => ({ weekday: Math.floor(i / 24), hour: i % 24, count: 0 }));
  for (const l of logs) {
    const { weekday, hour } = localParts(l.reviewedAt, zone);
    grid[weekday * 24 + hour].count++;
  }
  return grid;
}

export interface HourRow {
  hour: number;
  reviews: number;
  avgScore: number | null;
}

export function byHour(logs: StatLog[], zone: Zone): HourRow[] {
  const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, scores: [] as number[] }));
  for (const l of logs) rows[localParts(l.reviewedAt, zone).hour].scores.push(l.score);
  return rows.map(({ hour, scores }) => ({ hour, reviews: scores.length, avgScore: scores.length ? Math.round(mean(scores)!) : null }));
}

export interface WeekdayRow {
  weekday: number;
  reviews: number;
  avgScore: number | null;
}

export function byWeekday(logs: StatLog[], zone: Zone): WeekdayRow[] {
  const rows = Array.from({ length: 7 }, (_, weekday) => ({ weekday, scores: [] as number[] }));
  for (const l of logs) rows[localParts(l.reviewedAt, zone).weekday].scores.push(l.score);
  return rows.map(({ weekday, scores }) => ({ weekday, reviews: scores.length, avgScore: scores.length ? Math.round(mean(scores)!) : null }));
}

export interface ModeRow {
  mode: StudyMode;
  reviews: number;
  /** Share of answers scoring 80 or more. */
  accuracy: number | null;
  avgSeconds: number | null;
  /** Share of answers inside their card's time. */
  inTime: number | null;
}

/** How often answers came in under their card's time, and how much time cards allowed on average. Listen is left out. */
export function timeKept(logs: StatLog[]): { inTime: number | null; avgAllowedSeconds: number | null } {
  const timed = logs.flatMap((l) => {
    const allowed = allowedMs(l);
    return allowed === null ? [] : [{ allowed, inTime: l.responseLatencyMs < allowed }];
  });
  return {
    inTime: pct(timed.filter((t) => t.inTime).length, timed.length),
    avgAllowedSeconds: round1(mean(timed.map((t) => t.allowed / 1000))),
  };
}

export function byMode(logs: StatLog[]): ModeRow[] {
  const rows = new Map<StudyMode, StatLog[]>();
  for (const l of logs) rows.set(modeOf(l), [...(rows.get(modeOf(l)) ?? []), l]);
  return STUDY_MODES.filter((m) => rows.has(m))
    .map((mode) => {
      const ls = rows.get(mode)!;
      return {
        mode,
        reviews: ls.length,
        accuracy: pct(ls.filter(passed).length, ls.length),
        avgSeconds: round1(mean(ls.map((l) => l.responseLatencyMs / 1000))),
        inTime: timeKept(ls).inTime,
      };
    })
    .sort((a, b) => b.reviews - a.reviews);
}

export interface DeviceRow {
  label: string;
  kind: string;
  reviews: number;
  lastAt: string;
}

export function byDevice(logs: StatLog[]): DeviceRow[] {
  const rows = new Map<string, DeviceRow>();
  for (const l of logs) {
    const label = l.device?.label || "Unknown";
    const row = rows.get(label) ?? { label, kind: l.device?.kind || "unknown", reviews: 0, lastAt: l.reviewedAt.toISOString() };
    row.reviews++;
    if (l.reviewedAt.toISOString() > row.lastAt) row.lastAt = l.reviewedAt.toISOString();
    rows.set(label, row);
  }
  return [...rows.values()].sort((a, b) => b.reviews - a.reviews);
}

export interface BoxPassRow {
  box: number;
  reviews: number;
  passRate: number | null;
}

/** How often answers pass, by the box the card was in. Tells you whether the intervals are about right. */
export function passByBox(logs: StatLog[]): BoxPassRow[] {
  return [1, 2, 3, 4, 5].map((box) => {
    const ls = logs.filter((l) => l.boxBefore === box);
    return { box, reviews: ls.length, passRate: pct(ls.filter(passed).length, ls.length) };
  });
}

export interface CalibrationRow {
  confidence: 1 | 2 | 3;
  reviews: number;
  accuracy: number | null;
}

/** "Guessing", "unsure" and "sure" against how often those answers were right. */
export function calibration(logs: StatLog[]): CalibrationRow[] {
  return ([1, 2, 3] as const).map((confidence) => {
    const ls = logs.filter((l) => l.confidence === confidence);
    return { confidence, reviews: ls.length, accuracy: pct(ls.filter(passed).length, ls.length) };
  });
}

export function thinkingTime(logs: StatLog[]): { thinkSeconds: number; typeSeconds: number; samples: number } | null {
  const ls = logs.filter((l) => typeof l.thinkMs === "number" && l.thinkMs >= 0 && l.thinkMs <= l.responseLatencyMs);
  if (!ls.length) return null;
  return {
    thinkSeconds: round1(mean(ls.map((l) => l.thinkMs! / 1000)))!,
    typeSeconds: round1(mean(ls.map((l) => (l.responseLatencyMs - l.thinkMs!) / 1000)))!,
    samples: ls.length,
  };
}

export function sessions(logs: StatLog[]): { count: number; avgMinutes: number | null } {
  const times = logs.map((l) => ({ at: l.reviewedAt.getTime(), ms: l.responseLatencyMs })).sort((a, b) => a.at - b.at);
  const spans: number[] = [];
  let current = 0;
  let last = -Infinity;
  for (const t of times) {
    if (t.at - last > SESSION_GAP_MS && current) {
      spans.push(current);
      current = 0;
    }
    current += t.ms;
    last = t.at;
  }
  if (current) spans.push(current);
  return { count: spans.length, avgMinutes: spans.length ? round1(mean(spans)! / 60_000) : null };
}

/** Days the daily cap was reached, using the cap that was in force that day. */
export function capHitDays(logs: StatLog[], zone: Zone, fallbackCap: number): number {
  const days = new Map<string, { count: number; limit: number }>();
  for (const l of logs) {
    if (l.simulated) continue;
    const key = localParts(l.reviewedAt, zone).dateKey;
    const day = days.get(key) ?? { count: 0, limit: 0 };
    day.count++;
    day.limit = Math.max(day.limit, l.capLimit ?? 0);
    days.set(key, day);
  }
  return [...days.values()].filter((d) => d.count >= (d.limit || fallbackCap)).length;
}

// ── Memory ───────────────────────────────────────────────────────────────

export interface Maturity {
  new: number;
  learning: number;
  young: number;
  mature: number;
  suspended: number;
}

export function maturity(cards: StatCard[]): Maturity {
  const m: Maturity = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
  for (const c of cards) {
    if (c.suspended) m.suspended++;
    else if (!c.reviewCount) m.new++;
    else if (c.leitnerBox <= 2) m.learning++;
    else if (c.leitnerBox <= 4) m.young++;
    else m.mature++;
  }
  return m;
}

export interface RecallSummary {
  /** Average estimated recall right now, 0–100, over reviewed cards. */
  average: number | null;
  strong: number;
  fading: number;
  weak: number;
  unseen: number;
  /** Ten bins of estimated recall: 0–10%, …, 90–100%. */
  histogram: { from: number; to: number; count: number }[];
}

export function recallSummary(cards: StatCard[], now: Date): RecallSummary {
  const histogram = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: 0 }));
  const values: number[] = [];
  let unseen = 0;
  for (const c of cards) {
    if (c.suspended) continue;
    const r = recallAt(c, now);
    if (r === null) {
      unseen++;
      continue;
    }
    values.push(r);
    histogram[Math.min(9, Math.floor(r * 10))].count++;
  }
  return {
    average: values.length ? Math.round(mean(values)! * 100) : null,
    strong: values.filter((v) => v >= 0.8).length,
    fading: values.filter((v) => v >= 0.5 && v < 0.8).length,
    weak: values.filter((v) => v < 0.5).length,
    unseen,
    histogram,
  };
}

export interface Ledger {
  reviewsDone: number;
  /** What re-reading every card once a day, from the day you added it, would have taken. */
  rereadReviews: number;
  reviewsSkipped: number;
  avgSecondsPerReview: number | null;
  minutesSaved: number;
}

/** The "laziness ledger": reviews you didn't have to do because the schedule knew you knew them. */
export function lazinessLedger(cards: StatCard[], logs: StatLog[], { now, zone, rangeDays }: { now: Date; zone: Zone; rangeDays: number }): Ledger {
  const today = localParts(now, zone).dateKey;
  const firstSeen = new Map<string, Date>();
  for (const l of logs) {
    const id = String(l.cardId ?? "");
    if (!id) continue;
    const seen = firstSeen.get(id);
    if (!seen || l.reviewedAt < seen) firstSeen.set(id, l.reviewedAt);
  }
  let reread = 0;
  for (const c of cards) {
    if (c.suspended) continue;
    const created = [c.createdAt, firstSeen.get(String(c._id))].filter((d): d is Date => d instanceof Date);
    const start = created.length ? new Date(Math.min(...created.map((d) => d.getTime()))) : now;
    reread += Math.min(rangeDays, Math.max(1, daysBetween(localParts(start, zone).dateKey, today) + 1));
  }
  const avgSeconds = mean(logs.map((l) => l.responseLatencyMs / 1000));
  const skipped = Math.max(0, reread - logs.length);
  return {
    reviewsDone: logs.length,
    rereadReviews: reread,
    reviewsSkipped: skipped,
    avgSecondsPerReview: round1(avgSeconds),
    minutesSaved: avgSeconds === null ? 0 : Math.round((skipped * avgSeconds) / 60),
  };
}

export interface CardRow {
  id: string;
  title: string;
  deckTitle: string;
  box: number;
}

export function leeches(cards: StatCard[], deckTitles: Map<string, string>, limit = 5): (CardRow & { lapses: number; lastScore: number | null })[] {
  return cards
    .filter((c) => !c.suspended && (c.lapses ?? 0) >= 2)
    .sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0) || (a.lastScore ?? 0) - (b.lastScore ?? 0))
    .slice(0, limit)
    .map((c) => ({
      id: String(c._id),
      title: c.conceptTitle,
      deckTitle: deckTitles.get(String(c.deckId)) ?? "",
      box: c.leitnerBox,
      lapses: c.lapses ?? 0,
      lastScore: c.lastScore ?? null,
    }));
}

export function mostImproved(cards: StatCard[], deckTitles: Map<string, string>, limit = 5): (CardRow & { fromSeconds: number; toSeconds: number })[] {
  return cards
    .filter((c) => !c.suspended && (c.latencyHistory?.length ?? 0) >= 4)
    .map((c) => {
      const h = c.latencyHistory!;
      return { c, from: mean(h.slice(0, 2))! / 1000, to: mean(h.slice(-2))! / 1000 };
    })
    .filter((x) => x.from - x.to >= 1)
    .sort((a, b) => b.from - b.to - (a.from - a.to))
    .slice(0, limit)
    .map(({ c, from, to }) => ({
      id: String(c._id),
      title: c.conceptTitle,
      deckTitle: deckTitles.get(String(c.deckId)) ?? "",
      box: c.leitnerBox,
      fromSeconds: round1(from)!,
      toSeconds: round1(to)!,
    }));
}

export interface DeckRow {
  id: string;
  title: string;
  cards: number;
  due: number;
  mastered: number;
  avgScore: number | null;
  avgSeconds: number | null;
  recall: number | null;
  lastStudied: string | null;
  examDate: string | null;
  examLabel: string;
  daysLeft: number | null;
  readiness: Readiness | null;
}

export function deckTable(decks: StatDeck[], cards: StatCard[], logs: StatLog[], { now, zone }: { now: Date; zone: Zone }): DeckRow[] {
  return decks.map((d) => {
    const id = String(d._id);
    const own = cards.filter((c) => String(c.deckId) === id && !c.suspended);
    const ls = logs.filter((l) => String(l.deckId) === id);
    const recalls = own.map((c) => recallAt(c, now)).filter((r): r is number => r !== null);
    const daysLeft = daysUntilExam(d.examDate, now, zone);
    const last = ls.reduce<Date | null>((m, l) => (!m || l.reviewedAt > m ? l.reviewedAt : m), null);
    return {
      id,
      title: d.title,
      cards: own.length,
      due: own.filter((c) => c.nextReviewDate.getTime() <= now.getTime()).length,
      mastered: own.filter((c) => c.leitnerBox === 5).length,
      avgScore: ls.length ? Math.round(mean(ls.map((l) => l.score))!) : null,
      avgSeconds: round1(mean(ls.map((l) => l.responseLatencyMs / 1000))),
      recall: recalls.length ? Math.round(mean(recalls)! * 100) : null,
      lastStudied: last ? last.toISOString() : null,
      examDate: d.examDate ?? null,
      examLabel: d.examLabel ?? "",
      daysLeft,
      readiness: daysLeft !== null && daysLeft >= 0 && d.examDate ? deckReadiness(own, startOfLocalDay(d.examDate, zone), now) : null,
    };
  });
}

// ── Everything ──────────────────────────────────────────────────────────

export interface Stats {
  range: { days: number; from: string; to: string };
  summary: {
    reviews: number;
    accuracy: number | null;
    avgScore: number | null;
    avgSeconds: number | null;
    /** Share of timed answers inside their card's time. */
    inTime: number | null;
    avgAllowedSeconds: number | null;
    studyDays: number;
    streak: number;
    longestStreak: number;
    minutes: number;
    sessions: number;
    avgSessionMinutes: number | null;
    capHitDays: number;
    includesSimulated: boolean;
  };
  calendar: CalendarDay[];
  accuracyTrend: DailyAveragePoint[];
  latencyTrend: DailyAveragePoint[];
  outcomesByWeek: OutcomeWeek[];
  punchCard: PunchCell[];
  byHour: HourRow[];
  byWeekday: WeekdayRow[];
  byMode: ModeRow[];
  byDevice: DeviceRow[];
  passByBox: BoxPassRow[];
  calibration: CalibrationRow[];
  thinking: ReturnType<typeof thinkingTime>;
  forecast: ForecastDay[];
  maturity: Maturity;
  recall: RecallSummary;
  ledger: Ledger;
  leeches: ReturnType<typeof leeches>;
  improved: ReturnType<typeof mostImproved>;
  decks: DeckRow[];
}

export function buildStats({ logs, cards, decks, now, zone, cap, usedToday, rangeDays }: StatsInput): Stats {
  const today = localParts(now, zone).dateKey;
  const from = addDays(today, -(rangeDays - 1));
  const rangeStart = startOfLocalDay(from, zone).getTime();
  const inRange = logs.filter((l) => l.reviewedAt.getTime() >= rangeStart);
  const deckTitles = new Map(decks.map((d) => [String(d._id), d.title]));
  const studyDays = new Set(logs.map((l) => localParts(l.reviewedAt, zone).dateKey));
  const { current, longest } = streaks(studyDays, today);
  const trendDays = Math.min(rangeDays, 90);
  const s = sessions(inRange);

  return {
    range: { days: rangeDays, from, to: today },
    summary: {
      reviews: inRange.length,
      accuracy: pct(inRange.filter(passed).length, inRange.length),
      avgScore: inRange.length ? Math.round(mean(inRange.map((l) => l.score))!) : null,
      avgSeconds: round1(mean(inRange.map((l) => l.responseLatencyMs / 1000))),
      ...timeKept(inRange),
      studyDays: new Set(inRange.map((l) => localParts(l.reviewedAt, zone).dateKey)).size,
      streak: current,
      longestStreak: longest,
      minutes: Math.round(inRange.reduce((sum, l) => sum + l.responseLatencyMs, 0) / 60_000),
      sessions: s.count,
      avgSessionMinutes: s.avgMinutes,
      capHitDays: capHitDays(inRange, zone, cap),
      includesSimulated: inRange.some((l) => l.simulated),
    },
    calendar: buildCalendar(logs, { now, zone, cap }),
    accuracyTrend: dailyAverageTrend(inRange, (l) => l.score, { days: trendDays, now, zone }),
    latencyTrend: dailyAverageTrend(inRange, (l) => l.responseLatencyMs / 1000, { days: trendDays, now, zone }),
    outcomesByWeek: outcomesByWeek(inRange, { now, zone, weeks: Math.max(1, Math.min(12, Math.ceil(rangeDays / 7))) }),
    punchCard: punchCard(inRange, zone),
    byHour: byHour(inRange, zone),
    byWeekday: byWeekday(inRange, zone),
    byMode: byMode(inRange),
    byDevice: byDevice(inRange),
    passByBox: passByBox(inRange),
    calibration: calibration(inRange),
    thinking: thinkingTime(inRange.filter((l) => modeOf(l) === "write" || modeOf(l) === "teach")),
    forecast: forecastDue(
      cards.filter((c) => !c.suspended).map((c) => c.nextReviewDate),
      { days: 14, now, zone, cap, usedToday },
    ),
    maturity: maturity(cards),
    recall: recallSummary(cards, now),
    ledger: lazinessLedger(cards, inRange, { now, zone, rangeDays }),
    leeches: leeches(cards, deckTitles),
    improved: mostImproved(cards, deckTitles),
    decks: deckTable(decks, cards, inRange, { now, zone }),
  };
}

export const RANGE_CHOICES = [30, 90, 365] as const;
export type RangeChoice = (typeof RANGE_CHOICES)[number];

export function parseRange(value: string | null): RangeChoice {
  const n = Number(value);
  return (RANGE_CHOICES as readonly number[]).includes(n) ? (n as RangeChoice) : 30;
}

export const STATS_HISTORY_MS = 366 * DAY_MS;
