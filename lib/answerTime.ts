/**
 * How long each card gives you before a right answer counts as slow.
 *
 * Every mode starts from its base time (`MODE_RULES` in lib/leitner.ts). A card
 * then gets buffers on top: thinking time for a harder question, reading time
 * for a long question or long options, and writing or speaking time for a long
 * answer, judged by the words in the card's key points. Buffers only add, so no
 * card gets less than its mode's base. The server works the time out, sends it
 * with the card for the stopwatch, and grades against the same number.
 */
import { MODE_RULES, type DifficultyTier, type StudyMode } from "@/lib/leitner";

/** Time per word past the words the base time already covers. */
interface PerWord {
  free: number;
  msPerWord: number;
}

export interface Buffers {
  /** Thinking time for a harder question. */
  tier: Record<DifficultyTier, number>;
  /** Reading what's on the card: the question, the options, the statement or the sentence. */
  read: PerWord | null;
  /** Writing or saying the answer, per word of the card's key points. */
  answer: PerWord | null;
  /** Typing on a phone or tablet: a flat amount plus time per key-point word. */
  touch: { ms: number; msPerWord: number } | null;
  /** The most a card gets in this mode, before extra time. */
  maxMs: number;
}

const NO_TIER_BUFFER: Record<DifficultyTier, number> = { recall: 0, application: 0, synthesis: 0 };
/** About 240 words a minute. */
const READ_MS_PER_WORD = 250;

export const BUFFERS: Record<Exclude<StudyMode, "listen">, Buffers> = {
  write: {
    tier: { recall: 0, application: 4_000, synthesis: 8_000 },
    read: { free: 12, msPerWord: READ_MS_PER_WORD },
    answer: { free: 10, msPerWord: 1_200 },
    touch: { ms: 0, msPerWord: 400 },
    maxMs: 90_000,
  },
  voice: {
    tier: { recall: 0, application: 4_000, synthesis: 8_000 },
    read: { free: 12, msPerWord: READ_MS_PER_WORD },
    answer: { free: 10, msPerWord: 500 },
    touch: null,
    maxMs: 60_000,
  },
  // The question is the same every time ("explain it to someone new"), so only the answer's length counts.
  teach: {
    tier: NO_TIER_BUFFER,
    read: null,
    answer: { free: 15, msPerWord: 2_500 },
    touch: { ms: 0, msPerWord: 1_000 },
    maxMs: 240_000,
  },
  flip: {
    tier: { recall: 0, application: 3_000, synthesis: 6_000 },
    read: { free: 12, msPerWord: READ_MS_PER_WORD },
    answer: { free: 10, msPerWord: 200 },
    touch: null,
    maxMs: 30_000,
  },
  choice: { tier: NO_TIER_BUFFER, read: { free: 20, msPerWord: READ_MS_PER_WORD }, answer: null, touch: null, maxMs: 30_000 },
  truefalse: { tier: NO_TIER_BUFFER, read: { free: 12, msPerWord: READ_MS_PER_WORD }, answer: null, touch: null, maxMs: 20_000 },
  // The missing word's length stays out of it: the time is shown before you answer, so it mustn't hint.
  cloze: { tier: NO_TIER_BUFFER, read: { free: 15, msPerWord: READ_MS_PER_WORD }, answer: null, touch: { ms: 2_000, msPerWord: 0 }, maxMs: 25_000 },
};

/** Listen sets its own pace, so a harder card just waits longer before the answer is read. */
export const LISTEN_BUFFERS: { tier: Record<DifficultyTier, number>; answer: PerWord; maxMs: number } = {
  tier: { recall: 0, application: 2_000, synthesis: 4_000 },
  answer: { free: 10, msPerWord: 200 },
  maxMs: 8_000,
};

let segmenter: Intl.Segmenter | null | undefined;

/** Words in a piece of text, including languages written without spaces. */
export function wordCount(text: string): number {
  if (segmenter === undefined) segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("en", { granularity: "word" }) : null;
  if (!segmenter) return text.split(/\s+/).filter(Boolean).length;
  let n = 0;
  for (const part of segmenter.segment(text)) if (part.isWordLike) n++;
  return n;
}

function keyPointWords(points: string[]): number {
  return points.reduce((sum, p) => sum + wordCount(p), 0);
}

function perWord(words: number, rule: PerWord | null): number {
  return rule ? Math.max(0, words - rule.free) * rule.msPerWord : 0;
}

/** Scale by the learner's extra time (a percentage), then round up to a whole second. */
function withExtraTime(ms: number, extraTime: number): number {
  return Math.ceil(Math.round(ms * (1 + Math.max(0, extraTime) / 100)) / 1000) * 1000;
}

export interface AnswerTimeInput {
  mode: StudyMode;
  tier: DifficultyTier;
  /** What's on the card before answering: the question, the question and its options, the statement or the sentence. */
  prompt: string;
  expectedKeyPoints: string[];
  /** Typing on a phone or tablet. */
  touch?: boolean;
  /** The learner's "More time on every card" setting, as a percentage. */
  extraTime?: number;
}

/** This card's time in milliseconds: a right answer at or over it counts as slow. Null when the mode sets its own pace. */
export function answerTimeMs({ mode, tier, prompt, expectedKeyPoints, touch = false, extraTime = 0 }: AnswerTimeInput): number | null {
  const base = MODE_RULES[mode].latencyMs;
  if (mode === "listen" || base === null) return null;
  const b = BUFFERS[mode];
  const answerWords = keyPointWords(expectedKeyPoints);
  const buffers =
    b.tier[tier] +
    perWord(wordCount(prompt), b.read) +
    perWord(answerWords, b.answer) +
    (touch && b.touch ? b.touch.ms + b.touch.msPerWord * answerWords : 0);
  return withExtraTime(Math.min(b.maxMs, base + buffers), extraTime);
}

/** Listen: whole seconds added to the learner's pause before the answer is read. */
export function listenExtraSec({ tier, expectedKeyPoints }: Pick<AnswerTimeInput, "tier" | "expectedKeyPoints">): number {
  const ms = LISTEN_BUFFERS.tier[tier] + perWord(keyPointWords(expectedKeyPoints), LISTEN_BUFFERS.answer);
  return Math.ceil(Math.min(LISTEN_BUFFERS.maxMs, ms) / 1000);
}

/** Listen: the whole pause, from the learner's own pause, the card's extra seconds and their extra time. */
export function listenPauseSec(pauseSec: number, extraSec: number, extraTime = 0): number {
  return withExtraTime((pauseSec + extraSec) * 1000, extraTime) / 1000;
}
