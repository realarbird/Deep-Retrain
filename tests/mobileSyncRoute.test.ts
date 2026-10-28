import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alice, auth, demo } from "./routeSetup";
import { fakeDb, FakeModel } from "./helpers/fakeDb";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { defaultSettings } from "@/lib/settingsSchema";
import { LOCAL_MODEL_ID, LOCAL_MODEL_SHA256 } from "@/lib/mobileSyncSchema";
import { mobileRecord, type Doc } from "@/lib/mobileSyncRecords";
import { cardSourceHash, PRACTICE_VERSION, statementId, toStoredPractice } from "@/lib/practice";
import { MODE_RULES, STUDY_MODES } from "@/lib/leitner";
import { GET, POST } from "@/app/api/mobile-sync/route";

vi.mock("@/lib/account", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/account")>(),
  getAccountState: async () => ({ settings: defaultSettings(5), devices: [], sync: { status: "synced", lastSyncedAt: null, error: null } }),
}));
// Loose JSON represents the public wire API, not an implementation type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const CARD = "1".repeat(24), DECK = "d".repeat(24);
const NOW = new Date("2026-10-26T16:00:00.000Z");
const DAY = 86400000;
const models = () => Object.values(fakeDb).filter((m): m is FakeModel => m instanceof FakeModel);
function seed() {
  fakeDb.StudyDeck.reset([{ _id: DECK, auth0Id: alice.userId, title: "Biology", rawText: "Original notes", examDate: null }]);
  fakeDb.ConceptCard.reset([{ _id: CARD, auth0Id: alice.userId, deckId: DECK, conceptTitle: "Mitochondria", coreFact: "Mitochondria produce ATP in cells.", expectedKeyPoints: ["produce ATP", "in cells"], initialQuestion: "What do mitochondria do?", currentQuestion: "What do mitochondria do?", leitnerBox: 1, difficultyTier: "recall", reviewCount: 0, lapses: 0, latencyHistory: [], lastReviewedAt: null, revealedAt: null, suspended: false, nextReviewDate: new Date(NOW.getTime() - DAY), embedding: [1, 2, 3], authSecret: "secret", practice: null }]);
}
const card = () => fakeDb.ConceptCard.docs.find(c => c._id === CARD)!;
async function wire() { return mobileRecord("cards", card() as Doc, alice.userId); }
async function get(collection = "cards", extra = "") {
  const res = await GET(new Request(`http://test/api/mobile-sync?collection=${collection}${extra}`));
  return { status: res.status, body: await res.json() as Json };
}
async function push(operations: unknown[], expectedAccountId = alice.userId) {
  const res = await POST(new Request("http://test/api/mobile-sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ protocolVersion: 1, expectedAccountId, operations }) }));
  return { status: res.status, body: await res.json() as Json };
}
async function review(overrides: Record<string, unknown> = {}, payload: Record<string, unknown> = {}): Promise<Json> {
  return { id: randomUUID(), type: "review", occurredAt: NOW.toISOString(), baseRevision: (await wire()).revision, baseOperationId: null, payload: { cardId: CARD, reviewLogId: String(new mongoose.Types.ObjectId()), mode: "write", practiceVersion: null, answer: { answer: "They produce ATP in cells." }, latencyMs: 1000, score: 95, feedback: "Accurate recall.", coveredKeyPoints: ["produce ATP"], missingKeyPoints: [], followUpQuestion: null, analogy: "A cellular battery", nextQuestion: "Explain their role.", modelId: LOCAL_MODEL_ID, modelSha256: LOCAL_MODEL_SHA256, attemptId: randomUUID(), sessionId: randomUUID(), tzOffsetMinutes: 0, tzName: "UTC", ...payload }, ...overrides };
}
function create(): Json {
  return { id: randomUUID(), type: "createDeck", occurredAt: NOW.toISOString(), payload: { deckId: "a".repeat(24), deckTitle: "Chemistry", rawText: "All original source notes", cards: [{ id: "b".repeat(24), conceptTitle: "Atom", coreFact: "Atoms contain protons.", expectedKeyPoints: ["protons"], question: "What is an atom?" }] } };
}

beforeEach(() => {
  fakeDb.reset(); auth.current = alice; vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.spyOn(mongoose, "startSession").mockImplementation(async () => ({
    withTransaction: async (fn: () => Promise<unknown>) => {
      const snapshots = models().map(model => [model, structuredClone(model.docs)] as const);
      try { return await fn(); } catch (err) { for (const [model, docs] of snapshots) model.docs = docs; throw err; }
    }, endSession: async () => undefined,
  }) as unknown as mongoose.ClientSession);
  seed();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("mobile account snapshots", () => {
  it("requires a signed-in account and rejects account switch races before reads", async () => {
    auth.current = null; expect((await get()).status).toBe(401);
    auth.current = demo; expect((await get()).status).toBe(403);
    auth.current = alice;
    const reads = vi.spyOn(fakeDb.ConceptCard, "find");
    expect((await get("cards", "&expectedAccountId=auth0%7Cbob")).status).toBe(409);
    expect((await push([create()], "auth0|bob")).status).toBe(409);
    expect(reads).not.toHaveBeenCalled(); expect(fakeDb.MobileSyncReceipt.docs).toHaveLength(0);
  });
  it("includes full private study keys, source notes and draft revisions without embeddings or credentials", async () => {
    const result = await get();
    expect(result.status).toBe(200);
    const data = result.body.records[0].data;
    expect(data).toMatchObject({ id: CARD, deckTitle: "Biology", coreFact: "Mitochondria produce ATP in cells.", expectedKeyPoints: ["produce ATP", "in cells"], question: "What do mitochondria do?" });
    expect(data.practice.cloze.answers.length).toBeGreaterThan(0);
    expect(data.practiceVersion).toMatch(/^h:[0-9a-f]{16}$/);
    expect(JSON.stringify(result.body)).not.toMatch(/embedding|auth0Id|authSecret/);
    expect(result.body.draft.revision).toMatch(/^[0-9a-f]{64}$/);
    expect(result.body.settingsRevision).toMatch(/^[0-9a-f]{64}$/);
    expect((await get("decks")).body.records[0].data.rawText).toBe("Original notes");
  });
  it("paginates every row beyond the old 500-card limit, omits other accounts and sees hard deletions", async () => {
    const base = card();
    fakeDb.ConceptCard.reset(Array.from({ length: 503 }, (_, i) => ({ ...base, _id: (i + 1).toString(16).padStart(24, "0") })));
    await fakeDb.ConceptCard.create({ ...base, _id: "e".repeat(24), auth0Id: "auth0|bob" });
    const ids: string[] = []; let cursor = "";
    do { const page = (await get("cards", cursor ? `&after=${cursor}` : "")).body; ids.push(...page.records.map((r: Json) => r.id)); cursor = page.nextCursor; } while (cursor);
    expect(ids).toHaveLength(503); expect(new Set(ids).size).toBe(503);
    await fakeDb.ConceptCard.deleteOne({ _id: ids[0] });
    expect((await get()).body.records.some((r: Json) => r.id === ids[0])).toBe(false);
  });
  it("refuses malformed cursors and oversized pages", async () => {
    expect((await get("cards", "&after=no")).status).toBe(400);
    expect((await get("cards", "&limit=201")).status).toBe(400);
  });
  it("includes the recorded time allowance when downloading web review history", async () => {
    await fakeDb.ReviewLog.create({ _id: "9".repeat(24), auth0Id: alice.userId, cardId: CARD, responseLatencyMs: 20000, latencyThresholdMs: 34000, mode: "write" });
    expect((await get("reviews")).body.records[0].data).toMatchObject({ responseLatencyMs: 20000, latencyThresholdMs: 34000 });
  });
});

describe("transactional local operations", () => {
  it.each(STUDY_MODES)("preserves grading and mode ceilings for %s", async mode => {
    await fakeDb.ConceptCard.updateOne({ _id: CARD }, { $set: { leitnerBox: 4, practice: {
      v: PRACTICE_VERSION, engine: "curated", sourceHash: cardSourceHash(card() as never),
      choice: { question: "What do mitochondria produce?", options: ["ATP", "DNA", "Glucose", "Starch"], answerIndex: 0 },
      cloze: { text: "Mitochondria produce ____.", answers: ["ATP"] },
      trueFalse: { statements: ["Mitochondria produce ATP.", "Mitochondria produce starch."], trueIndex: 0 },
    } } });
    if (mode === "flip" || mode === "listen") {
      const revealed = { id: randomUUID(), type: "reveal", occurredAt: new Date(NOW.getTime() - 10000).toISOString(), baseRevision: (await wire()).revision, payload: { cardId: CARD } };
      expect((await push([revealed])).body.results[0].status).toBe("applied");
    }
    const data = (await wire()).data as Json;
    const answer = mode === "choice" ? { selectedOption: "ATP" } : mode === "cloze" ? { answer: "ATP" } : mode === "truefalse" ? { statementId: statementId("Mitochondria produce ATP."), value: true } : mode === "flip" || mode === "listen" ? { selfRating: "easy" } : { answer: "Mitochondria produce ATP in cells." };
    const result = (await push([await review({}, { mode, practiceVersion: data.practiceVersion, answer })])).body.results[0];
    expect(result.status).toBe("applied");
    expect(fakeDb.ReviewLog.docs[0]).toMatchObject({ mode, engine: "on-device", outcome: "promote", latencyThresholdMs: MODE_RULES[mode].latencyMs });
    expect(result.records.find((r: Json) => r.collection === "reviews").data.latencyThresholdMs).toBe(MODE_RULES[mode].latencyMs);
    expect(card().leitnerBox).toBe(["write", "voice", "teach"].includes(mode) ? 5 : 4);
    expect(card().reviewCount).toBe(1);
  });
  it("keeps protocol v1 offline reviews on the mode's base time", async () => {
    // Queued native attempts predate per-card timing and must retain their original rules.
    await fakeDb.ConceptCard.updateOne({ _id: CARD }, { $set: { expectedKeyPoints: ["a long answer with many details that would receive more time on the web"] } });
    const result = (await push([await review({}, { latencyMs: MODE_RULES.write.latencyMs })])).body.results[0];
    expect(result.status).toBe("applied");
    expect(fakeDb.ReviewLog.docs[0]).toMatchObject({ outcome: "hesitation", latencyThresholdMs: 12000 });
  });
  it("holds a fast correct answer at a recognition mode's ceiling and records wrong keyed answers", async () => {
    await fakeDb.ConceptCard.updateOne({ _id: CARD }, { $set: { leitnerBox: 3, practice: { v: PRACTICE_VERSION, engine: "curated", sourceHash: cardSourceHash(card() as never), choice: { question: "Produces ATP?", options: ["Mitochondria", "Nucleus", "Vacuole", "Wall"], answerIndex: 0 } } } });
    const first = await review({}, { mode: "choice", practiceVersion: (await wire()).data.practiceVersion, answer: { selectedOption: "Mitochondria" }, score: 0 });
    expect((await push([first])).body.results[0].status).toBe("applied"); expect(card().leitnerBox).toBe(3); expect(fakeDb.ReviewLog.docs[0].boxCapped).toBe(true);
    const wrong = await review({ occurredAt: new Date(NOW.getTime() + 1000).toISOString() }, { mode: "choice", practiceVersion: (await wire()).data.practiceVersion, answer: { selectedOption: "Nucleus" }, score: 100 });
    expect((await push([wrong])).body.results[0].status).toBe("applied"); expect(card().leitnerBox).toBe(1); expect(fakeDb.ReviewLog.docs[1].score).toBe(0);
  });
  it("scopes the operation receipt to its account and hashes object keys canonically", async () => {
    const first = create();
    expect((await push([first])).body.results[0].status).toBe("applied");
    const reordered = Object.fromEntries(Object.entries(first).reverse());
    expect((await push([reordered])).body.results[0].status).toBe("duplicate");
    auth.current = { ...alice, userId: "auth0|bob" };
    const bob = create(); bob.id = first.id; bob.payload.deckId = "c".repeat(24); bob.payload.cards[0].id = "e".repeat(24);
    expect((await push([bob], "auth0|bob")).body.results[0].status).toBe("applied"); expect(fakeDb.MobileSyncReceipt.docs).toHaveLength(2);
  });
  it("preserves an operation when a causal predecessor is missing or conflicted", async () => {
    const pending = await review({ baseOperationId: randomUUID() });
    const result = (await push([pending])).body.results[0];
    expect(result.status).toBe("conflict"); expect(result.message).toContain("earlier offline operation"); expect(card().reviewCount).toBe(0);
    const child = await review({ baseOperationId: pending.id });
    expect((await push([child])).body.results[0].status).toBe("conflict"); expect(fakeDb.MobileSyncArtifact.docs).toHaveLength(2);
  });
  it("uses the event's original timezone day and excludes simulated history from the allowance", async () => {
    // 16:00Z in UTC+10 is already the next local date; the prior UTC day's tail is outside it.
    fakeDb.ReviewLog.reset(Array.from({ length: 5 }, () => ({ auth0Id: alice.userId, reviewedAt: new Date("2026-10-26T13:59:00Z"), simulated: false })));
    expect((await push([await review({}, { tzOffsetMinutes: -600, tzName: "Australia/Brisbane" })])).body.results[0].status).toBe("applied");
    fakeDb.ReviewLog.reset(Array.from({ length: 5 }, () => ({ auth0Id: alice.userId, reviewedAt: NOW, simulated: true })));
    const another = await review({ occurredAt: new Date(NOW.getTime() + 1000).toISOString() });
    expect((await push([another])).body.results[0].status).toBe("applied");
  });
  it("fails safely when the deployment has no Mongo transactions", async () => {
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce({ withTransaction: async () => { throw new Error("Transaction numbers are only allowed on a replica set member or mongos"); }, endSession: async () => undefined } as unknown as mongoose.ClientSession);
    const result = await push([create()]); expect(result.status).toBe(503); expect(result.body.error).toContain("transaction-capable"); expect(fakeDb.MobileSyncReceipt.docs).toHaveLength(0);
  });
  it("creates stable deck/card ids and source notes once, and replays identical requests", async () => {
    const op = create();
    const first = await push([op]); expect(first.body.results[0].status).toBe("applied");
    expect(fakeDb.StudyDeck.docs.find(d => d._id === op.payload.deckId)).toMatchObject({ rawText: "All original source notes", engine: "on-device" });
    const made = fakeDb.ConceptCard.docs.find(c => c._id === op.payload.cards[0].id)!;
    expect(made).toMatchObject({ leitnerBox: 1, difficultyTier: "recall", reviewCount: 0 });
    expect(new Date(made.nextReviewDate as Date).toISOString()).toBe(NOW.toISOString());
    const second = await push([op]); expect(second.body.results[0]).toMatchObject({ status: "duplicate", records: first.body.results[0].records });
    expect(fakeDb.ConceptCard.docs).toHaveLength(2); expect(fakeDb.MobileSyncReceipt.docs).toHaveLength(1);
    op.payload.rawText = "different";
    expect((await push([op])).body.results[0].status).toBe("rejected");
    expect(fakeDb.MobileSyncReceipt.docs).toHaveLength(1);
  });
  it("rejects cross-owner id collisions and duplicate generated ids without overwriting either account", async () => {
    const op = create(); await fakeDb.ConceptCard.create({ _id: op.payload.cards[0].id, auth0Id: "auth0|bob", coreFact: "private" });
    expect((await push([op])).body.results[0].status).toBe("conflict");
    expect(fakeDb.ConceptCard.docs.find(c => c._id === op.payload.cards[0].id)?.coreFact).toBe("private");
    expect(fakeDb.StudyDeck.docs).toHaveLength(1);
    const other = create(); other.payload.cards[0].id = other.payload.deckId;
    expect((await push([other])).body.results[0].status).toBe("rejected");
  });
  it("records explicit local provenance, raw answers and derived scheduling at the original event time", async () => {
    const op = await review({ occurredAt: new Date(NOW.getTime() - 2 * DAY).toISOString() });
    const result = (await push([op])).body.results[0];
    expect(result.status).toBe("applied"); expect(card()).toMatchObject({ leitnerBox: 2, reviewCount: 1, difficultyTier: "application" });
    expect(new Date(card().nextReviewDate as Date).toISOString()).toBe(new Date(NOW.getTime() + DAY).toISOString());
    const log = fakeDb.ReviewLog.docs[0];
    expect(log).toMatchObject({ _id: op.payload.reviewLogId, engine: "on-device", modelId: LOCAL_MODEL_ID, modelSha256: LOCAL_MODEL_SHA256, score: 95, rawAnswer: op.payload.answer, capLimit: 5 });
    expect(new Date(log.reviewedAt as Date).toISOString()).toBe(op.occurredAt);
    expect((await push([op])).body.results[0].status).toBe("duplicate"); expect(card().reviewCount).toBe(1);
    expect((await get("reviews")).body.records[0].data.userAnswer).toBe(op.payload.answer.answer);
  });
  it("uses the original event day's cap rather than upload day, and preserves cap-rejected history", async () => {
    const old = new Date(NOW.getTime() - DAY);
    fakeDb.ReviewLog.reset(Array.from({ length: 5 }, () => ({ auth0Id: alice.userId, reviewedAt: old, simulated: false })));
    const op = await review({ occurredAt: old.toISOString() });
    const result = (await push([op])).body.results[0];
    expect(result.status).toBe("rejected"); expect(result.message).toContain("original day"); expect(card().reviewCount).toBe(0);
    expect(fakeDb.MobileSyncArtifact.docs[0].operation).toMatchObject({ payload: { answer: op.payload.answer } });
    expect((await push([await review()])).body.results[0].status).toBe("applied");
  });
  it("rejects future times and unapproved model provenance", async () => {
    const future = await review({ occurredAt: new Date(NOW.getTime() + 3600000).toISOString() });
    expect((await push([future])).body.results[0].status).toBe("rejected");
    expect((await push([await review({}, { modelId: "fake-cloud-model" })])).status).toBe(400);
    expect(card().reviewCount).toBe(0);
  });
  it("regrades keyed modes against the server's private key, regardless of client claimed score", async () => {
    const data = (await wire()).data as Json;
    const op = await review({}, { mode: "cloze", practiceVersion: data.practiceVersion, answer: { answer: data.practice.cloze.answers[0] }, score: 0 });
    expect((await push([op])).body.results[0].status).toBe("applied"); expect(fakeDb.ReviewLog.docs[0].score).toBe(100);
    expect(card().leitnerBox).toBe(2);
    const data2 = (await wire()).data as Json;
    const tf = data2.practice.trueFalse;
    if (tf) {
      const next = await review({ occurredAt: new Date(NOW.getTime() + 1000).toISOString() }, { mode: "truefalse", practiceVersion: data2.practiceVersion, answer: { statementId: statementId(tf.statements[tf.trueIndex]), value: false }, score: 100 });
      expect((await push([next])).body.results[0].status).toBe("applied"); expect(card().leitnerBox).toBe(1);
    }
  });
  it("keeps retired stored-key attempts for inspection instead of grading a new fallback", async () => {
    card().practice = { ...toStoredPractice(card() as never, { cloze: { text: "Mitochondria produce ____.", answers: ["ATP"] } }, "curated"), v: 1 };
    const op = await review({}, { mode: "cloze", practiceVersion: `s:${cardSourceHash(card() as never)}`, answer: { answer: "ATP" } });
    const result = (await push([op])).body.results[0];
    expect(result.status).toBe("conflict");
    expect(result.message).toContain("practice item changed");
    expect(card().reviewCount).toBe(0);
    expect(fakeDb.ReviewLog.docs).toHaveLength(0);
    expect(fakeDb.MobileSyncArtifact.docs).toHaveLength(1);
  });

  it("rejects ADP as an ATP typo in a local keyed answer", async () => {
    card().practice = toStoredPractice(card() as never, { cloze: { text: "Mitochondria produce ____.", answers: ["ATP"] } }, "curated");
    const op = await review({}, { mode: "cloze", practiceVersion: (await wire()).data.practiceVersion, answer: { answer: "ADP" }, score: 100 });
    expect((await push([op])).body.results[0].status).toBe("applied");
    expect(fakeDb.ReviewLog.docs[0].score).toBe(0);
  });

  it("supports causal baseOperationId chains without trusting a locally invented revision", async () => {
    const first = await review();
    const second = await review({ id: randomUUID(), occurredAt: new Date(NOW.getTime() + 1000).toISOString(), baseRevision: "local-projection", baseOperationId: first.id });
    const result = await push([first, second]);
    expect(result.body.results.map((r: Json) => r.status)).toEqual(["applied", "applied"]); expect(card().reviewCount).toBe(2); expect(card().leitnerBox).toBe(3);
  });
  it("keeps remote edit/deletion conflicts durable, sync-visible, and never resurrects a deleted card", async () => {
    const op = await review(); await fakeDb.ConceptCard.updateOne({ _id: CARD }, { $set: { currentQuestion: "Remote edit" } });
    expect((await push([op])).body.results[0].status).toBe("conflict"); expect(card().currentQuestion).toBe("Remote edit"); expect(card().reviewCount).toBe(0);
    const deleted = await review(); await fakeDb.ConceptCard.deleteOne({ _id: CARD });
    expect((await push([deleted])).body.results[0].status).toBe("conflict"); expect(fakeDb.ConceptCard.docs).toHaveLength(0);
    const artifacts = (await get("artifacts")).body.records;
    expect(artifacts).toHaveLength(2); expect(artifacts[0].data.operation.payload.answer).toBeDefined();
    expect(fakeDb.ReviewLog.docs).toHaveLength(0);
  });
  it("requires reveal before self-rating, enforces revealed typed-answer guard, and accepts delayed valid reveal chains", async () => {
    expect((await push([await review({}, { mode: "flip", answer: { selfRating: "easy" } })])).body.results[0].status).toBe("rejected");
    const reveal = { id: randomUUID(), type: "reveal", occurredAt: new Date(NOW.getTime() - DAY).toISOString(), baseRevision: (await wire()).revision, payload: { cardId: CARD } };
    expect((await push([reveal])).body.results[0].status).toBe("applied");
    expect((await push([await review()])).body.results[0].status).toBe("rejected");
    const rated = await review({ occurredAt: new Date(NOW.getTime() - DAY + 10000).toISOString(), baseOperationId: reveal.id }, { mode: "flip", answer: { selfRating: "hard" }, score: 100 });
    expect((await push([rated])).body.results[0].status).toBe("applied"); expect(card().leitnerBox).toBe(1); expect(fakeDb.ReviewLog.docs[0].score).toBe(80);
  });
  it("applies existing mode ceilings and exam window adjustment", async () => {
    await fakeDb.ConceptCard.updateOne({ _id: CARD }, { $set: { leitnerBox: 4 } });
    await fakeDb.StudyDeck.updateOne({ _id: DECK }, { $set: { examDate: "2026-11-02" } });
    expect((await push([await review()])).body.results[0].status).toBe("applied");
    expect(fakeDb.ReviewLog.docs[0]).toMatchObject({ boxAfter: 5, examAdjusted: true });
    expect(new Date(card().nextReviewDate as Date).getTime()).toBeLessThan(new Date("2026-11-02").getTime());
  });
  it("keeps local artifacts under stable ids and refuses references owned by another account", async () => {
    const artifactId = "f".repeat(24);
    const op = { id: randomUUID(), type: "artifact", occurredAt: NOW.toISOString(), payload: { artifactId, cardId: CARD, kind: "analogy", output: "A battery in a cell", modelId: LOCAL_MODEL_ID, modelSha256: LOCAL_MODEL_SHA256 } };
    expect((await push([op])).body.results[0].records[0].id).toBe(artifactId);
    expect((await get("artifacts")).body.records[0].data.output).toBe("A battery in a cell");
    await fakeDb.ConceptCard.updateOne({ _id: CARD }, { $set: { auth0Id: "auth0|bob" } });
    expect((await push([{ ...op, id: randomUUID(), payload: { ...op.payload, artifactId: "e".repeat(24) } }])).body.results[0].status).toBe("conflict");
  });
  it("protects remote drafts and returns a revision for chained local draft saves", async () => {
    const first = { id: randomUUID(), type: "draft", occurredAt: NOW.toISOString(), payload: { title: "Local", text: "Notes" } };
    const result = (await push([first])).body.results[0]; expect(result.status).toBe("applied"); expect(result.draft.revision).toBeTruthy();
    const stale = { ...first, id: randomUUID(), payload: { title: "Stale", text: "Keep this too" } };
    expect((await push([stale])).body.results[0].status).toBe("conflict");
    const next = { ...first, id: randomUUID(), baseOperationId: first.id, payload: { title: "Latest local", text: "More notes" } };
    expect((await push([next])).body.results[0].status).toBe("applied"); expect((await get()).body.draft.title).toBe("Latest local");
  });
  it("rolls back card, log and receipt together on storage failure, then retries safely", async () => {
    const op = await review();
    vi.spyOn(fakeDb.MobileSyncReceipt, "create").mockRejectedValueOnce(new Error("injected storage failure"));
    const failed = await push([op]); expect(failed.status).toBe(500);
    expect(card().reviewCount).toBe(0); expect(fakeDb.ReviewLog.docs).toHaveLength(0); expect(fakeDb.MobileSyncReceipt.docs).toHaveLength(0);
    expect((await push([op])).body.results[0].status).toBe("applied"); expect(card().reviewCount).toBe(1);
  });
  it("refuses oversized or overfull batches and invalid operation fields without any partial writes", async () => {
    expect((await push(Array.from({ length: 11 }, create))).status).toBe(400);
    const op = await review({}, { leitnerBox: 5 }); expect((await push([op])).status).toBe(400);
    const res = await POST(new Request("http://test/api/mobile-sync", { method: "POST", headers: { "content-length": "3000000" }, body: "{}" }));
    expect(res.status).toBe(413); expect(fakeDb.MobileSyncReceipt.docs).toHaveLength(0);
  });
});
