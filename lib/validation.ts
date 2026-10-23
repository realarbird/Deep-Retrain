import { z } from "zod";
import { SELF_RATINGS } from "@/lib/leitner";
import { DEFAULT_MODES } from "@/lib/settingsSchema";

export const MAX_NOTES_CHARS = 20_000;
export const MAX_ANSWER_CHARS = 2_000;

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a valid id");
const tzOffset = z.coerce.number().int().min(-840).max(840).default(0);

export const ingestBodySchema = z.object({
  deckTitle: z.string().trim().min(1, "Give the deck a title").max(120),
  rawText: z
    .string()
    .trim()
    .min(80, "Paste at least a paragraph of notes (80+ characters)")
    .max(MAX_NOTES_CHARS, `Notes are limited to ${MAX_NOTES_CHARS.toLocaleString()} characters`),
});

const attemptFields = {
  cardId: objectId,
  latencyMs: z.coerce.number().int().min(0).max(30 * 60 * 1000),
  tzOffsetMinutes: tzOffset,
  tzName: z.string().max(64).optional(),
  /** Client-generated, so a retried submit replays instead of moving the card twice. */
  attemptId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
  sessionId: z.string().regex(/^[A-Za-z0-9-]{4,64}$/).optional(),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  thinkMs: z.coerce.number().int().min(0).max(30 * 60 * 1000).optional(),
};
const practiceVersion = z.string().regex(/^[sh]:[0-9a-f]{16}$/, "must be a practice version");
const typedAnswer = z.string().max(MAX_ANSWER_CHARS);

export const reviewBodySchema = z.discriminatedUnion("mode", [
  // The original typed-answer payload, kept working: it means "write".
  z.object({ mode: z.literal("answer"), ...attemptFields, answer: typedAnswer }),
  z.object({ mode: z.literal("write"), ...attemptFields, answer: typedAnswer }),
  z.object({ mode: z.literal("voice"), ...attemptFields, answer: typedAnswer }),
  z.object({ mode: z.literal("teach"), ...attemptFields, answer: typedAnswer }),
  z.object({ mode: z.literal("flip"), ...attemptFields, rating: z.enum(SELF_RATINGS) }),
  z.object({ mode: z.literal("listen"), ...attemptFields, rating: z.enum(SELF_RATINGS) }),
  z.object({ mode: z.literal("choice"), ...attemptFields, choice: z.string().trim().min(1).max(300), practiceVersion }),
  z.object({
    mode: z.literal("truefalse"),
    ...attemptFields,
    statementId: z.string().regex(/^[0-9a-f]{8}$/),
    answer: z.boolean(),
    practiceVersion,
  }),
  z.object({ mode: z.literal("cloze"), ...attemptFields, answer: z.string().max(120), practiceVersion }),
  z.object({ mode: z.literal("reveal"), cardId: objectId, tzOffsetMinutes: tzOffset }),
  z.object({ mode: z.literal("explain"), reviewLogId: objectId }),
  z.object({
    mode: z.literal("followup"),
    reviewLogId: objectId,
    answer: z.string().trim().min(1, "Write a reply first").max(MAX_ANSWER_CHARS),
  }),
]);
export type ReviewBody = z.infer<typeof reviewBodySchema>;
export type GradedReviewBody = Exclude<ReviewBody, { mode: "reveal" | "explain" | "followup" }>;

export const studyQuerySchema = z.object({
  mode: z.enum(DEFAULT_MODES).default("auto"),
  size: z
    .union([z.literal("5"), z.literal("10"), z.literal("15"), z.literal("all")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "all" ? ("all" as const) : (Number(v) as 5 | 10 | 15))),
  deck: objectId.optional(),
  tz: tzOffset,
  tzName: z.string().max(64).optional(),
  speech: z.enum(["0", "1"]).default("0"),
});

export const sampleBodySchema = z.object({
  deck: z.enum(["bio", "cs"]),
  tzOffsetMinutes: tzOffset,
});

export const aiKeyBodySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, "That doesn't look like a full API key")
    .max(200, "That doesn't look like an API key")
    .regex(/^[\x21-\x7e]+$/, "API keys don't contain spaces or special characters"),
});

const keyPoint = z.string().trim().min(1).max(240);

export const cardPatchSchema = z
  .object({
    conceptTitle: z.string().trim().min(1).max(120),
    question: z.string().trim().min(3).max(400),
    coreFact: z.string().trim().min(3).max(600),
    expectedKeyPoints: z.array(keyPoint).min(1).max(6),
    suspended: z.boolean(),
    resetProgress: z.literal(true),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

export const deckPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    examDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-14")
      .nullable(),
    examLabel: z.string().trim().max(60),
    tzOffsetMinutes: tzOffset,
    tzName: z.string().max(64).optional(),
  })
  .partial()
  .strict();

export const draftBodySchema = z.object({
  title: z.string().max(120).default(""),
  text: z.string().max(MAX_NOTES_CHARS),
  /** The draft's `updatedAt` this edit started from; a newer one on the server means another device wrote it. */
  baseUpdatedAt: z.string().datetime().nullable().optional(),
  force: z.boolean().optional(),
});
