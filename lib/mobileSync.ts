import mongoose, { type ClientSession } from "mongoose";
import { effectiveDailyCapFor, type AccountState } from "@/lib/account";
import { HttpError } from "@/lib/api";
import { applyExamWindow } from "@/lib/examPlan";
import { decideOutcome, MODE_RULES, selfRatingScore } from "@/lib/leitner";
import { localDayBounds } from "@/lib/pacer";
import { cardSourceHash, resolvePractice, type Sibling, type PracticeCard } from "@/lib/practice";
import { chooseNextQuestion, gradeChoiceAttempt, gradeClozeAttempt, gradeTrueFalseAttempt, selfRatedFeedback, type KeyGrade, type NextQuestionCard } from "@/lib/reviewFlow";
import { revealedSinceReview, teachQuestion } from "@/lib/studyQueue";
import { resolveZone } from "@/lib/timezone";
import { mobileRecord, cardRecordContext, draftData, revisionOf, type CardRecordContext, type Doc } from "@/lib/mobileSyncRecords";
import type { ChangedMobileRecord, MobileCollection, MobileOperation, MobileResult } from "@/lib/mobileSyncSchema";
import { ConceptCard } from "@/models/ConceptCard";
import { StudyDeck } from "@/models/StudyDeck";
import { ReviewLog } from "@/models/ReviewLog";
import { UserProfile } from "@/models/UserProfile";
import { MobileSyncArtifact } from "@/models/MobileSyncArtifact";
import { MobileSyncReceipt } from "@/models/MobileSyncReceipt";

