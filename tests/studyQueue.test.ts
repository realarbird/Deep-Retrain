import { describe, expect, it } from "vitest";
import { heuristicChoice, storedPractice, toStoredPractice, type ResolvedPractice } from "@/lib/practice";
import { buildSession, orderDue, pickMode, revealedSinceReview, type QueueCard } from "@/lib/studyQueue";

const NOW = new Date("2026-10-23T15:00:00.000Z");
const ZONE = { name: "America/New_York", offsetMinutes: 240 };
const H = 3_600_000;
const D = 24 * H;

let n = 0;
function card(over: Partial<QueueCard> = {}): QueueCard {
  n++;
  return {
    _id: `c${n}`,
    deckId: "d1",
    conceptTitle: `Concept ${n}`,
    coreFact: `Concept ${n} moves protons across a membrane number ${n} to make energy.`,
    expectedKeyPoints: [`moves protons ${n}`, "makes energy"],
    currentQuestion: `What does concept ${n} do?`,
    leitnerBox: 1,
    difficultyTier: "recall",
    reviewCount: 2,
    latencyHistory: [9_000],
    nextReviewDate: new Date(NOW.getTime() - H),
    revealedAt: null,
    lastReviewedAt: new Date(NOW.getTime() - 2 * D),
    ...over,
  };
}

const none: ResolvedPractice = { choice: null, cloze: null, trueFalse: null, source: "heuristic" };
const all: ResolvedPractice = {
  choice: { question: "Which?", options: ["a", "b", "c", "d"], answerIndex: 0 },
  cloze: { text: "x ____", answers: ["y"] },
  trueFalse: { statements: ["t", "f"], trueIndex: 0 },
  source: "heuristic",
};

describe("pickMode", () => {
  it("climbs from recognition to recall as a card moves up", () => {
    const ctx = { freeRecall: "write" as const, speech: false, practice: all };
    expect(pickMode("auto", card({ leitnerBox: 1 }), ctx)).toBe("choice");
    expect(pickMode("auto", card({ leitnerBox: 2 }), ctx)).toBe("cloze");
    expect(pickMode("auto", card({ leitnerBox: 4 }), ctx)).toBe("write");
    expect(pickMode("auto", card({ leitnerBox: 4 }), { ...ctx, freeRecall: "voice", speech: true })).toBe("voice");
  });

  it("falls back when a card can't be asked that way", () => {
    const ctx = { freeRecall: "voice" as const, speech: false, practice: none };
    expect(pickMode("auto", card({ leitnerBox: 1 }), ctx)).toBe("flip");
    expect(pickMode("auto", card({ leitnerBox: 2 }), ctx)).toBe("write");
    expect(pickMode("auto", card({ leitnerBox: 3 }), ctx)).toBe("write");
    expect(pickMode("choice", card(), ctx)).toBe("flip");
    expect(pickMode("cloze", card(), ctx)).toBe("write");
    expect(pickMode("voice", card(), ctx)).toBe("write");
    expect(pickMode("teach", card(), ctx)).toBe("teach");
  });

  it("only lets a card whose answer was shown be rated", () => {
    const revealed = card({ revealedAt: new Date(NOW.getTime() - H), lastReviewedAt: new Date(NOW.getTime() - 2 * D) });
    expect(revealedSinceReview(revealed)).toBe(true);
    expect(pickMode("write", revealed, { freeRecall: "write", speech: true, practice: all })).toBe("flip");
    expect(revealedSinceReview(card({ revealedAt: new Date(NOW.getTime() - 3 * D) }))).toBe(false);
  });
});

describe("orderDue", () => {
  it("puts overdue cards first, then exam decks, then takes decks in turn", () => {
    const overdue = card({ deckId: "d2", nextReviewDate: new Date(NOW.getTime() - 3 * D) });
    const a1 = card({ deckId: "d1", nextReviewDate: new Date(NOW.getTime() - 3 * H) });
    const a2 = card({ deckId: "d1", nextReviewDate: new Date(NOW.getTime() - 2 * H) });
    const b1 = card({ deckId: "d2", nextReviewDate: new Date(NOW.getTime() - 2.5 * H) });
    const exam1 = card({ deckId: "d3", nextReviewDate: new Date(NOW.getTime() - H) });
    const decks = [
      { _id: "d1", title: "One" },
      { _id: "d2", title: "Two" },
      { _id: "d3", title: "Three", examDate: "2026-10-27" },
    ];
    const ordered = orderDue([a2, exam1, b1, a1, overdue], decks, NOW, ZONE).map((c) => c._id);
    expect(ordered).toEqual([overdue._id, exam1._id, a1._id, b1._id, a2._id]);
  });
});

describe("buildSession", () => {
  const deck = [card(), card(), card(), card(), card(), card()];
  const siblings = new Map([["d1", deck.map((c) => ({ conceptTitle: c.conceptTitle, coreFact: c.coreFact }))]]);
  const base = { now: NOW, zone: ZONE, freeRecall: "write" as const, speech: false };

  it("never sends answers to the browser", () => {
    const stored = toStoredPractice(deck[1], { cloze: { text: "The concept moves ____ across a membrane.", answers: ["protons", "SECRET-ANSWER"] } }, "ollama");
    expect(storedPractice({ ...deck[1], practice: stored })).not.toBeNull();
    const cards = [deck[0], { ...deck[1], practice: stored, leitnerBox: 2 }, deck[2]];
    for (const requested of ["auto", "choice", "truefalse", "cloze", "write", "flip", "teach"] as const) {
      const json = JSON.stringify(buildSession(cards, [{ _id: "d1", title: "Deck" }], siblings, { ...base, requested, limit: 10 }));
      for (const banned of ["coreFact", "expectedKeyPoints", "answerIndex", "trueIndex", "answers", "SECRET-ANSWER", "moves protons 1"]) {
        expect(json, `${requested} leaked ${banned}`).not.toContain(banned);
      }
    }
  });

  it("serves the same multiple-choice item the server will rebuild", () => {
    const [item] = buildSession([deck[0]], [{ _id: "d1", title: "Deck" }], siblings, { ...base, requested: "choice", limit: 1 });
    const others = siblings.get("d1")!.filter((s) => s.conceptTitle !== deck[0].conceptTitle);
    expect(item.prompt).toEqual({ kind: "choice", ...(({ question, options }) => ({ question, options }))(heuristicChoice(deck[0], others)!) });
    expect(item.practiceVersion).toMatch(/^h:[0-9a-f]{16}$/);
  });

  it("stops at the limit, and never past 25", () => {
    expect(buildSession(deck, [], siblings, { ...base, requested: "write", limit: 2 })).toHaveLength(2);
    const many = Array.from({ length: 40 }, () => card());
    expect(buildSession(many, [], siblings, { ...base, requested: "write", limit: 100 })).toHaveLength(25);
  });

  it.each(["auto", "cloze"] as const)("keeps cards without reliable terms in %s as written questions", (requested) => {
    const plain = card({ conceptTitle: "Overview", coreFact: "They fought together and worked hard.", expectedKeyPoints: ["They fought together"], leitnerBox: 2 });
    const [item] = buildSession([plain], [], new Map(), { ...base, requested, limit: 1 });
    expect(item).toMatchObject({ id: plain._id, mode: "write", prompt: { kind: "open", question: plain.currentQuestion }, fallbackReason: "no-key-term" });
  });

  it("doesn't show a fallback notice for an ordinary written question", () => {
    const [item] = buildSession([deck[0]], [], siblings, { ...base, requested: "write", limit: 1 });
    expect(item.fallbackReason).toBeUndefined();
  });
});
