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

describe("study modes", () => {
  it("gives every mode a threshold, a top box and a grader", async () => {
    const { MODE_RULES, STUDY_MODES } = await import("@/lib/leitner");
    for (const mode of STUDY_MODES) {
      expect(MODE_RULES[mode].topBox).toBeGreaterThanOrEqual(3);
      expect(["model", "answer-key", "self"]).toContain(MODE_RULES[mode].grader);
    }
    expect(MODE_RULES.write.latencyMs).toBe(LATENCY_THRESHOLD_MS);
    expect(MODE_RULES.voice.latencyMs).toBe(15_000);
    expect(MODE_RULES.listen.latencyMs).toBeNull();
  });

  it("only lets answers Gemma grades reach box 5", async () => {
    const { MODE_RULES, STUDY_MODES } = await import("@/lib/leitner");
    const toFive = STUDY_MODES.filter((m) => MODE_RULES[m].topBox === 5);
    expect(toFive.sort()).toEqual(["teach", "voice", "write"]);
    expect(toFive.every((m) => MODE_RULES[m].grader === "model")).toBe(true);
  });

  it("stops recognition modes at box 3 without moving the card down", () => {
    const atTwo = decideOutcome({ score: 100, latencyMs: 2_000, box: 2, now: NOW, mode: "choice" });
    expect(atTwo).toMatchObject({ outcome: "promote", newBox: 3, boxCapped: false });

    const atThree = decideOutcome({ score: 100, latencyMs: 2_000, box: 3, now: NOW, mode: "choice" });
    expect(atThree).toMatchObject({ outcome: "promote", newBox: 3, boxCapped: true, intervalDays: 7 });

    const atFour = decideOutcome({ score: 100, latencyMs: 2_000, box: 4, now: NOW, mode: "truefalse" });
    expect(atFour).toMatchObject({ newBox: 4, boxCapped: true });
  });

  it("uses each mode's own speed threshold", () => {
    expect(decideOutcome({ score: 90, latencyMs: 7_000, box: 1, now: NOW, mode: "truefalse" }).outcome).toBe("hesitation");
    expect(decideOutcome({ score: 90, latencyMs: 7_000, box: 1, now: NOW, mode: "choice" }).outcome).toBe("promote");
    expect(decideOutcome({ score: 90, latencyMs: 14_000, box: 1, now: NOW, mode: "voice" }).outcome).toBe("promote");
    expect(decideOutcome({ score: 90, latencyMs: 80_000, box: 1, now: NOW, mode: "teach" }).outcome).toBe("promote");
    // Listen paces itself, so time never counts against it.
    expect(decideOutcome({ score: 90, latencyMs: 120_000, box: 1, now: NOW, mode: "listen" }).outcome).toBe("promote");
  });

  it("maps self-ratings to scores, and Hard never counts as fluent", async () => {
    const { selfRatingScore } = await import("@/lib/leitner");
    expect(selfRatingScore("again")).toEqual({ score: 20, forceHesitation: false });
    expect(selfRatingScore("easy")).toEqual({ score: 100, forceHesitation: false });
    const hard = selfRatingScore("hard");
    const r = decideOutcome({ score: hard.score, latencyMs: 1_000, box: 2, now: NOW, mode: "flip", forceHesitation: hard.forceHesitation });
    expect(r).toMatchObject({ outcome: "hesitation", newBox: 2 });
    expect(decideOutcome({ score: 20, latencyMs: 1_000, box: 3, now: NOW, mode: "flip" }).newBox).toBe(1);
  });

  it("uses the card's own time when it has one", () => {
    expect(decideOutcome({ score: 90, latencyMs: 20_000, box: 2, now: NOW }).outcome).toBe("hesitation");
    const r = decideOutcome({ score: 90, latencyMs: 20_000, box: 2, now: NOW, latencyThresholdMs: 31_000 });
    expect(r).toMatchObject({ outcome: "promote", newBox: 3, isFast: true, latencyThresholdMs: 31_000 });
    expect(decideOutcome({ score: 90, latencyMs: 31_000, box: 2, now: NOW, latencyThresholdMs: 31_000 }).outcome).toBe("hesitation");
    // Null means no limit, the way Listen works.
    expect(decideOutcome({ score: 90, latencyMs: 200_000, box: 1, now: NOW, latencyThresholdMs: null }).outcome).toBe("promote");
  });

  it("defaults to write so existing callers keep their behavior", () => {
    const r = decideOutcome({ score: 92, latencyMs: 6_000, box: 4, now: NOW });
    expect(r).toMatchObject({ outcome: "promote", newBox: 5, boxCapped: false, latencyThresholdMs: 12_000 });
  });
});
