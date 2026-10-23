import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterQueue, alice, auth, demo, IPHONE_UA } from "./routeSetup";
import { fakeDb } from "./helpers/fakeDb";
import { NextRequest } from "next/server";
import { csvCell, toCsv } from "@/lib/export";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route responses are loose JSON in these tests
type Loose = any;

const DECK = "d".repeat(24);
const CARD = "c".repeat(24);
const OTHER = "e".repeat(24);

function seed() {
  fakeDb.StudyDeck.reset([{ _id: DECK, auth0Id: alice.userId, title: "Bio", cardCount: 2, examDate: null, examLabel: "" }]);
  fakeDb.ConceptCard.reset([
    {
      _id: CARD,
      auth0Id: alice.userId,
      deckId: DECK,
      conceptTitle: "Glycolysis",
      coreFact: "Glycolysis splits glucose.",
      expectedKeyPoints: ["splits glucose"],
      initialQuestion: "What is glycolysis?",
      currentQuestion: "Apply glycolysis?",
      leitnerBox: 3,
      difficultyTier: "synthesis",
      nextReviewDate: new Date(Date.now() + 30 * 86_400_000),
      embedding: [1, 0],
      embeddingModel: "old",
      reviewCount: 4,
      practice: { v: 1 },
    },
    { _id: OTHER, auth0Id: "auth0|mallory", deckId: "f".repeat(24), conceptTitle: "Theirs", coreFact: "x", expectedKeyPoints: [], currentQuestion: "q", leitnerBox: 1, nextReviewDate: new Date() },
  ]);
  fakeDb.ReviewLog.reset([
    { auth0Id: alice.userId, cardId: CARD, deckId: DECK, conceptTitle: "Glycolysis", score: 90, responseLatencyMs: 4000, outcome: "promote", boxBefore: 2, boxAfter: 3, reviewedAt: new Date(), replay: { secret: true } },
  ]);
}

