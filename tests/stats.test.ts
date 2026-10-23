import { describe, expect, it } from "vitest";
import { recallAt, retentionAt, stabilityForBox } from "@/lib/retention";
import {
  buildCalendar,
  buildStats,
  byDevice,
  byHour,
  byMode,
  capHitDays,
  lazinessLedger,
  maturity,
  punchCard,
  sessions,
  streaks,
  timeKept,
  type StatCard,
  type StatLog,
} from "@/lib/stats";
import { localParts, resolveZone, startOfLocalDay } from "@/lib/timezone";

const NY = resolveZone("America/New_York", 240);
const KOLKATA = resolveZone("Asia/Kolkata", -330);
const UTC = resolveZone("UTC", 0);
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

function log(at: string | Date, over: Partial<StatLog> = {}): StatLog {
  return { reviewedAt: new Date(at), score: 90, responseLatencyMs: 6_000, outcome: "promote", boxBefore: 1, ...over };
}

describe("time zones", () => {
  it("buckets by the learner's local day and hour across the daylight-saving change", () => {
    // 2026-11-01 is the fall-back day in New York: 01:30 happens twice.
    const first = new Date("2026-11-01T05:30:00Z"); // 01:30 EDT
    const second = new Date("2026-11-01T06:30:00Z"); // 01:30 EST
    expect(localParts(first, NY)).toMatchObject({ dateKey: "2026-11-01", hour: 1, weekday: 0 });
    expect(localParts(second, NY)).toMatchObject({ dateKey: "2026-11-01", hour: 1 });
    // A fixed offset would put the second one at 02:30.
    expect(localParts(second, { name: null, offsetMinutes: 240 }).hour).toBe(2);
    expect(startOfLocalDay("2026-11-02", NY).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(startOfLocalDay("2026-10-31", NY).toISOString()).toBe("2026-10-31T04:00:00.000Z");
  });

  it("handles half-hour zones", () => {
    const late = new Date("2026-10-22T19:00:00Z"); // 00:30 on the 23rd in India
    expect(localParts(late, KOLKATA)).toMatchObject({ dateKey: "2026-10-23", hour: 0 });
    const rows = byHour([log(late)], KOLKATA);
    expect(rows[0].reviews).toBe(1);
  });

  it("falls back to the offset for an unknown zone name", () => {
    expect(resolveZone("Mars/Olympus_Mons", 300)).toEqual({ name: null, offsetMinutes: 300 });
    expect(resolveZone("<script>", 0).name).toBeNull();
  });
});

describe("streaks", () => {
  it("counts the current run (alive from yesterday) and the longest", () => {
    const days = new Set(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-21", "2026-10-22"]);
    expect(streaks(days, "2026-10-23")).toEqual({ current: 2, longest: 4 });
    expect(streaks(new Set(["2026-10-23"]), "2026-10-23")).toEqual({ current: 1, longest: 1 });
    expect(streaks(new Set(["2026-10-20"]), "2026-10-23").current).toBe(0);
  });

  it("isn't limited to a few weeks", () => {
    const days = new Set(Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 7, 25) + i * D).toISOString().slice(0, 10)));
    expect(streaks(days, "2026-10-23").current).toBe(60);
  });
});

