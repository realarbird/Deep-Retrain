/**
 * DeepRetain's AI service.
 *
 * Every task runs through a provider chain so the study loop never stalls:
 *   1. Gemini on Google AI Studio, with the signed-in learner's own key
 *   2. Gemma 2 on Ollama (local or self-hosted, OLLAMA_BASE_URL)
 *   3. An offline heuristic engine
 * Each result reports which engine produced it.
 */
import type { z } from "zod";
import { decideOutcome, LATENCY_THRESHOLD_MS, nextTier, type DifficultyTier, type ReviewOutcome } from "@/lib/leitner";
import { GoogleKeyError, googleGenerateJson, type ThinkingLevel } from "@/lib/ai/googleAiStudio";
import { heuristicEvaluate, heuristicExtract, heuristicFollowUpReply, heuristicQuestion } from "@/lib/ai/heuristic";
import { parseModelJson } from "@/lib/ai/json";
import { markOllamaDown, ollamaChatJson, ollamaChatModel, ollamaHasModel } from "@/lib/ai/ollama";
import {
  EXTRACT_SYSTEM,
  FOLLOW_UP_SYSTEM,
  evaluateSystemPrompt,
  evaluateUserPrompt,
  extractUserPrompt,
  followUpUserPrompt,
} from "@/lib/ai/prompts";
import {
  evaluationJsonSchema,
  EXTRACTION_JSON_SCHEMA,
  FOLLOW_UP_JSON_SCHEMA,
  evaluationSchema,
  extractionSchema,
  followUpReplySchema,
  type Engine,
  type EvaluationCardInput,
  type ExtractedConcept,
  type RelatedConcept,
} from "@/lib/ai/types";

const MAX_CONCEPTS = 12;
/** A hosted call that hasn't answered by now is failing; hand over to the next engine. */
const HOSTED_TIMEOUT_MS = 45_000;

interface JsonTask<S extends z.ZodType> {
  name: string;
  system: string;
  user: string;
  jsonSchema: object;
  schema: S;
  timeoutMs: number;
  /** Output token budget for the local model. */
  maxTokens: number;
  /** Reasoning depth for the hosted model: minimal for grading, a little more for one-off extraction. */
  hostedThinking: ThinkingLevel;
}

/** Per-request AI settings. `googleApiKey` is the learner's own key, or null (Demo Mode, or none saved). */
export interface AiOptions {
  googleApiKey?: string | null;
}

function isParseError(err: unknown): boolean {
  const e = err as Error;
  return e?.name === "ZodError" || e instanceof SyntaxError || /no JSON object/.test(e?.message ?? "");
}

async function runJsonTask<S extends z.ZodType>(
  task: JsonTask<S>,
  fallback: () => z.infer<S>,
  { googleApiKey }: AiOptions = {},
): Promise<{ data: z.infer<S>; engine: Engine }> {
  if (googleApiKey) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await googleGenerateJson(task.system, task.user, {
          apiKey: googleApiKey,
          timeoutMs: Math.min(task.timeoutMs, HOSTED_TIMEOUT_MS),
          // Leave headroom for the model's minimal reasoning tokens.
          maxTokens: Math.max(1_024, task.maxTokens * 2),
          jsonSchema: task.jsonSchema,
          thinkingLevel: task.hostedThinking,
        });
        return { data: parseModelJson(raw, task.schema), engine: "google-ai-studio" };
      } catch (err) {
        console.warn(`[ai:${task.name}] Google AI Studio attempt ${attempt + 1} failed:`, (err as Error).message);
        if (err instanceof GoogleKeyError || !isParseError(err)) break;
      }
    }
  }

  if (await ollamaHasModel(ollamaChatModel())) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await ollamaChatJson(task.system, task.user, task.jsonSchema, {
          timeoutMs: task.timeoutMs,
          maxTokens: task.maxTokens,
        });
        return { data: parseModelJson(raw, task.schema), engine: "ollama" };
      } catch (err) {
        console.warn(`[ai:${task.name}] Ollama attempt ${attempt + 1} failed:`, (err as Error).message);
        if (!isParseError(err)) {
          if ((err as Error).name !== "TimeoutError") markOllamaDown();
          break;
        }
      }
    }
  }

  return { data: fallback(), engine: "heuristic" };
}

function ensureQuestionMark(q: string): string {
  const t = q.trim();
  return t.endsWith("?") ? t : `${t.replace(/[.!:;,\s]+$/, "")}?`;
}

function firstSentences(text: string, n: number): string {
  const parts = text.trim().match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [text];
  return parts
    .slice(0, n)
    .map((s) => s.trim())
    .join(" ");
}

function cleanKeyPoints(points: string[]): string[] {
  return points.map((p) => p.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim()).filter(Boolean);
}

function normalizeConcepts(concepts: ExtractedConcept[]): ExtractedConcept[] {
  const seen = new Set<string>();
  const out: ExtractedConcept[] = [];
  for (const c of concepts) {
    const title = c.conceptTitle.trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({
      conceptTitle: title,
      coreFact: c.coreFact.trim(),
      initialQuestion: ensureQuestionMark(c.initialQuestion),
      expectedKeyPoints: cleanKeyPoints(c.expectedKeyPoints).slice(0, 5),
    });
  }
  return out.slice(0, MAX_CONCEPTS);
}

