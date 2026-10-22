import { describe, expect, it } from "vitest";
import { buildLatencyTrend, buildRetentionCurves, retentionAt } from "@/lib/retention";

describe("retentionAt", () => {
  it("is 100% at t=0 and decays exponentially", () => {
    expect(retentionAt(0, 2)).toBeCloseTo(1);
    expect(retentionAt(2, 2)).toBeCloseTo(Math.exp(-1));
  });
});

describe("buildRetentionCurves", () => {
  const curves = buildRetentionCurves();

  it("returns one point per day across six weeks, including day 0", () => {
    expect(curves.points).toHaveLength(43);
    expect(curves.points[0]).toMatchObject({ day: 0, spaced: 100 });
  });

  it("marks review days at the Leitner cadence", () => {
    expect(curves.reviewDays).toEqual([1, 4, 11, 25]);
  });

  it("has nothing to recall before the day 28 cram session", () => {
    expect(curves.cramDay).toBe(28);
    expect(curves.points.slice(0, 28).every((p) => p.cramming === null)).toBe(true);
    expect(curves.points[28].cramming).toBe(100);
  });

  it("lets the cram fade within a week while spaced recall holds", () => {
    expect(curves.points[35].cramming).toBeLessThan(5);
    expect(curves.points[42].spaced).toBeGreaterThan(60);
  });

  it("restores retention to 100% on review days", () => {
    for (const d of curves.reviewDays) {
      expect(curves.points[d].spaced).toBe(100);
    }
  });
});

describe("buildLatencyTrend", () => {
  const now = new Date("2026-10-21T12:00:00.000Z");

  it("averages latency per day and adds a 7 day moving average", () => {
    const logs = [
      { reviewedAt: new Date("2026-10-20T09:00:00Z"), responseLatencyMs: 10_000 },
      { reviewedAt: new Date("2026-10-20T10:00:00Z"), responseLatencyMs: 20_000 },
      { reviewedAt: new Date("2026-10-21T08:00:00Z"), responseLatencyMs: 6_000 },
    ];
    const trend = buildLatencyTrend(logs, { days: 3, now, tzOffsetMinutes: 0 });
    expect(trend).toHaveLength(3);
    expect(trend[0]).toMatchObject({ date: "2026-10-19", avgSeconds: null });
    expect(trend[1]).toMatchObject({ date: "2026-10-20", avgSeconds: 15, reviews: 2 });
    expect(trend[2]).toMatchObject({ date: "2026-10-21", avgSeconds: 6, reviews: 1 });
    expect(trend[2].movingAvgSeconds).toBeCloseTo(10.5);
  });

  it("buckets by the user's local day", () => {
    // 01:00 UTC on the 21st is still the 20th in UTC-5 (offset +300 minutes, JS convention)
    const logs = [{ reviewedAt: new Date("2026-10-21T01:00:00Z"), responseLatencyMs: 8_000 }];
    const trend = buildLatencyTrend(logs, { days: 2, now, tzOffsetMinutes: 300 });
    expect(trend.find((p) => p.date === "2026-10-20")?.reviews).toBe(1);
  });
});