describe("calendar", () => {
  it("covers 26 full weeks starting on a Sunday, binned against the cap", () => {
    const now = new Date("2026-10-23T15:00:00Z"); // a Friday
    const logs = [...Array.from({ length: 15 }, () => log("2026-10-22T15:00:00Z")), log("2026-10-21T15:00:00Z"), ...Array.from({ length: 5 }, () => log("2026-10-20T15:00:00Z"))];
    const cal = buildCalendar(logs, { now, zone: UTC, cap: 15 });
    expect(cal).toHaveLength(7 * 25 + 6);
    expect(new Date(`${cal[0].date}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(cal.at(-1)?.date).toBe("2026-10-23");
    const byDate = new Map(cal.map((d) => [d.date, d]));
    expect(byDate.get("2026-10-22")).toMatchObject({ count: 15, level: 4 });
    expect(byDate.get("2026-10-21")).toMatchObject({ count: 1, level: 1 });
    expect(byDate.get("2026-10-20")).toMatchObject({ count: 5, level: 2 });
  });
});

describe("habits", () => {
  it("splits sessions on 30-minute gaps", () => {
    const s = sessions([log("2026-10-23T10:00:00Z"), log("2026-10-23T10:05:00Z"), log("2026-10-23T11:00:00Z")]);
    expect(s).toEqual({ count: 2, avgMinutes: 0.2 });
  });

  it("treats older logs without a mode as Write and without a device as Unknown", () => {
    expect(byMode([log("2026-10-23T10:00:00Z")])[0]).toMatchObject({ mode: "write", reviews: 1, accuracy: 100 });
    expect(byDevice([log("2026-10-23T10:00:00Z")])[0]).toMatchObject({ label: "Unknown", reviews: 1 });
  });

  it("counts answers in time against each card's own time, and the mode's base time for older logs", () => {
    const logs = [
      log("2026-10-23T10:00:00Z", { latencyThresholdMs: 30_000, responseLatencyMs: 25_000 }),
      // At the card's time counts as slow, the same as when it was marked.
      log("2026-10-23T10:01:00Z", { latencyThresholdMs: 30_000, responseLatencyMs: 30_000 }),
      // Logged before cards had their own time: Write's base 12 seconds.
      log("2026-10-23T10:02:00Z", { responseLatencyMs: 10_000 }),
      // Listen sets its own pace, so it's left out.
      log("2026-10-23T10:03:00Z", { mode: "listen", latencyThresholdMs: null, responseLatencyMs: 90_000 }),
    ];
    expect(timeKept(logs)).toEqual({ inTime: 67, avgAllowedSeconds: 24 });
    expect(byMode(logs).find((m) => m.mode === "write")).toMatchObject({ reviews: 3, inTime: 67 });
    expect(byMode(logs).find((m) => m.mode === "listen")).toMatchObject({ reviews: 1, inTime: null });
  });

  it("fills a 7 by 24 punch card", () => {
    const grid = punchCard([log("2026-10-23T15:00:00Z")], UTC);
    expect(grid).toHaveLength(168);
    expect(grid.find((c) => c.count)).toEqual({ weekday: 5, hour: 15, count: 1 });
  });

  it("counts cap days with the cap in force that day, skipping simulated history", () => {
    const day1 = Array.from({ length: 10 }, () => log("2026-10-21T12:00:00Z", { capLimit: 10 }));
    const day2 = Array.from({ length: 10 }, () => log("2026-10-22T12:00:00Z", { capLimit: 15 }));
    const fake = Array.from({ length: 20 }, () => log("2026-10-20T12:00:00Z", { simulated: true }));
    expect(capHitDays([...day1, ...day2, ...fake], UTC, 15)).toBe(1);
  });
});

describe("memory", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const cards: StatCard[] = [
    { _id: "a", deckId: "d", conceptTitle: "A", leitnerBox: 1, nextReviewDate: now, reviewCount: 0 },
    { _id: "b", deckId: "d", conceptTitle: "B", leitnerBox: 2, nextReviewDate: now, reviewCount: 3, lastReviewedAt: new Date(now.getTime() - D) },
    { _id: "c", deckId: "d", conceptTitle: "C", leitnerBox: 5, nextReviewDate: now, reviewCount: 9, lastReviewedAt: new Date(now.getTime() - 2 * D) },
    { _id: "e", deckId: "d", conceptTitle: "E", leitnerBox: 3, nextReviewDate: now, reviewCount: 4, suspended: true },
  ];

  it("sorts cards into new, learning, young and mature", () => {
    expect(maturity(cards)).toEqual({ new: 1, learning: 1, young: 0, mature: 1, suspended: 1 });
  });

  it("estimates recall with the same model as the landing chart", () => {
    expect(recallAt(cards[1], now)).toBeCloseTo(retentionAt(1, stabilityForBox(2)));
    expect(stabilityForBox(1)).toBeCloseTo(1.2);
    expect(stabilityForBox(3)).toBeCloseTo(7.5);
    expect(recallAt(cards[0], now)).toBeNull();
  });

  it("works out the reviews a daily re-read would have cost", () => {
    const created = new Date(now.getTime() - 9 * D);
    const ledger = lazinessLedger(
      [{ ...cards[1], createdAt: created }, { ...cards[2], createdAt: created }],
      [log(now, { responseLatencyMs: 6_000 }), log(now, { responseLatencyMs: 6_000 })],
      { now, zone: UTC, rangeDays: 30 },
    );
    expect(ledger).toMatchObject({ reviewsDone: 2, rereadReviews: 20, reviewsSkipped: 18, avgSecondsPerReview: 6, minutesSaved: 2 });
  });
});

describe("buildStats", () => {
  it("builds every section for a range and leaves older logs out of range totals", () => {
    const now = new Date("2026-10-23T15:00:00Z");
    const cards: StatCard[] = [
      { _id: "a", deckId: "d1", conceptTitle: "A", leitnerBox: 2, nextReviewDate: new Date(now.getTime() + D), reviewCount: 4, lapses: 3, lastScore: 40, latencyHistory: [20_000, 18_000, 9_000, 7_000], lastReviewedAt: now },
    ];
    const logs = [
      log("2026-10-23T14:00:00Z", { cardId: "a", deckId: "d1", mode: "choice", confidence: 3, device: { kind: "phone", label: "Safari on iPhone" } }),
      log("2026-10-22T14:00:00Z", { cardId: "a", deckId: "d1", score: 50, outcome: "reset", confidence: 1, thinkMs: 2_000 }),
      log("2026-06-01T14:00:00Z", { cardId: "a", deckId: "d1" }),
    ];
    const stats = buildStats({
      logs,
      cards,
      decks: [{ _id: "d1", title: "Deck", examDate: "2026-11-02" }],
      now,
      zone: UTC,
      cap: 15,
      usedToday: 1,
      rangeDays: 30,
    });
    expect(stats.summary).toMatchObject({ reviews: 2, accuracy: 50, studyDays: 2, streak: 2, inTime: 100, avgAllowedSeconds: 10 });
    expect(stats.calibration.find((c) => c.confidence === 3)).toMatchObject({ reviews: 1, accuracy: 100 });
    expect(stats.byMode.map((m) => m.mode).sort()).toEqual(["choice", "write"]);
    expect(stats.thinking).toEqual({ thinkSeconds: 2, typeSeconds: 4, samples: 1 });
    expect(stats.forecast).toHaveLength(14);
    expect(stats.leeches[0]).toMatchObject({ id: "a", lapses: 3, deckTitle: "Deck" });
    expect(stats.improved[0]).toMatchObject({ id: "a", fromSeconds: 19, toSeconds: 8 });
    expect(stats.decks[0]).toMatchObject({ title: "Deck", daysLeft: 10 });
    expect(stats.decks[0].readiness).not.toBeNull();
    expect(stats.outcomesByWeek.reduce((s, w) => s + w.promote + w.reset, 0)).toBe(2);
  });
});
