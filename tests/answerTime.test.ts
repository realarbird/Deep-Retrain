import { describe, expect, it } from "vitest";
import { answerTimeMs, listenExtraSec, listenPauseSec, wordCount, type AnswerTimeInput } from "@/lib/answerTime";
import { MODE_RULES, STUDY_MODES } from "@/lib/leitner";
import { SAMPLE_DECKS } from "@/lib/sampleDeckData";

/** A string of `n` words. */
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

const SHORT: Omit<AnswerTimeInput, "mode"> = { tier: "recall", prompt: "What does it make?", expectedKeyPoints: ["makes ATP"] };
const time = (over: Partial<AnswerTimeInput> & Pick<AnswerTimeInput, "mode">) => answerTimeMs({ ...SHORT, ...over });

describe("answerTimeMs", () => {
  it("gives a short recall card exactly its mode's base time", () => {
    for (const mode of STUDY_MODES) expect(time({ mode }), mode).toBe(MODE_RULES[mode].latencyMs);
    expect(time({ mode: "listen" })).toBeNull();
  });

  it("gives a harder question more thinking time, in the modes that ask it", () => {
    expect(["recall", "application", "synthesis"].map((tier) => time({ mode: "write", tier: tier as AnswerTimeInput["tier"] }))).toEqual([12_000, 16_000, 20_000]);
    expect(time({ mode: "voice", tier: "synthesis" })).toBe(23_000);
    expect(time({ mode: "flip", tier: "application" })).toBe(11_000);
    for (const mode of ["teach", "choice", "truefalse", "cloze"] as const) expect(time({ mode, tier: "synthesis" }), mode).toBe(MODE_RULES[mode].latencyMs);
  });

  it("gives more time when there is more to read", () => {
    expect(time({ mode: "write", prompt: words(12) })).toBe(12_000);
    expect(time({ mode: "write", prompt: words(20) })).toBe(14_000);
    expect(time({ mode: "choice", prompt: words(40) })).toBe(13_000);
    expect(time({ mode: "truefalse", prompt: words(24) })).toBe(9_000);
    expect(time({ mode: "cloze", prompt: words(23) })).toBe(12_000);
    // Teach it back always asks the same short question.
    expect(time({ mode: "teach", prompt: words(60) })).toBe(90_000);
  });

  it("gives a longer answer more time, by the words in the key points", () => {
    const long = { expectedKeyPoints: [words(10), words(12), words(8)] };
    expect(time({ mode: "write", ...long })).toBe(36_000);
    expect(time({ mode: "voice", ...long })).toBe(25_000);
    expect(time({ mode: "teach", ...long })).toBe(128_000);
    expect(time({ mode: "flip", ...long })).toBe(12_000);
    // The quick modes don't depend on the answer, so the time can't hint at it.
    for (const mode of ["choice", "truefalse", "cloze"] as const) expect(time({ mode, ...long }), mode).toBe(MODE_RULES[mode].latencyMs);
  });

  it("caps each mode", () => {
    const huge = { prompt: words(500), expectedKeyPoints: [words(200)], tier: "synthesis" as const };
    expect(time({ mode: "write", ...huge })).toBe(90_000);
    expect(time({ mode: "voice", ...huge })).toBe(60_000);
    expect(time({ mode: "teach", ...huge })).toBe(240_000);
    expect(time({ mode: "flip", ...huge })).toBe(30_000);
    expect(time({ mode: "choice", ...huge })).toBe(30_000);
    expect(time({ mode: "truefalse", ...huge })).toBe(20_000);
    expect(time({ mode: "cloze", ...huge })).toBe(25_000);
  });

  it("adds typing time on a phone or tablet, only where you type", () => {
    const long = { expectedKeyPoints: [words(30)], touch: true };
    expect(time({ mode: "write", ...long })).toBe(48_000);
    expect(time({ mode: "teach", ...long })).toBe(158_000);
    expect(time({ mode: "cloze", touch: true })).toBe(12_000);
    for (const mode of ["voice", "flip", "choice", "truefalse"] as const) {
      expect(time({ mode, ...long }), mode).toBe(time({ mode, ...long, touch: false }));
    }
  });

  it("scales by extra time after the cap, and rounds up to a whole second", () => {
    expect([0, 25, 50, 100].map((extraTime) => time({ mode: "write", extraTime }))).toEqual([12_000, 15_000, 18_000, 24_000]);
    expect(time({ mode: "write", expectedKeyPoints: [words(200)], extraTime: 50 })).toBe(135_000);
    expect(time({ mode: "write", prompt: words(21) })).toBe(15_000);
  });

  it("matches the worked example in the README", () => {
    const card = SAMPLE_DECKS.bio.concepts[0];
    expect(card.conceptTitle).toBe("Cellular Respiration");
    const write = (tier: AnswerTimeInput["tier"], prompt: string, touch = false) =>
      answerTimeMs({ mode: "write", tier, prompt, expectedKeyPoints: card.expectedKeyPoints, touch });
    expect(write("recall", card.initialQuestion)).toBe(34_000);
    expect(write("application", card.applicationQuestion)).toBe(40_000);
    expect(write("synthesis", card.synthesisQuestion)).toBe(44_000);
    expect(write("recall", card.initialQuestion, true)).toBe(45_000);
    expect(listenExtraSec({ tier: "recall", expectedKeyPoints: card.expectedKeyPoints })).toBe(4);
  });
});

describe("Listen", () => {
  it("waits longer before the answer on harder cards and longer answers, up to 8 seconds", () => {
    expect(listenExtraSec({ tier: "recall", expectedKeyPoints: ["makes ATP"] })).toBe(0);
    expect(listenExtraSec({ tier: "synthesis", expectedKeyPoints: ["makes ATP"] })).toBe(4);
    expect(listenExtraSec({ tier: "application", expectedKeyPoints: [words(30)] })).toBe(6);
    expect(listenExtraSec({ tier: "synthesis", expectedKeyPoints: [words(100)] })).toBe(8);
  });

  it("adds the card's seconds to your pause, then your extra time", () => {
    expect(listenPauseSec(5, 4)).toBe(9);
    expect(listenPauseSec(5, 4, 50)).toBe(14);
    expect(listenPauseSec(5, 0, 100)).toBe(10);
  });
});

describe("wordCount", () => {
  it("counts words the way a reader would", () => {
    expect(wordCount("Dijkstra's algorithm finds acetyl-CoA.")).toBe(5);
    expect(wordCount("net gain of 2 ATP and 2 NADH")).toBe(8);
    expect(wordCount("  ")).toBe(0);
  });

  it("splits languages written without spaces", () => {
    expect(wordCount("光合作用把光能转化为化学能")).toBeGreaterThan(3);
  });
});