class OperationProblem extends Error {
  constructor(public status: "conflict" | "rejected", message: string) { super(message); }
}
const problem = (message: string, status: "conflict" | "rejected" = "conflict"): never => { throw new OperationProblem(status, message); };
async function changed(collection: MobileCollection, doc: Doc, owner: string, session: ClientSession, context?: CardRecordContext): Promise<ChangedMobileRecord> {
  return { collection, ...await mobileRecord(collection, doc, owner, session, context) };
}
async function baseFor(owner: string, op: MobileOperation, id: string, collection: string, session: ClientSession): Promise<string | null> {
  if (!op.baseOperationId) return op.baseRevision;
  const parent = await MobileSyncReceipt.findOne({ auth0Id: owner, operationId: op.baseOperationId }).session(session).lean();
  const result = parent?.result as MobileResult | undefined;
  if (collection === "draft" && result?.status === "applied" && result.draft) return String(result.draft.revision);
  const record = result?.status === "applied" ? result.records.find(r => r.collection === collection && r.id === id) : null;
  if (!record) return problem("The earlier offline operation has not been applied. This attempt was kept for inspection.");
  return record.revision;
}
async function ownedCard(owner: string, op: MobileOperation, cardId: string, session: ClientSession): Promise<Doc> {
  const card = await ConceptCard.findOne({ _id: cardId, auth0Id: owner }).session(session).lean() as Doc | null;
  if (!card) return problem("The card was deleted or is unavailable. The offline attempt was kept for inspection.");
  const expected = await baseFor(owner, op, cardId, "cards", session);
  if (!expected || (await mobileRecord("cards", card, owner, session)).revision !== expected) return problem("This card changed on another device. The offline attempt was kept for inspection.");
  const at = new Date(op.occurredAt).getTime();
  if (card.lastReviewedAt && at <= new Date(card.lastReviewedAt as Date).getTime()) return problem("A newer review already exists. The offline attempt was kept for inspection.");
  if (card.createdAt && at < new Date(card.createdAt as Date).getTime() - 300000) return problem("The attempt predates the card.", "rejected");
  return card;
}
async function retainProblem(owner: string, op: MobileOperation, issue: OperationProblem, session: ClientSession): Promise<MobileResult> {
  const [artifact] = await MobileSyncArtifact.create([{
    auth0Id: owner, operationId: op.id, kind: issue.status, occurredAt: new Date(op.occurredAt),
    input: op.type, output: issue.message, operation: op,
  }], { session });
  return { operationId: op.id, status: issue.status, message: issue.message, records: [await changed("artifacts", artifact.toObject ? artifact.toObject() : artifact, owner, session)] };
}
async function applyOperation(owner: string, op: MobileOperation, settings: AccountState["settings"], session: ClientSession): Promise<MobileResult> {
  const at = new Date(op.occurredAt);
  if (at.getTime() > Date.now() + 300000) return problem("The operation time is in the future. Correct the device clock and try again.", "rejected");
  const records: ChangedMobileRecord[] = [];
  if (op.type === "createDeck") {
    const p = op.payload;
    const ids = p.cards.map(c => c.id);
    if (new Set(ids).size !== ids.length || ids.includes(p.deckId)) return problem("Deck and card ids must be distinct.", "rejected");
    if (await StudyDeck.findById(p.deckId).session(session).lean() || await ConceptCard.findOne({ _id: { $in: [p.deckId, ...ids] } }).session(session).lean() || await StudyDeck.findOne({ _id: { $in: ids } }).session(session).lean()) return problem("One of the local ids is already in use. Nothing was overwritten.");
    const [deck] = await StudyDeck.create([{
      _id: p.deckId, auth0Id: owner, title: p.deckTitle, rawText: p.rawText, sourceType: "notes", cardCount: p.cards.length,
      engine: "on-device", modelId: p.modelId, modelSha256: p.modelSha256, createdAt: at,
    }], { session });
    const cards = await ConceptCard.insertMany(p.cards.map(c => ({
      _id: c.id, auth0Id: owner, deckId: p.deckId, conceptTitle: c.conceptTitle, coreFact: c.coreFact, expectedKeyPoints: c.expectedKeyPoints,
      initialQuestion: c.question, currentQuestion: c.question, leitnerBox: 1, difficultyTier: "recall", nextReviewDate: at,
      reviewCount: 0, lapses: 0, lastScore: null, lastReviewedAt: null, revealedAt: null, suspended: false, latencyHistory: [], source: "ingest", createdAt: at,
    })), { session });
    records.push(await changed("decks", deck.toObject ? deck.toObject() : deck, owner, session));
    const cardDocs = cards.map(card => (card.toObject ? card.toObject() : card) as Doc);
    const context = await cardRecordContext(cardDocs, owner, session);
    for (const card of cardDocs) records.push(await changed("cards", card, owner, session, context));
  } else if (op.type === "draft") {
    const profile = await UserProfile.findOne({ auth0Id: owner }).session(session).lean();
    const current = draftData(profile?.draft);
    const expected = await baseFor(owner, op, "draft", "draft", session);
    if (expected !== current.revision && expected !== current.updatedAt) return problem("A newer draft exists. Your offline draft was kept for inspection.");
    if (current.updatedAt && at.getTime() < new Date(String(current.updatedAt)).getTime()) return problem("A newer draft exists. Your offline draft was kept for inspection.");
    const draft = { ...op.payload, updatedAt: at, deviceLabel: "Android offline" };
    await UserProfile.updateOne({ auth0Id: owner }, { $set: { draft }, $setOnInsert: { auth0Id: owner } }, { upsert: true, session });
    const updated = await UserProfile.findOne({ auth0Id: owner }).session(session).lean();
    const data = draftData(updated?.draft);
    return { operationId: op.id, status: "applied", message: null, records: [], draft: data };
  } else if (op.type === "artifact") {
    const p = op.payload;
    if (p.cardId && !await ConceptCard.findOne({ _id: p.cardId, auth0Id: owner }).session(session).lean()) return problem("The artifact's card is unavailable; the output was kept for inspection.");
    if (p.reviewLogId && !await ReviewLog.findOne({ _id: p.reviewLogId, auth0Id: owner }).session(session).lean()) return problem("The artifact's review is unavailable; the output was kept for inspection.");
    if (p.artifactId && await MobileSyncArtifact.findById(p.artifactId).session(session).lean()) return problem("The artifact id is already in use. Nothing was overwritten.", "rejected");
    const [artifact] = await MobileSyncArtifact.create([{ ...p, ...(p.artifactId ? { _id: p.artifactId } : {}), auth0Id: owner, operationId: op.id, engine: "on-device", occurredAt: at }], { session });
    records.push(await changed("artifacts", artifact.toObject ? artifact.toObject() : artifact, owner, session));
  } else {
    const p = op.payload;
    const card = await ownedCard(owner, op, p.cardId, session);
    if (card.suspended) return problem("The card is suspended. The offline attempt was kept for inspection.");
    if (op.type === "reveal") {
      const updated = await ConceptCard.findOneAndUpdate({ _id: card._id, auth0Id: owner }, { $set: { revealedAt: at } }, { new: true, session }).lean();
      records.push(await changed("cards", updated as Doc, owner, session));
    } else {
      const p = op.payload;
      if (await ReviewLog.findById(p.reviewLogId).session(session).lean()) return problem("The review id is already in use. Nothing was overwritten.", "rejected");
      const priorAttempt = await ReviewLog.findOne({ auth0Id: owner, attemptId: p.attemptId }).session(session).lean();
      if (priorAttempt) return problem("That answer attempt has already been recorded by another operation.", "rejected");
      const { start, end } = localDayBounds(at, p.tzOffsetMinutes);
      const cap = effectiveDailyCapFor(settings, at, p.tzOffsetMinutes);
      const used = await ReviewLog.countDocuments({ auth0Id: owner, simulated: { $ne: true }, reviewedAt: { $gte: start, $lt: end } }, { session });
      if (used >= cap) return problem("The daily study allowance for this attempt's original day is full. The attempt was kept for inspection.", "rejected");
      const revealed = revealedSinceReview(card as never);
      const self = p.mode === "flip" || p.mode === "listen";
      if (self && (!revealed || at.getTime() < new Date(card.revealedAt as Date).getTime() || at.getTime() - new Date(card.revealedAt as Date).getTime() > 30 * 60000)) return problem("Show the answer before rating this card.", "rejected");
      if (!self && revealed) return problem("The answer was revealed. This attempt can only be self-rated.", "rejected");
      let score = p.score, feedback = p.feedback, given = p.answer.answer ?? "", forceHesitation = false;
      let question = p.mode === "teach" ? teachQuestion(String(card.conceptTitle)) : String(card.currentQuestion);
      const rating = p.selfRating ?? p.answer.selfRating;
      if (self) {
        if (!rating) return problem("A self-rating is required.", "rejected");
        ({ score, forceHesitation } = selfRatingScore(rating)); feedback = selfRatedFeedback(rating); given = rating;
      } else if (MODE_RULES[p.mode].grader === "answer-key") {
        const version = p.practiceVersion?.match(/^([sh]):([0-9a-f]{16})$/);
        if (!version || version[2] !== cardSourceHash(card as unknown as PracticeCard)) return problem("The practice item changed. The offline answer was kept for inspection.");
        const siblings = await ConceptCard.find({ auth0Id: owner, deckId: String(card.deckId), _id: { $ne: String(card._id) } }).sort({ _id: 1 }).session(session).lean();
        const practice = resolvePractice(card as unknown as PracticeCard, siblings as Sibling[], { useStored: version[1] === "s" });
        let grade: KeyGrade | null = null;
        if (p.mode === "choice" && practice.choice && p.answer.selectedOption !== undefined) { grade = gradeChoiceAttempt(practice.choice, p.answer.selectedOption); question = practice.choice.question; }
        if (p.mode === "cloze" && practice.cloze && p.answer.answer !== undefined) { grade = gradeClozeAttempt(practice.cloze, p.answer.answer); question = practice.cloze.text; }
        if (p.mode === "truefalse" && practice.trueFalse && p.answer.statementId && p.answer.value !== undefined) { grade = gradeTrueFalseAttempt(practice.trueFalse, p.answer.statementId, p.answer.value); question = practice.trueFalse.statements.find(s => grade?.given.endsWith(s)) ?? question; }
        if (!grade) return problem("The practice answer is incomplete or unavailable.", "rejected");
        ({ score, feedback, given } = grade);
      } else if (!given.trim()) return problem("A written or spoken answer is required.", "rejected");
      const decision = decideOutcome({ score, latencyMs: p.latencyMs, box: Number(card.leitnerBox), now: at, mode: p.mode, forceHesitation });
      const deck = await StudyDeck.findOne({ _id: card.deckId, auth0Id: owner }).session(session).lean();
      if (!deck) return problem("The deck was deleted. The offline attempt was kept for inspection.");
      const exam = applyExamWindow({ next: decision.nextReviewDate, examDate: deck.examDate, now: at, zone: resolveZone(p.tzName, p.tzOffsetMinutes), cardId: String(card._id) });
      const currentQuestion = chooseNextQuestion(card as unknown as NextQuestionCard, decision, MODE_RULES[p.mode].grader === "model" ? p.nextQuestion ?? null : null);
      const updated = await ConceptCard.findOneAndUpdate({ _id: card._id, auth0Id: owner }, {
        $set: { leitnerBox: decision.newBox, nextReviewDate: exam.date, difficultyTier: decision.difficultyTier, currentQuestion, lastScore: score, lastReviewedAt: at, revealedAt: null },
        $inc: { reviewCount: 1, lapses: decision.outcome === "reset" ? 1 : 0 }, $push: { latencyHistory: { $each: [p.latencyMs], $slice: -50 } },
      }, { new: true, session }).lean();
      const [log] = await ReviewLog.create([{
        _id: p.reviewLogId, auth0Id: owner, cardId: String(card._id), deckId: String(card.deckId), conceptTitle: String(card.conceptTitle), question, userAnswer: given, rawAnswer: p.answer,
        score, responseLatencyMs: p.latencyMs, outcome: decision.outcome, boxBefore: Number(card.leitnerBox), boxAfter: decision.newBox, difficultyTier: decision.difficultyTier,
        feedback, coveredKeyPoints: p.coveredKeyPoints, missingKeyPoints: p.missingKeyPoints, followUpQuestion: p.followUpQuestion ?? null, analogy: p.analogy ?? null,
        engine: "on-device", modelId: p.modelId, modelSha256: p.modelSha256, operationId: op.id, simulated: false, reviewedAt: at, mode: p.mode,
        selfRating: rating ?? null, confidence: p.confidence ?? null, thinkMs: p.thinkMs ?? null, sessionId: p.sessionId ?? null, attemptId: p.attemptId, capLimit: cap, boxCapped: decision.boxCapped, examAdjusted: exam.adjusted,
      }], { session });
      records.push(await changed("cards", updated as Doc, owner, session), await changed("reviews", log.toObject ? log.toObject() : log, owner, session));
    }
  }
  return { operationId: op.id, status: "applied", message: null, records };
}

