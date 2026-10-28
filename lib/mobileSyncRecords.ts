import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";
import { ConceptCard } from "@/models/ConceptCard";
import { StudyDeck } from "@/models/StudyDeck";
import { ReviewLog } from "@/models/ReviewLog";
import { MobileSyncArtifact } from "@/models/MobileSyncArtifact";
import { practiceVersion, resolvePractice, storedPractice, type PracticeCard } from "@/lib/practice";
import type { MobileCollection, MobileRecord } from "@/lib/mobileSyncSchema";

export type Doc = Record<string, unknown> & { _id: unknown };
export const collectionModels = { cards: ConceptCard, decks: StudyDeck, reviews: ReviewLog, artifacts: MobileSyncArtifact };

function normalized(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    if ("toHexString" in value) return String(value);
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).filter(([, v]) => v !== undefined).map(([k, v]) => [k, normalized(v)]));
  }
  return value;
}
export function revisionOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalized(value))).digest("hex");
}
function pick(doc: Doc, names: string[]): Record<string, unknown> {
  return normalized(Object.fromEntries(names.filter(k => doc[k] !== undefined).map(k => [k, doc[k]]))) as Record<string, unknown>;
}
export function draftData(raw: unknown): Record<string, unknown> {
  const draft = raw as { title?: string; text?: string; updatedAt?: Date | string; deviceLabel?: string } | null;
  const data = { title: draft?.title ?? "", text: draft?.text ?? "", updatedAt: draft?.updatedAt ? new Date(draft.updatedAt).toISOString() : null, deviceLabel: draft?.deviceLabel ?? "" };
  return { ...data, revision: revisionOf(data) };
}
export interface CardRecordContext {
  decks: Map<string, Doc>;
  siblings: Map<string, Doc[]>;
}
/** Two account-scoped queries per page, rather than two extra queries for every card. */
export async function cardRecordContext(docs: Doc[], owner: string, session?: ClientSession): Promise<CardRecordContext> {
  const deckIds = [...new Set(docs.map(doc => String(doc.deckId)))];
  if (!deckIds.length) return { decks: new Map(), siblings: new Map() };
  const decks = await StudyDeck.find({ _id: { $in: deckIds }, auth0Id: owner }).session(session ?? null).lean();
  const cards = await ConceptCard.find({ auth0Id: owner, deckId: { $in: deckIds } }).sort({ _id: 1 }).select("deckId conceptTitle coreFact").session(session ?? null).lean();
  const siblings = new Map<string, Doc[]>();
  for (const card of cards) { const id = String(card.deckId); siblings.set(id, [...(siblings.get(id) ?? []), card as Doc]); }
  return { decks: new Map(decks.map(deck => [String(deck._id), deck as Doc])), siblings };
}
export async function mobileRecord(collection: MobileCollection, doc: Doc, owner: string, session?: ClientSession, context?: CardRecordContext): Promise<MobileRecord> {
  let data: Record<string, unknown> = { id: String(doc._id) };
  if (collection === "cards") {
    data = { ...data, ...pick(doc, ["deckId", "conceptTitle", "coreFact", "expectedKeyPoints", "initialQuestion", "currentQuestion", "leitnerBox", "difficultyTier", "nextReviewDate", "latencyHistory", "reviewCount", "lapses", "lastScore", "lastReviewedAt", "suspended", "revealedAt", "source", "createdAt", "updatedAt"]) };
    const loaded = context ?? await cardRecordContext([doc], owner, session);
    const deck = loaded.decks.get(String(doc.deckId));
    const siblings = (loaded.siblings.get(String(doc.deckId)) ?? []).filter(s => String(s._id) !== String(doc._id));
    const card = doc as unknown as PracticeCard;
    data.deckTitle = deck?.title ?? "";
    data.question = doc.currentQuestion;
    data.practice = { ...resolvePractice(card, siblings.map(s => ({ conceptTitle: String(s.conceptTitle), coreFact: String(s.coreFact) }))), questions: storedPractice(card)?.questions ?? {} };
    data.practiceVersion = practiceVersion(card);
  } else if (collection === "decks") {
    data = { ...data, ...pick(doc, ["title", "sourceType", "sampleKey", "cardCount", "engine", "examDate", "examLabel", "rawText", "modelId", "modelSha256", "createdAt", "updatedAt"]) };
    data.rawText ??= "";
  } else if (collection === "reviews") {
    data = { ...data, ...pick(doc, ["cardId", "deckId", "conceptTitle", "question", "userAnswer", "rawAnswer", "score", "responseLatencyMs", "latencyThresholdMs", "outcome", "boxBefore", "boxAfter", "difficultyTier", "feedback", "coveredKeyPoints", "missingKeyPoints", "followUpQuestion", "followUpAnswer", "followUpReply", "analogy", "retrievedConceptIds", "engine", "modelId", "modelSha256", "operationId", "simulated", "reviewedAt", "mode", "selfRating", "confidence", "thinkMs", "sessionId", "attemptId", "device", "capLimit", "boxCapped", "examAdjusted", "createdAt", "updatedAt"]) };
  } else {
    data = { ...data, ...pick(doc, ["cardId", "reviewLogId", "kind", "input", "output", "engine", "modelId", "modelSha256", "operationId", "occurredAt", "operation", "createdAt", "updatedAt"]) };
  }
  return { id: String(doc._id), revision: revisionOf(data), data };
}
