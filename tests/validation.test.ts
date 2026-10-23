import { describe, expect, it } from "vitest";
import { deckPatchSchema, reviewBodySchema, studyQuerySchema } from "@/lib/validation";

const cardId = "a".repeat(24);

describe("review payloads", () => {
  it("still accepts the original typed-answer payload", () => {
    const r = reviewBodySchema.parse({ mode: "answer", cardId, answer: "x", latencyMs: 4000, tzOffsetMinutes: 240 });
    expect(r.mode).toBe("answer");
  });

  it("accepts every study mode with its own fields", () => {
    const common = { cardId, latencyMs: 3000, tzOffsetMinutes: 0, attemptId: "11111111-aaaa-4bbb-8ccc-dddddddddddd" };
    const v = `s:${"0".repeat(16)}`;
    for (const body of [
      { mode: "write", answer: "a" },
      { mode: "voice", answer: "a" },
      { mode: "teach", answer: "a" },
      { mode: "flip", rating: "good" },
      { mode: "listen", rating: "again" },
      { mode: "choice", choice: "Glycolysis", practiceVersion: v },
      { mode: "truefalse", statementId: "0a1b2c3d", answer: true, practiceVersion: v },
      { mode: "cloze", answer: "pyruvate", practiceVersion: v },
    ]) {
      expect(reviewBodySchema.safeParse({ ...common, ...body }).success, body.mode).toBe(true);
    }
  });

  it("rejects bad versions, ratings and unknown modes", () => {
    expect(reviewBodySchema.safeParse({ mode: "choice", cardId, latencyMs: 1, choice: "x", practiceVersion: "zzz" }).success).toBe(false);
    expect(reviewBodySchema.safeParse({ mode: "flip", cardId, latencyMs: 1, rating: "meh" }).success).toBe(false);
    expect(reviewBodySchema.safeParse({ mode: "cram", cardId }).success).toBe(false);
  });
});

describe("study query", () => {
  it("defaults to Auto and reads sizes", () => {
    const q = studyQuerySchema.parse({});
    expect(q).toMatchObject({ mode: "auto", tz: 0, speech: "0" });
    expect(q.size).toBeUndefined();
    expect(studyQuerySchema.parse({ size: "5", mode: "cloze" })).toMatchObject({ size: 5, mode: "cloze" });
    expect(studyQuerySchema.parse({ size: "all" }).size).toBe("all");
    expect(studyQuerySchema.safeParse({ size: "40" }).success).toBe(false);
  });
});

describe("deck changes", () => {
  it("takes an exam date or null", () => {
    expect(deckPatchSchema.parse({ examDate: "2026-11-14" }).examDate).toBe("2026-11-14");
    expect(deckPatchSchema.parse({ examDate: null }).examDate).toBeNull();
    expect(deckPatchSchema.safeParse({ examDate: "next week" }).success).toBe(false);
  });
});
