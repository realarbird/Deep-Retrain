import { describe, expect, it } from "vitest";
import { applyExamWindow, daysUntilExam, deckReadiness, forecastDue } from "@/lib/examPlan";

const ZONE = { name: null, offsetMinutes: 0 };
const NOW = new Date("2026-10-23T12:00:00.000Z");
const D = 86_400_000;

describe("applyExamWindow", () => {
  it("pulls a review that would land after the exam into the last three days before it", () => {
    const next = new Date(NOW.getTime() + 30 * D);
    for (const cardId of ["a", "b", "c", "d", "e", "f"]) {
      const r = applyExamWindow({ next, examDate: "2026-11-02", now: NOW, zone: ZONE, cardId });
      expect(r.adjusted).toBe(true);
      const examStart = Date.parse("2026-11-02T00:00:00Z");
      expect(r.date.getTime()).toBeLessThan(examStart);
      expect(r.date.getTime()).toBeGreaterThanOrEqual(examStart - 3 * D);
    }
  });

  it("leaves reviews alone before the exam, close to the exam, or without one", () => {
    const soon = new Date(NOW.getTime() + 2 * D);
    expect(applyExamWindow({ next: soon, examDate: "2026-11-02", now: NOW, zone: ZONE, cardId: "a" }).adjusted).toBe(false);
    const late = new Date(NOW.getTime() + 30 * D);
    expect(applyExamWindow({ next: late, examDate: "2026-10-25", now: NOW, zone: ZONE, cardId: "a" }).adjusted).toBe(false);
    expect(applyExamWindow({ next: late, examDate: null, now: NOW, zone: ZONE, cardId: "a" }).adjusted).toBe(false);
    expect(applyExamWindow({ next: late, examDate: "2026-13-40", now: NOW, zone: ZONE, cardId: "a" }).adjusted).toBe(false);
  });

  it("never schedules a pulled review sooner than 12 hours away", () => {
    const now = new Date("2026-10-29T20:00:00.000Z"); // exam 3.2 days away
    const r = applyExamWindow({ next: new Date(now.getTime() + 14 * D), examDate: "2026-11-02", now, zone: ZONE, cardId: "c" });
    expect(r.date.getTime()).toBeGreaterThanOrEqual(now.getTime() + 12 * 3_600_000);
  });
});

describe("forecastDue", () => {
  it("rolls what doesn't fit under the cap into the next day", () => {
    const overdue = Array.from({ length: 20 }, () => new Date(NOW.getTime() - D));
    const tomorrow = Array.from({ length: 4 }, () => new Date(NOW.getTime() + D));
    const days = forecastDue([...overdue, ...tomorrow], { days: 3, now: NOW, zone: ZONE, cap: 15, usedToday: 5 });
    expect(days[0]).toMatchObject({ date: "2026-10-23", due: 20, capacity: 10, scheduled: 10, overflow: 10 });
    expect(days[1]).toMatchObject({ date: "2026-10-24", due: 4, carried: 10, scheduled: 14, overflow: 0 });
    expect(days[2]).toMatchObject({ due: 0, carried: 0, scheduled: 0 });
  });
});

describe("deckReadiness", () => {
  it("gives a higher number for keeping up than for stopping today", () => {
    const examAt = new Date("2026-11-02T00:00:00Z");
    const cards = [
      { leitnerBox: 3, reviewCount: 4, lastReviewedAt: new Date(NOW.getTime() - 2 * D), nextReviewDate: new Date(NOW.getTime() + 5 * D) },
      { leitnerBox: 1, reviewCount: 0, lastReviewedAt: null, nextReviewDate: NOW },
    ];
    const r = deckReadiness(cards, examAt, NOW)!;
    expect(r.cards).toBe(2);
    expect(r.keepUp).toBeGreaterThan(r.stopToday);
    expect(r.stopToday).toBeLessThan(0.5); // the unseen card counts as nothing
    expect(deckReadiness([], examAt, NOW)).toBeNull();
  });
});

describe("daysUntilExam", () => {
  it("counts local calendar days", () => {
    expect(daysUntilExam("2026-10-23", NOW, ZONE)).toBe(0);
    expect(daysUntilExam("2026-11-02", NOW, ZONE)).toBe(10);
    expect(daysUntilExam("nope", NOW, ZONE)).toBeNull();
  });
});