/** Chunk raw lecture notes into atomic flashcards. */
export async function extractConceptsFromNotes(
  rawText: string,
  ai: AiOptions = {},
): Promise<{ concepts: ExtractedConcept[]; engine: Engine }> {
  const { data, engine } = await runJsonTask(
    {
      name: "extract",
      system: EXTRACT_SYSTEM,
      user: extractUserPrompt(rawText),
      jsonSchema: EXTRACTION_JSON_SCHEMA,
      schema: extractionSchema,
      timeoutMs: 180_000,
      maxTokens: 4_000,
      hostedThinking: "low",
    },
    () => ({ concepts: heuristicExtract(rawText) }),
    ai,
  );
  const concepts = normalizeConcepts(data.concepts);
  if (!concepts.length && engine !== "heuristic") {
    return { concepts: normalizeConcepts(heuristicExtract(rawText)), engine: "heuristic" };
  }
  return { concepts, engine };
}

export interface ReviewCardInput extends EvaluationCardInput {
  leitnerBox: number;
}

export interface EvaluationResult {
  score: number;
  feedback: string;
  coveredKeyPoints: string[];
  missingKeyPoints: string[];
  outcome: ReviewOutcome;
  newBox: number;
  nextReviewDate: Date;
  intervalDays: number;
  difficultyTier: DifficultyTier;
  isFast: boolean;
  isAccurate: boolean;
  /** Socratic follow-up — only on hesitation (slow + accurate). */
  followUpQuestion: string | null;
  /** Two-sentence analogy — only on reset (inaccurate). */
  analogy: string | null;
  /** Harder question for the next review — only on promotion. */
  nextQuestion: string | null;
  engine: Engine;
}

/**
 * Grade an answer, combine the score with response latency into a Leitner
 * move, and return only the follow-up material that move calls for.
 */
export async function evaluateAndFollowUp(
  card: ReviewCardInput,
  userAnswer: string,
  latencyMs: number,
  { related = [], now = new Date(), ...ai }: AiOptions & { related?: RelatedConcept[]; now?: Date } = {},
): Promise<EvaluationResult> {
  const targetTier = nextTier(card.leitnerBox);
  const wasFast = latencyMs < LATENCY_THRESHOLD_MS;
  const { data, engine } = await runJsonTask(
    {
      name: "evaluate",
      system: evaluateSystemPrompt(targetTier, related, wasFast),
      user: evaluateUserPrompt(card, userAnswer, latencyMs),
      jsonSchema: evaluationJsonSchema(wasFast),
      schema: evaluationSchema,
      timeoutMs: 90_000,
      maxTokens: 700,
      hostedThinking: "minimal",
    },
    () => heuristicEvaluate(card, userAnswer, related, targetTier),
    ai,
  );

  const score = Math.round(Math.min(100, Math.max(0, Number.isFinite(data.score) ? data.score : 0)));
  const decision = decideOutcome({ score, latencyMs, box: card.leitnerBox, now });
  const fallback = heuristicEvaluate(card, userAnswer, related, targetTier);

  return {
    score,
    feedback: data.feedback,
    coveredKeyPoints: cleanKeyPoints(data.coveredKeyPoints),
    missingKeyPoints: cleanKeyPoints(data.missingKeyPoints),
    ...decision,
    followUpQuestion:
      decision.outcome === "hesitation" ? ensureQuestionMark(data.socraticFollowUp || fallback.socraticFollowUp) : null,
    analogy: decision.outcome === "reset" ? firstSentences(data.analogy || fallback.analogy, 2) : null,
    nextQuestion:
      decision.outcome === "promote"
        ? ensureQuestionMark(data.nextQuestion || heuristicQuestion(card.conceptTitle, targetTier, related))
        : null,
    engine,
  };
}

/** Short Socratic reply to the learner's answer to a follow-up question. No box change. */
export async function replyToFollowUp(
  card: Pick<EvaluationCardInput, "conceptTitle" | "coreFact">,
  followUpQuestion: string,
  answer: string,
  ai: AiOptions = {},
): Promise<{ reply: string; engine: Engine }> {
  const { data, engine } = await runJsonTask(
    {
      name: "follow-up",
      system: FOLLOW_UP_SYSTEM,
      user: followUpUserPrompt(card, followUpQuestion, answer),
      jsonSchema: FOLLOW_UP_JSON_SCHEMA,
      schema: followUpReplySchema,
      timeoutMs: 60_000,
      maxTokens: 250,
      hostedThinking: "minimal",
    },
    () => heuristicFollowUpReply(card, answer),
    ai,
  );
  return { reply: firstSentences(data.reply, 2), engine };
}

/** Which engine would handle the next request (for the UI badge). */
export async function activeEngine({ googleApiKey }: AiOptions = {}): Promise<Engine> {
  if (googleApiKey) return "google-ai-studio";
  if (await ollamaHasModel(ollamaChatModel())) return "ollama";
  return "heuristic";
}
