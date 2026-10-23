import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterQueue, auth, demo, DEVICE_ID, IPHONE_UA } from "./routeSetup";
import { fakeDb } from "./helpers/fakeDb";
import { NextRequest } from "next/server";
import { heuristicCloze } from "@/lib/practice";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route responses are loose JSON in these tests
type Loose = any;

const TZ = 0;
const DAY = 86_400_000;

const CONCEPTS = [
  ["Glycolysis", "Glycolysis splits one glucose molecule into two pyruvate in the cytoplasm, netting two ATP.", ["occurs in the cytoplasm", "glucose split into two pyruvate", "nets two ATP"]],
  ["Krebs Cycle", "The Krebs cycle runs in the mitochondrial matrix and produces NADH and FADH2 from acetyl-CoA.", ["mitochondrial matrix", "produces NADH and FADH2"]],
  ["Calvin Cycle", "The Calvin cycle fixes carbon dioxide in the stroma using ATP and NADPH.", ["fixes carbon dioxide", "in the stroma"]],
  ["Fermentation", "Fermentation regenerates NAD+ so glycolysis can continue without oxygen.", ["regenerates NAD+", "no oxygen needed"]],
  ["Electron Transport Chain", "The Electron Transport Chain pumps protons across the inner membrane to drive ATP synthase.", ["pumps protons", "drives ATP synthase"]],
] as const;

function seedDeck({ box = 1, examDate = null as string | null } = {}) {
  const deckId = "d".repeat(24);
  fakeDb.StudyDeck.reset([{ _id: deckId, auth0Id: demo.userId, title: "Energy", sourceType: "notes", cardCount: CONCEPTS.length, examDate }]);
  fakeDb.ConceptCard.reset(
    CONCEPTS.map(([conceptTitle, coreFact, keyPoints], i) => ({
      _id: `${i}`.repeat(24),
      auth0Id: demo.userId,
      deckId,
      conceptTitle,
      coreFact,
      expectedKeyPoints: [...keyPoints],
      initialQuestion: `What is ${conceptTitle}?`,
      currentQuestion: `What is ${conceptTitle}?`,
      leitnerBox: box,
      difficultyTier: box === 1 ? "recall" : box === 2 ? "application" : "synthesis",
      nextReviewDate: new Date(Date.now() - 60_000 * (10 - i)),
      latencyHistory: [],
      embedding: [],
      embeddingModel: "",
      reviewCount: 0,
      lapses: 0,
      lastScore: null,
      lastReviewedAt: null,
      suspended: false,
      revealedAt: null,
      practice: null,
    })),
  );
  return { deckId, cardId: (i: number) => `${i}`.repeat(24) };
}

function post(body: Record<string, unknown>) {
  return new NextRequest("http://test/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-deepretain-device": DEVICE_ID, "user-agent": IPHONE_UA },
    body: JSON.stringify({ tzOffsetMinutes: TZ, ...body }),
  });
}

async function review(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/review/route");
  const res = await POST(post(body));
  return { status: res.status, body: (await res.json()) as Loose };
}

async function study(query: string) {
  const { GET } = await import("@/app/api/study/route");
  const res = await GET(new NextRequest(`http://test/api/study?tz=${TZ}&${query}`));
  return { status: res.status, body: (await res.json()) as Loose };
}

const card = (id: string) => fakeDb.ConceptCard.docs.find((c) => c._id === id) as Loose;
const logs = () => fakeDb.ReviewLog.docs as Loose[];

