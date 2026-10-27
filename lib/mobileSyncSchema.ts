import { z } from "zod";
import { SELF_RATINGS, STUDY_MODES } from "@/lib/leitner";

export const LOCAL_MODEL_ID = "gemma-4-E2B-it-litert-lm";
export const LOCAL_MODEL_SHA256 = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c";
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/);
const text = (max: number) => z.string().max(max);
// Exact weight-layer hashes, never mutable Ollama tag names alone.
export const LOCAL_MODEL_DIGESTS: Record<string, readonly string[]> = {
  [LOCAL_MODEL_ID]: [LOCAL_MODEL_SHA256],
  "ollama:gemma4:e4b": ["370c2879f17648d337b0ab4e208fdce348e24d1060064e93d7645daafd56d39c", "4c27e0f5b5adf02ac956c7322bd2ee7636fe3f45a8512c9aba5385242cb6e09a"],
};
const provenance = { modelId: z.string().max(100).nullable(), modelSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable() };
const base = {
  id: z.uuid(), occurredAt: z.iso.datetime({ offset: true }),
  baseRevision: z.string().max(100).nullable().default(null),
  baseOperationId: z.uuid().nullable().default(null),
};
const answer = z.object({
  answer: text(12000).optional(), selectedOption: text(300).optional(),
  statementId: text(80).optional(), value: z.boolean().optional(), selfRating: z.enum(SELF_RATINGS).optional(),
}).strict();
export const mobileOperationSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("createDeck"), payload: z.object({
    deckId: objectIdSchema, deckTitle: text(120).min(1), rawText: text(200000).min(1),
    modelId: provenance.modelId.default(LOCAL_MODEL_ID), modelSha256: provenance.modelSha256.default(LOCAL_MODEL_SHA256),
    cards: z.array(z.object({ id: objectIdSchema, conceptTitle: text(120).min(1), coreFact: text(2000).min(1), expectedKeyPoints: z.array(text(500).min(1)).min(1).max(12), question: text(800).min(1) }).strict()).min(1).max(200),
  }).strict() }).strict(),
  z.object({ ...base, type: z.literal("review"), payload: z.object({
    cardId: objectIdSchema, reviewLogId: objectIdSchema, mode: z.enum(STUDY_MODES), practiceVersion: text(100).nullable().optional(), answer,
    latencyMs: z.number().int().min(0).max(86400000), thinkMs: z.number().int().min(0).max(86400000).nullable().optional(),
    sessionId: text(100).nullable().optional(), attemptId: z.uuid(), score: z.number().int().min(0).max(100),
    feedback: text(16000), coveredKeyPoints: z.array(text(500)).max(24).default([]), missingKeyPoints: z.array(text(500)).max(24).default([]),
    followUpQuestion: text(4000).nullable().optional(), analogy: text(16000).nullable().optional(), nextQuestion: text(800).nullable().optional(),
    ...provenance, confidence: z.number().int().min(1).max(3).optional(), tzOffsetMinutes: z.number().int().min(-840).max(840), tzName: text(100).nullable().optional(), selfRating: z.enum(SELF_RATINGS).optional(),
  }).strict() }).strict(),
  z.object({ ...base, type: z.literal("reveal"), payload: z.object({ cardId: objectIdSchema }).strict() }).strict(),
  z.object({ ...base, type: z.literal("draft"), payload: z.object({ title: text(120), text: text(200000) }).strict() }).strict(),
  z.object({ ...base, type: z.literal("artifact"), payload: z.object({
    artifactId: objectIdSchema.optional(), cardId: objectIdSchema.nullable().optional(), reviewLogId: objectIdSchema.nullable().optional(),
    kind: z.enum(["analogy", "followUp"]), input: text(16000).optional(), output: text(32000).min(1), ...provenance,
  }).strict() }).strict(),
]).superRefine((operation, context) => {
  if (operation.type === "reveal" || operation.type === "draft") return;
  const { modelId, modelSha256 } = operation.payload;
  const deterministic = operation.type === "review" && ["choice", "cloze", "truefalse", "flip", "listen"].includes(operation.payload.mode);
  if (deterministic && modelId === null && modelSha256 === null) return;
  if (!modelId || !modelSha256 || !LOCAL_MODEL_DIGESTS[modelId]?.includes(modelSha256)) {
    context.addIssue({ code: "custom", path: ["payload", "modelSha256"], message: "Use an approved local model and its exact weight digest; only deterministic reviews may omit both." });
  }
});
export const mobilePushSchema = z.object({
  protocolVersion: z.literal(1), expectedAccountId: z.string().min(1).max(300), operations: z.array(mobileOperationSchema).min(1).max(10),
}).strict();
export type MobileOperation = z.infer<typeof mobileOperationSchema>;
export type MobileCollection = "cards" | "decks" | "reviews" | "artifacts";
export interface MobileRecord { id: string; revision: string; data: Record<string, unknown> }
export interface ChangedMobileRecord extends MobileRecord { collection: MobileCollection }
export interface MobileResult { operationId: string; status: "applied" | "duplicate" | "conflict" | "rejected"; message: string | null; records: ChangedMobileRecord[]; draft?: Record<string, unknown> }
