import { describe, expect, it } from "vitest";
import {
  ACCURACY_THRESHOLD,
  BOX_INTERVALS_DAYS,
  LATENCY_THRESHOLD_MS,
  decideOutcome,
  intervalForBox,
  nextTier,
  tierForBox,
} from "@/lib/leitner";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("Leitner constants", () => {
  it("uses the 1/3/7/14/30 day schedule", () => {
    expect(BOX_INTERVALS_DAYS).toEqual([1, 3, 7, 14, 30]);
    expect(LATENCY_THRESHOLD_MS).toBe(12_000);
    expect(ACCURACY_THRESHOLD).toBe(80);
  });

  it("maps each box to its interval", () => {
    expect([1, 2, 3, 4, 5].map(intervalForBox)).toEqual([1, 3, 7, 14, 30]);
  });
});

describe("tierForBox", () => {
  it("escalates recall -> application -> synthesis", () => {
    expect(tierForBox(1)).toBe("recall");
    expect(tierForBox(2)).toBe("application");
    expect(tierForBox(3)).toBe("synthesis");
    expect(tierForBox(4)).toBe("synthesis");
    expect(tierForBox(5)).toBe("synthesis");
  });

  it("nextTier gives the tier a promotion would land on", () => {
    expect(nextTier(1)).toBe("application");
    expect(nextTier(2)).toBe("synthesis");
    expect(nextTier(5)).toBe("synthesis");
  });
});

describe("decideOutcome", () => {
  it("promotes fast and accurate answers one box with the new box's interval", () => {
    const r = decideOutcome({ score: 92, latencyMs: 6_000, box: 2, now: NOW });
    expect(r.outcome).toBe("promote");
    expect(r.newBox).toBe(3);
    expect(r.difficultyTier).toBe("synthesis");
    expect(r.nextReviewDate.getTime()).toBe(NOW.getTime() + 7 * DAY);
  });

  it("keeps Box 5 at Box 5 with a 30 day interval", () => {
    const r = decideOutcome({ score: 100, latencyMs: 2_000, box: 5, now: NOW });
    expect(r.outcome).toBe("promote");
    expect(r.newBox).toBe(5);
    expect(r.nextReviewDate.getTime()).toBe(NOW.getTime() + 30 * DAY);
  });

  it("treats exactly 80% as accurate", () => {
    expect(decideOutcome({ score: 80, latencyMs: 1_000, box: 1, now: NOW }).outcome).toBe("promote");
  });

  it("flags slow but accurate answers as hesitation and keeps the box", () => {
    const r = decideOutcome({ score: 85, latencyMs: 15_000, box: 3, now: NOW });
    expect(r.outcome).toBe("hesitation");
    expect(r.newBox).toBe(3);
    expect(r.difficultyTier).toBe("synthesis");
    expect(r.nextReviewDate.getTime()).toBe(NOW.getTime() + 7 * DAY);
  });

  it("treats exactly 12s as slow", () => {
    expect(decideOutcome({ score: 90, latencyMs: 12_000, box: 1, now: NOW }).outcome).toBe("hesitation");
  });

  it("resets inaccurate answers to Box 1 regardless of speed", () => {
    for (const latencyMs of [2_000, 30_000]) {
      const r = decideOutcome({ score: 79, latencyMs, box: 4, now: NOW });
      expect(r.outcome).toBe("reset");
      expect(r.newBox).toBe(1);
      expect(r.difficultyTier).toBe("recall");
      expect(r.nextReviewDate.getTime()).toBe(NOW.getTime() + 1 * DAY);
    }
  });

  it("clamps out-of-range boxes and scores", () => {
    expect(decideOutcome({ score: 140, latencyMs: 1_000, box: 9, now: NOW }).newBox).toBe(5);
    expect(decideOutcome({ score: -5, latencyMs: 1_000, box: 0, now: NOW }).newBox).toBe(1);
  });
});
