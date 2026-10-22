import { z } from "zod";

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

export const reviewBodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("answer"),
    cardId: objectId,
    answer: z.string().max(MAX_ANSWER_CHARS),
    latencyMs: z.coerce.number().int().min(0).max(30 * 60 * 1000),
    tzOffsetMinutes: tzOffset,
  }),
  z.object({
    mode: z.literal("followup"),
    reviewLogId: objectId,
    answer: z.string().trim().min(1, "Write a reply first").max(MAX_ANSWER_CHARS),
  }),
]);

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
