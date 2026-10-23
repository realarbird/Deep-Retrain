import { z } from "zod";
import type { DifficultyTier } from "@/lib/leitner";

export const EMBEDDING_DIMENSIONS = 384;

export type Engine = "ollama" | "google-ai-studio" | "heuristic";
/** What graded a review: one of the AI engines, the stored answer key, the learner's own rating, or simulated demo history. */
export type LogEngine = Engine | "answer-key" | "self-rated" | "simulated";

export const ENGINE_LABELS: Record<Engine, string> = {
  ollama: "Gemma 4 on Ollama",
  "google-ai-studio": "Gemma 4 with your AI Studio key",
  heuristic: "Offline grader",
};

export const extractedConceptSchema = z.object({
  conceptTitle: z.string().trim().min(1).max(120),
  coreFact: z.string().trim().min(1).max(600),
  initialQuestion: z.string().trim().min(1).max(400),
  expectedKeyPoints: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
});
export type ExtractedConcept = z.infer<typeof extractedConceptSchema>;

export const extractionSchema = z.preprocess(
  // Some models answer with the bare array instead of {"concepts": [...]}.
  (value) => (Array.isArray(value) ? { concepts: value } : value),
  z.object({
    concepts: z.array(extractedConceptSchema).min(1).max(20),
  }),
);

export const evaluationSchema = z.object({
  score: z.coerce.number(),
  feedback: z.string().trim().min(1),
  coveredKeyPoints: z.array(z.string()).default([]),
  missingKeyPoints: z.array(z.string()).default([]),
  analogy: z.string().trim().default(""),
  socraticFollowUp: z.string().trim().default(""),
  nextQuestion: z.string().trim().default(""),
});
export type RawEvaluation = z.infer<typeof evaluationSchema>;

export const followUpReplySchema = z.object({
  reply: z.string().trim().min(1),
});
export type FollowUpReply = z.infer<typeof followUpReplySchema>;

export interface EvaluationCardInput {
  conceptTitle: string;
  coreFact: string;
  expectedKeyPoints: string[];
  currentQuestion: string;
  difficultyTier: DifficultyTier;
}

export interface RelatedConcept {
  conceptTitle: string;
  coreFact: string;
}

/** JSON schemas handed to Ollama's structured-output `format` field. */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          conceptTitle: { type: "string" },
          coreFact: { type: "string" },
          initialQuestion: { type: "string" },
          expectedKeyPoints: { type: "array", items: { type: "string" } },
        },
        required: ["conceptTitle", "coreFact", "initialQuestion", "expectedKeyPoints"],
      },
    },
  },
  required: ["concepts"],
} as const;

export function evaluationJsonSchema(wasFast: boolean) {
  const followUpKey = wasFast ? "nextQuestion" : "socraticFollowUp";
  return {
    type: "object",
    properties: {
      score: { type: "integer" },
      feedback: { type: "string" },
      coveredKeyPoints: { type: "array", items: { type: "string" } },
      missingKeyPoints: { type: "array", items: { type: "string" } },
      analogy: { type: "string" },
      [followUpKey]: { type: "string" },
    },
    required: ["score", "feedback", "coveredKeyPoints", "missingKeyPoints", "analogy", followUpKey],
  };
}

export const FOLLOW_UP_JSON_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" } },
  required: ["reply"],
} as const;

const practiceItemSchema = z
  .object({
    id: z.coerce.string(),
    choice: z
      .object({
        question: z.string().default(""),
        correct: z.string().default(""),
        distractors: z.array(z.string()).default([]),
      })
      .partial()
      .optional(),
    cloze: z
      .object({ sentence: z.string().default(""), answer: z.string().default(""), alternatives: z.array(z.string()).default([]) })
      .partial()
      .optional(),
    trueFalse: z.object({ trueStatement: z.string().default(""), falseStatement: z.string().default("") }).partial().optional(),
    application: z.string().optional(),
    synthesis: z.string().optional(),
  })
  .passthrough();

export const practiceSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { items: value } : value),
  z.object({ items: z.array(practiceItemSchema).max(20) }),
);
export type PracticeBatch = z.infer<typeof practiceSchema>;

export const PRACTICE_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          choice: {
            type: "object",
            properties: {
              question: { type: "string" },
              correct: { type: "string" },
              distractors: { type: "array", items: { type: "string" } },
            },
            required: ["question", "correct", "distractors"],
          },
          cloze: {
            type: "object",
            properties: {
              sentence: { type: "string" },
              answer: { type: "string" },
              alternatives: { type: "array", items: { type: "string" } },
            },
            required: ["sentence", "answer", "alternatives"],
          },
          trueFalse: {
            type: "object",
            properties: { trueStatement: { type: "string" }, falseStatement: { type: "string" } },
            required: ["trueStatement", "falseStatement"],
          },
          application: { type: "string" },
          synthesis: { type: "string" },
        },
        required: ["id", "choice", "cloze", "trueFalse", "application", "synthesis"],
      },
    },
  },
  required: ["items"],
} as const;

export const explainSchema = z.object({ analogy: z.string().trim().min(1) });

export const EXPLAIN_JSON_SCHEMA = {
  type: "object",
  properties: { analogy: { type: "string" } },
  required: ["analogy"],
} as const;