const json = (method: string, url: string, body?: unknown) =>
  new NextRequest(url, { method, headers: { "Content-Type": "application/json", "user-agent": IPHONE_UA }, ...(body ? { body: JSON.stringify(body) } : {}) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("cards and decks", () => {
  beforeEach(() => {
    fakeDb.reset();
    afterQueue.length = 0;
    auth.current = alice;
    seed();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists and searches only your own cards", async () => {
    const { GET } = await import("@/app/api/cards/route");
    const all = (await (await GET(json("GET", "http://test/api/cards"))).json()) as Loose;
    expect(all.cards.map((c: Loose) => c.id)).toEqual([CARD]);
    const found = (await (await GET(json("GET", "http://test/api/cards?q=GLUCOSE"))).json()) as Loose;
    expect(found.cards).toHaveLength(1);
    const none = (await (await GET(json("GET", "http://test/api/cards?q=(.*"))).json()) as Loose;
    expect(none.cards).toHaveLength(0);
  });

  it("refuses to touch someone else's card", async () => {
    const { PATCH, DELETE } = await import("@/app/api/cards/[id]/route");
    expect((await PATCH(json("PATCH", "http://test", { suspended: true }), ctx(OTHER))).status).toBe(404);
    expect((await DELETE(json("DELETE", "http://test"), ctx(OTHER))).status).toBe(404);
  });

  it("re-embeds an edited card and retires its practice items", async () => {
    const { PATCH } = await import("@/app/api/cards/[id]/route");
    const res = await PATCH(json("PATCH", "http://test", { coreFact: "Glycolysis splits glucose into two pyruvate.", question: "Where does glycolysis happen?" }), ctx(CARD));
    expect(res.status).toBe(200);
    const stored = fakeDb.ConceptCard.docs.find((c) => c._id === CARD) as Loose;
    expect(stored.embedding).toHaveLength(384);
    expect(stored.embeddingModel).toBe("hash-384-v1");
    expect(stored.practice).toBeNull();
    expect(stored.currentQuestion).toBe("Where does glycolysis happen?");
    expect(stored.initialQuestion).toBe("What is glycolysis?");
  });

  it("suspends and starts a card over", async () => {
    const { PATCH } = await import("@/app/api/cards/[id]/route");
    const suspended = (await (await PATCH(json("PATCH", "http://test", { suspended: true }), ctx(CARD))).json()) as Loose;
    expect(suspended.card.suspended).toBe(true);
    const reset = (await (await PATCH(json("PATCH", "http://test", { resetProgress: true }), ctx(CARD))).json()) as Loose;
    expect(reset.card).toMatchObject({ box: 1, tier: "recall", question: "What is glycolysis?" });
    expect(Date.parse(reset.card.nextReviewDate)).toBeLessThanOrEqual(Date.now());
  });

  it("deletes a card with its history and updates the deck count", async () => {
    const { DELETE } = await import("@/app/api/cards/[id]/route");
    expect((await DELETE(json("DELETE", "http://test"), ctx(CARD))).status).toBe(200);
    expect(fakeDb.ConceptCard.docs.find((c) => c._id === CARD)).toBeUndefined();
    expect(fakeDb.ReviewLog.docs).toHaveLength(0);
    expect((fakeDb.StudyDeck.docs[0] as Loose).cardCount).toBe(1);
  });

  it("sets an exam date and pulls in reviews that would land after it", async () => {
    const { PATCH } = await import("@/app/api/decks/[id]/route");
    const examDate = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const body = (await (await PATCH(json("PATCH", "http://test", { examDate, examLabel: "Unit test", tzOffsetMinutes: 0 }), ctx(DECK))).json()) as Loose;
    expect(body).toMatchObject({ deck: { examDate, examLabel: "Unit test" }, pulled: 1 });
    const card = fakeDb.ConceptCard.docs.find((c) => c._id === CARD) as Loose;
    expect(card.nextReviewDate.getTime()).toBeLessThan(Date.parse(`${examDate}T00:00:00Z`));
    const bad = await PATCH(json("PATCH", "http://test", { examDate: "2026-02-31" }), ctx(DECK));
    expect(bad.status).toBe(400);
  });

  it("deletes a deck with everything in it", async () => {
    const { DELETE } = await import("@/app/api/decks/[id]/route");
    await DELETE(json("DELETE", "http://test"), ctx(DECK));
    expect(fakeDb.StudyDeck.docs).toHaveLength(0);
    expect(fakeDb.ConceptCard.docs.map((c) => c._id)).toEqual([OTHER]);
    expect(fakeDb.ReviewLog.docs).toHaveLength(0);
  });
});

describe("export", () => {
  beforeEach(() => {
    fakeDb.reset();
    auth.current = alice;
    seed();
  });

  it("escapes CSV and defuses formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(["a", "b"])).toBe("a | b");
    expect(toCsv([{ a: 1 }], [{ header: "A", value: (r) => r.a }])).toBe("A\r\n1\r\n");
  });

  it("exports JSON without embeddings, practice items or replay data", async () => {
    const { GET } = await import("@/app/api/export/route");
    const res = await GET(json("GET", "http://test/api/export"));
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="deepretain-\d{4}-\d{2}-\d{2}\.json"/);
    const text = await res.text();
    expect(text).not.toContain("embedding");
    expect(text).not.toContain("practice");
    expect(text).not.toContain("secret");
    expect(JSON.parse(text).cards[0]).toMatchObject({ id: CARD, conceptTitle: "Glycolysis" });
  });

  it("exports reviews as CSV", async () => {
    const { GET } = await import("@/app/api/export/route");
    const text = await (await GET(json("GET", "http://test/api/export?format=reviews.csv"))).text();
    expect(text.split("\r\n")[0]).toBe("When,Deck,Concept,Mode,Score,Seconds,Outcome,Box before,Box after,Graded by,Confidence,Device,Simulated");
    expect(text).toContain(",Bio,Glycolysis,write,90,4,promote,2,3,");
  });
});

describe("notes draft", () => {
  beforeEach(() => {
    fakeDb.reset();
    auth.current = alice;
  });

  it("saves a draft and refuses a stale overwrite from another device", async () => {
    const { GET, PUT } = await import("@/app/api/draft/route");
    const first = (await (await PUT(json("PUT", "http://test", { title: "Bio", text: "Notes", baseUpdatedAt: null }))).json()) as Loose;
    expect(first.draft).toMatchObject({ title: "Bio", text: "Notes", deviceLabel: "Safari on iPhone" });

    const stale = await PUT(json("PUT", "http://test", { title: "Bio", text: "Other", baseUpdatedAt: null }));
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as Loose).draft.text).toBe("Notes");

    await PUT(json("PUT", "http://test", { title: "Bio", text: "More notes", baseUpdatedAt: first.draft.updatedAt }));
    expect(((await (await GET()).json()) as Loose).draft.text).toBe("More notes");
  });

  it("isn't available in Demo Mode", async () => {
    auth.current = demo;
    const { GET } = await import("@/app/api/draft/route");
    expect((await GET()).status).toBe(403);
  });
});