describe("POST /api/review", () => {
  beforeEach(() => {
    fakeDb.reset();
    afterQueue.length = 0;
    auth.current = demo;
    vi.stubEnv("OLLAMA_BASE_URL", "");
    // Nothing in these flows should need the network.
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("no network in tests"))));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("still accepts the original typed-answer payload as Write", async () => {
    const { cardId } = seedDeck();
    const r = await review({
      mode: "answer",
      cardId: cardId(0),
      answer: "It occurs in the cytoplasm, where glucose is split into two pyruvate and nets two ATP.",
      latencyMs: 5_000,
    });
    expect(r.status).toBe(200);
    expect(r.body.result).toMatchObject({ mode: "write", outcome: "promote", newBox: 2, engine: "heuristic" });
    expect(card(cardId(0))).toMatchObject({ leitnerBox: 2, reviewCount: 1 });
    expect(logs()[0]).toMatchObject({ mode: "write", device: { kind: "phone", label: "Safari on iPhone" }, capLimit: 15 });
  });

  it("grades multiple choice against the answer key, with no network", async () => {
    const { cardId } = seedDeck();
    const s = await study("mode=choice&size=5");
    const item = s.body.items.find((i: Loose) => i.id === cardId(0));
    expect(item.mode).toBe("choice");
    expect(item.prompt.options).toContain("Glycolysis");

    const right = await review({ mode: "choice", cardId: cardId(0), choice: "Glycolysis", practiceVersion: item.practiceVersion, latencyMs: 3_000 });
    expect(right.body.result).toMatchObject({ score: 100, outcome: "promote", engine: "answer-key", correctAnswer: "Glycolysis" });

    const other = s.body.items.find((i: Loose) => i.id === cardId(1));
    const wrongOption = other.prompt.options.find((o: string) => o !== "Krebs Cycle");
    const wrong = await review({ mode: "choice", cardId: cardId(1), choice: wrongOption, practiceVersion: other.practiceVersion, latencyMs: 3_000 });
    expect(wrong.body.result).toMatchObject({ score: 0, outcome: "reset", correctAnswer: "Krebs Cycle" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops multiple choice at box 3", async () => {
    const { cardId } = seedDeck({ box: 3 });
    const s = await study("mode=choice&size=5");
    const item = s.body.items[0];
    const r = await review({ mode: "choice", cardId: item.id, choice: item.conceptTitle, practiceVersion: item.practiceVersion, latencyMs: 2_000 });
    expect(r.body.result).toMatchObject({ outcome: "promote", newBox: 3, boxCapped: true });
    expect(card(cardId(0)).leitnerBox).toBe(3);
  });

  it("grades true or false by statement id", async () => {
    seedDeck();
    const s = await study("mode=truefalse&size=5");
    const item = s.body.items.find((i: Loose) => i.mode === "truefalse");
    const isTrue = item.prompt.statement === card(item.id).coreFact;
    const r = await review({ mode: "truefalse", cardId: item.id, statementId: item.prompt.statementId, answer: isTrue, practiceVersion: item.practiceVersion, latencyMs: 2_000 });
    expect(r.body.result).toMatchObject({ score: 100, engine: "answer-key", correctAnswer: isTrue ? "True" : "False" });
  });

  it("accepts a cloze answer with a small typo", async () => {
    const { cardId } = seedDeck({ box: 2 });
    const s = await study("mode=cloze&size=5");
    const item = s.body.items[0];
    expect(item.prompt.text).toContain("____");
    const expected = heuristicCloze(card(item.id) as never)!.answers[0];
    const typo = `${expected.slice(0, -2)}${expected.slice(-1)}${expected.slice(-2, -1)}`;
    const r = await review({ mode: "cloze", cardId: item.id, answer: typo, practiceVersion: item.practiceVersion, latencyMs: 4_000 });
    expect(r.body.result.score).toBe(85);
    expect(r.body.result.outcome).toBe("promote");
    expect(card(cardId(0)).leitnerBox).toBe(3);
  });

  it("needs a reveal before Flip, and only allows rating afterwards", async () => {
    const { cardId } = seedDeck();
    const early = await review({ mode: "flip", cardId: cardId(0), rating: "good", latencyMs: 2_000 });
    expect(early.status).toBe(409);
    expect(early.body.needsReveal).toBe(true);

    const reveal = await review({ mode: "reveal", cardId: cardId(0) });
    expect(reveal.body.coreFact).toContain("pyruvate");
    const write = await review({ mode: "write", cardId: cardId(0), answer: "pyruvate", latencyMs: 2_000 });
    expect(write.status).toBe(409);
    expect(write.body.revealed).toBe(true);

    const flip = await review({ mode: "flip", cardId: cardId(0), rating: "good", latencyMs: 3_000 });
    expect(flip.body.result).toMatchObject({ engine: "self-rated", outcome: "promote", newBox: 2, selfRating: "good" });
    expect(card(cardId(0)).revealedAt).toBeNull();
  });

  it("refuses a stale write when the card was reviewed elsewhere, and logs nothing", async () => {
    const { cardId } = seedDeck();
    const stored = card(cardId(0));
    stored.reviewCount = 3;
    vi.spyOn(fakeDb.ConceptCard, "findById").mockReturnValueOnce(Promise.resolve({ ...stored, reviewCount: 2 }) as never);
    const r = await review({ mode: "write", cardId: cardId(0), answer: "x", latencyMs: 2_000 });
    expect(r.status).toBe(409);
    expect(r.body.reviewedElsewhere).toBe(true);
    expect(logs()).toHaveLength(0);
    expect(card(cardId(0)).reviewCount).toBe(3);
  });

  it("replays a retried attempt instead of moving the card twice", async () => {
    const { cardId } = seedDeck();
    const body = { mode: "write", cardId: cardId(0), answer: "cytoplasm glucose two pyruvate two ATP", latencyMs: 4_000, attemptId: "22222222-aaaa-4bbb-8ccc-dddddddddddd" };
    const first = await review(body);
    const again = await review(body);
    expect(again.body.replayed).toBe(true);
    expect(again.body.reviewLogId).toBe(first.body.reviewLogId);
    expect(logs()).toHaveLength(1);
    expect(card(cardId(0)).reviewCount).toBe(1);
  });

  it("stops at the daily cap", async () => {
    const { cardId, deckId } = seedDeck();
    const now = Date.now();
    for (let i = 0; i < 15; i++) {
      await fakeDb.ReviewLog.create({ auth0Id: demo.userId, cardId: cardId(1), deckId, score: 90, responseLatencyMs: 3000, outcome: "promote", reviewedAt: new Date(now - i * 1000) });
    }
    const r = await review({ mode: "write", cardId: cardId(0), answer: "x", latencyMs: 2_000 });
    expect(r.status).toBe(429);
    expect(r.body.capReached).toBe(true);
    const s = await study("mode=auto");
    expect(s.body.items).toHaveLength(0);
  });

  it("pulls a long interval in before an exam", async () => {
    const examDate = new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10);
    const { cardId } = seedDeck({ box: 5, examDate });
    const r = await review({
      mode: "write",
      cardId: cardId(0),
      answer: "It occurs in the cytoplasm, where glucose is split into two pyruvate and nets two ATP.",
      latencyMs: 4_000,
    });
    expect(r.body.result).toMatchObject({ outcome: "promote", newBox: 5, intervalDays: 30, examAdjusted: true });
    expect(Date.parse(r.body.result.nextReviewDate)).toBeLessThan(Date.parse(`${examDate}T00:00:00Z`));
  });

  it("asks for a reload when the card changed since it was shown", async () => {
    const { cardId } = seedDeck();
    const r = await review({ mode: "choice", cardId: cardId(0), choice: "Glycolysis", practiceVersion: `h:${"0".repeat(16)}`, latencyMs: 2_000 });
    expect(r.status).toBe(409);
    expect(r.body.stale).toBe(true);
  });

  it("keeps suspended cards out of sessions and refuses to grade them", async () => {
    const { cardId } = seedDeck();
    card(cardId(0)).suspended = true;
    const s = await study("mode=write&size=all");
    expect(s.body.items.map((i: Loose) => i.id)).not.toContain(cardId(0));
    expect(JSON.stringify(s.body)).not.toContain("coreFact");
    const r = await review({ mode: "write", cardId: cardId(0), answer: "x", latencyMs: 2_000 });
    expect(r.status).toBe(409);
  });

  it("explains a missed answer on request and keeps the explanation", async () => {
    const { cardId } = seedDeck();
    const s = await study("mode=choice&size=5");
    const item = s.body.items[0];
    const wrong = item.prompt.options.find((o: string) => o !== item.conceptTitle);
    const r = await review({ mode: "choice", cardId: cardId(0), choice: wrong, practiceVersion: item.practiceVersion, latencyMs: 2_000 });
    const explain = await review({ mode: "explain", reviewLogId: r.body.reviewLogId });
    expect(explain.status).toBe(200);
    expect(explain.body.analogy.length).toBeGreaterThan(10);
    expect(logs()[0].analogy).toBe(explain.body.analogy);
  });
});