/** Per-operation transaction: rejected/conflicting input is retained, unexpected failures roll back every effect. */
export async function pushMobileOperation(owner: string, op: MobileOperation, settings: AccountState["settings"]): Promise<MobileResult> {
  await Promise.all([MobileSyncReceipt.init(), MobileSyncArtifact.init(), StudyDeck.init(), ConceptCard.init(), ReviewLog.init(), UserProfile.init()]);
  const session = await mongoose.startSession();
  const hash = revisionOf(op);
  try {
    let result!: MobileResult;
    await session.withTransaction(async () => {
      const prior = await MobileSyncReceipt.findOne({ auth0Id: owner, operationId: op.id }).session(session).lean();
      if (prior) {
        if (prior.requestHash !== hash) { result = { operationId: op.id, status: "rejected", message: "This operation id was previously used with different content.", records: [] }; return; }
        result = { ...prior.result as MobileResult, status: (prior.result as MobileResult).status === "applied" ? "duplicate" : (prior.result as MobileResult).status };
        return;
      }
      // Serialize mobile writes for an account. The shared document write forces concurrent transactions
      // to retry their cap/conflict checks against the new snapshot rather than overspending the daily cap.
      await UserProfile.updateOne({ auth0Id: owner }, { $inc: { mobileSyncSequence: 1 }, $setOnInsert: { auth0Id: owner } }, { upsert: true, session });
      try { result = await applyOperation(owner, op, settings, session); }
      catch (err) { if (!(err instanceof OperationProblem)) throw err; result = await retainProblem(owner, op, err, session); }
      await MobileSyncReceipt.create([{ auth0Id: owner, operationId: op.id, requestHash: hash, operation: op, result }], { session });
    });
    return result;
  } catch (err) {
    // A simultaneous first delivery may lose at the unique receipt index. Its transaction is rolled back.
    if ((err as { code?: number }).code === 11000) {
      const prior = await MobileSyncReceipt.findOne({ auth0Id: owner, operationId: op.id }).lean();
      if (prior && prior.requestHash === hash) return { ...prior.result as MobileResult, status: (prior.result as MobileResult).status === "applied" ? "duplicate" : (prior.result as MobileResult).status };
    }
    if (/Transaction numbers|replica set|mongos/i.test(String((err as Error).message))) throw new HttpError(503, "Offline synchronization requires a transaction-capable MongoDB deployment. Your local work is safe; retry after the server is configured.");
    throw err;
  } finally { await session.endSession(); }
}
