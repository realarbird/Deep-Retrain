/**
 * Practice items for the quick study modes: multiple choice, fill the gap,
 * and true or false.
 *
 * Gemma writes them (`generatePractice` in lib/engine.ts) and they are stored
 * on the card with a hash of the card's text, so editing a card retires them.
 * Until they exist, deterministic heuristics build items from the card and its
 * deck mates. Those keep no state: the server rebuilds the same item to grade.
 */
import { z } from "zod";
import { plainProse } from "@/lib/ai/prose";
import { STOPWORDS, stem } from "@/lib/ai/heuristic";
import { isKeyTerm, isTermPhrase, keyTermCandidates, keyTermPattern } from "@/lib/keyTerms";
import type { DifficultyTier } from "@/lib/leitner";

export const PRACTICE_VERSION = 2;
export const BLANK = "____";

export interface PracticeCard {
  _id: unknown;
  conceptTitle: string;
  coreFact: string;
  expectedKeyPoints: string[];
  practice?: unknown;
}

export interface Sibling {
  conceptTitle: string;
  coreFact: string;
}

const choiceSchema = z.object({
  question: z.string().trim().min(1).max(800),
  options: z.array(z.string().trim().min(1).max(300)).length(4),
  answerIndex: z.number().int().min(0).max(3),
});
const clozeSchema = z.object({
  text: z.string().trim().min(1).max(900),
  answers: z.array(z.string().trim().min(1).max(80)).min(1).max(5),
});
const trueFalseSchema = z.object({
  statements: z.tuple([z.string().trim().min(1).max(700), z.string().trim().min(1).max(700)]),
  trueIndex: z.union([z.literal(0), z.literal(1)]),
});
const questionsSchema = z.object({
  application: z.string().trim().min(1).max(400).optional(),
  synthesis: z.string().trim().min(1).max(400).optional(),
});

export const storedPracticeSchema = z.object({
  v: z.literal(PRACTICE_VERSION),
  engine: z.string(),
  sourceHash: z.string(),
  choice: choiceSchema.optional(),
  cloze: clozeSchema.optional(),
  trueFalse: trueFalseSchema.optional(),
  questions: questionsSchema.optional(),
});

export type ChoicePractice = z.infer<typeof choiceSchema>;
export type ClozePractice = z.infer<typeof clozeSchema>;
export type TrueFalsePractice = z.infer<typeof trueFalseSchema>;
export type StoredPractice = z.infer<typeof storedPracticeSchema>;
export type PracticeParts = Omit<StoredPractice, "v" | "engine" | "sourceHash">;

// ── Hashing ──────────────────────────────────────────────────────────────

function fnv(text: string, seed = 0x811c9dc5): number {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function shortHash(text: string): string {
  return fnv(text).toString(16).padStart(8, "0");
}

/** Changes when card content or the practice algorithm changes. */
export function cardSourceHash(card: Pick<PracticeCard, "conceptTitle" | "coreFact" | "expectedKeyPoints">): string {
  const text = [`practice-v${PRACTICE_VERSION}`, card.conceptTitle, card.coreFact, ...(card.expectedKeyPoints ?? [])].join("␟");
  return shortHash(text) + fnv(text, 0x9747b28c).toString(16).padStart(8, "0");
}

/** Stored practice, if it is valid and was written for the card as it reads now. */
export function storedPractice(card: PracticeCard): StoredPractice | null {
  const parsed = storedPracticeSchema.safeParse(card.practice);
  if (!parsed.success) return null;
  if (parsed.data.sourceHash !== cardSourceHash(card)) return null;
  const { cloze, engine } = parsed.data;
  if (cloze && (!isKeyTerm(cloze.answers[0], card, engine === "curated") || !cloze.answers.every((answer) => isTermPhrase(answer, engine === "curated")) || !validCloze(cloze.text, cloze.answers))) return null;
  return parsed.data;
}

/** Sent with each study item and checked when grading, so an edited card is caught. */
export function practiceVersion(card: PracticeCard): string {
  return `${storedPractice(card) ? "s" : "h"}:${cardSourceHash(card)}`;
}

/** Deterministic shuffle: the same card always gets the same order. */
function rankBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => fnv(key(a)) - fnv(key(b)) || key(a).localeCompare(key(b)));
}

// ── Masking ─────────────────────────────────────────────────────────────

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(term: string, flags = "gi"): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?:'s|es|s)?(?![A-Za-z0-9])`, flags);
}

/** The words that would give a concept away: its full title and its distinctive words. */
export function titleTerms(title: string): string[] {
  const words = title.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? [];
  const distinctive = words.filter((w) => {
    const lower = w.toLowerCase();
    if (STOPWORDS.has(lower) || lower === "vs") return false;
    return w.length >= 4 || (w.length >= 2 && w === w.toUpperCase());
  });
  return [...new Set([title.trim(), ...distinctive])].filter(Boolean).sort((a, b) => b.length - a.length);
}

export function maskTerms(text: string, terms: string[]): string {
  let out = text;
  for (const term of terms) out = out.replace(termPattern(term), BLANK);
  return out.replace(new RegExp(`${BLANK}(?:\\s+${BLANK})+`, "g"), BLANK);
}

// ── Multiple choice ─────────────────────────────────────────────────────

/** "Which concept is this?" with the fact as the clue and deck titles as options. Needs three deck mates. */
export function heuristicChoice(card: PracticeCard, siblings: Sibling[]): ChoicePractice | null {
  const title = card.conceptTitle.trim();
  const seen = new Set([title.toLowerCase()]);
  const others: string[] = [];
  for (const s of siblings) {
    const t = s.conceptTitle.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    others.push(t);
  }
  if (others.length < 3) return null;

  const id = String(card._id);
  const distractors = rankBy(others, (t) => `${id}|${t}`).slice(0, 3);
  const options = rankBy([title, ...distractors], (t) => `${id}#${t}`);
  const clue = maskTerms(card.coreFact, titleTerms(title));
  return { question: `Which concept is this?\n“${clue}”`, options, answerIndex: options.indexOf(title) };
}

// ── Fill the gap ────────────────────────────────────────────────────────

/** Only confidently identified terms are eligible for the offline fallback. */
export function pickClozeTerm(card: Pick<PracticeCard, "conceptTitle" | "coreFact" | "expectedKeyPoints">): string | null {
  return keyTermCandidates(card)[0] ?? null;
}

export function heuristicCloze(card: PracticeCard, preferredTerms: string[] = []): ClozePractice | null {
  const term =
    preferredTerms.find((t) => isKeyTerm(t, card, true) && [...card.coreFact.matchAll(keyTermPattern(t))].length === 1) ?? pickClozeTerm(card);
  if (!term) return null;
  const text = card.coreFact.replace(keyTermPattern(term), BLANK);
  return validCloze(text, [term]) ? { text, answers: [term] } : null;
}

function validCloze(text: string, answers: string[]): boolean {
  return text.split(BLANK).length === 2 && Boolean(text.replace(BLANK, "").trim()) && answers.every((answer) => !keyTermPattern(answer, "iu").test(text));
}

/** Lower-case, accents and punctuation stripped, leading article dropped. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(?:the|a|an)\s+/, "");
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

export type TermMatch = "exact" | "stem" | "typo" | "wrong";

/** Ordinary words allow small typos; acronyms, numbers and symbols must be exact. */
export function fuzzyTermMatch(given: string, expected: string): TermMatch {
  const g = normalizeAnswer(given);
  const e = normalizeAnswer(expected);
  if (!g || !e) return "wrong";
  // A hyphen used to join words is ordinary punctuation, but charges and formula operators carry meaning.
  const formulaSymbols = (s: string) => s.normalize("NFKC").replace(/−/g, "-").replace(/(?<=\p{L})-(?=\p{L})/gu, "").match(/[+\-=^/]/g)?.join("") ?? "";
  if (formulaSymbols(given) !== formulaSymbols(expected)) return "wrong";
  if (g === e) return "exact";
  if (/\d/.test(e) || /\d/.test(g)) return "wrong";
  const gt = g.split(" ");
  const et = e.split(" ");
  const protectedTokens = expected.match(/\b[A-Z]{2,}\b/g) ?? [];
  if (protectedTokens.some((token) => !gt.includes(token.toLowerCase()))) return "wrong";
  if (e.length <= 3 || formulaSymbols(expected)) return "wrong";
  if (gt.length === et.length && gt.every((t, i) => stem(t) === stem(et[i]))) return "stem";
  return levenshtein(g, e) <= (e.length <= 5 ? 1 : 2) ? "typo" : "wrong";
}

const MATCH_SCORE: Record<TermMatch, number> = { exact: 100, stem: 95, typo: 85, wrong: 0 };

export function gradeCloze(cloze: ClozePractice, given: string): { score: number; match: TermMatch; expected: string } {
  let best: { score: number; match: TermMatch } = { score: 0, match: "wrong" };
  for (const answer of cloze.answers) {
    const match = fuzzyTermMatch(given, answer);
    if (MATCH_SCORE[match] > best.score) best = { score: MATCH_SCORE[match], match };
  }
  return { ...best, expected: cloze.answers[0] };
}

// ── True or false ───────────────────────────────────────────────────────

/** The fact itself, and a deck mate's fact with that concept's name swapped for this one. */
export function heuristicTrueFalse(card: PracticeCard, siblings: Sibling[], falseStatement?: string | null): TrueFalsePractice | null {
  const title = card.conceptTitle.trim();
  if (falseStatement?.trim()) return { statements: [card.coreFact, falseStatement.trim()], trueIndex: 0 };

  const candidates = siblings.filter(
    (s) => s.conceptTitle.trim().toLowerCase() !== title.toLowerCase() && termPattern(s.conceptTitle.trim(), "i").test(s.coreFact),
  );
  if (!candidates.length) return null;
  const pick = rankBy(candidates, (s) => `${String(card._id)}~${s.conceptTitle}`)[0];
  const swapped = pick.coreFact.replace(termPattern(pick.conceptTitle.trim(), "i"), title);
  if (normalizeAnswer(swapped) === normalizeAnswer(card.coreFact)) return null;
  return { statements: [card.coreFact, swapped], trueIndex: 0 };
}

export function statementId(statement: string): string {
  return shortHash(statement.trim());
}

/** Alternates between the true and the false statement from one review to the next. */
export function pickStatement(card: PracticeCard & { reviewCount?: number | null }, tf: TrueFalsePractice): { statement: string; statementId: string } {
  const index = fnv(`${String(card._id)}:${card.reviewCount ?? 0}`) % 2;
  const statement = tf.statements[index];
  return { statement, statementId: statementId(statement) };
}

export function gradeTrueFalse(tf: TrueFalsePractice, id: string, answer: boolean): { correct: boolean; statement: string; isTrue: boolean } | null {
  const index = tf.statements.findIndex((s) => statementId(s) === id);
  if (index < 0) return null;
  const isTrue = index === tf.trueIndex;
  return { correct: isTrue === answer, statement: tf.statements[index], isTrue };
}

// ── Resolution ─────────────────────────────────────────────────────────

export interface CuratedExtras {
  clozeTerms?: string[];
  falseStatement?: string | null;
}

export interface ResolvedPractice {
  choice: ChoicePractice | null;
  cloze: ClozePractice | null;
  trueFalse: TrueFalsePractice | null;
  source: "stored" | "heuristic";
}

/**
 * The practice items a card can use right now. `useStored: false` rebuilds the
 * heuristic items (used when a study item was served before Gemma's arrived).
 */
export function resolvePractice(
  card: PracticeCard,
  siblings: Sibling[],
  { useStored = true }: { useStored?: boolean } = {},
): ResolvedPractice {
  const stored = useStored ? storedPractice(card) : null;
  return {
    choice: stored?.choice ?? heuristicChoice(card, siblings),
    cloze: stored?.cloze ?? heuristicCloze(card),
    trueFalse: stored?.trueFalse ?? heuristicTrueFalse(card, siblings),
    source: stored ? "stored" : "heuristic",
  };
}

export function gradeChoice(choice: ChoicePractice, given: string): { correct: boolean; correctText: string } {
  const correctText = choice.options[choice.answerIndex];
  return { correct: given.trim() === correctText.trim(), correctText };
}

/** A stored question for the tier a card just moved into, if Gemma (or the sample deck) wrote one. */
export function practiceQuestion(card: PracticeCard, tier: DifficultyTier): string | null {
  if (tier === "recall") return null;
  return storedPractice(card)?.questions?.[tier] ?? null;
}

// ── Gemma output ───────────────────────────────────────────────────────

export interface RawPracticeItem {
  id?: string;
  choice?: { question?: string; correct?: string; distractors?: string[] };
  cloze?: { sentence?: string; answer?: string; alternatives?: string[] };
  trueFalse?: { trueStatement?: string; falseStatement?: string };
  application?: string;
  synthesis?: string;
}

function ensureQuestionMark(q: string): string {
  const t = q.trim();
  return t.endsWith("?") ? t : `${t.replace(/[.!:;,\s]+$/, "")}?`;
}

function clean(text: unknown, max: number): string {
  return typeof text === "string" ? plainProse(text).slice(0, max).trim() : "";
}

/** Keep the parts of a model-written item that pass basic checks, drop the rest. */
export function normalizePracticeItem(raw: RawPracticeItem, card: PracticeCard): PracticeParts {
  const out: PracticeParts = {};
  const id = String(card._id);

  const question = clean(raw.choice?.question, 400);
  const correct = clean(raw.choice?.correct, 300);
  if (question && correct) {
    const seen = new Set([normalizeAnswer(correct)]);
    const distractors: string[] = [];
    for (const d of raw.choice?.distractors ?? []) {
      const text = clean(d, 300);
      const key = normalizeAnswer(text);
      if (!text || seen.has(key) || /all of the above|none of the above/i.test(text)) continue;
      seen.add(key);
      distractors.push(text);
    }
    if (distractors.length >= 3) {
      const options = rankBy([correct, ...distractors.slice(0, 3)], (t) => `${id}#${t}`);
      out.choice = { question: ensureQuestionMark(question), options, answerIndex: options.indexOf(correct) };
    }
  }

  const answer = clean(raw.cloze?.answer, 80);
  let sentence = clean(raw.cloze?.sentence, 900).replace(/_{2,}/g, BLANK);
  if (answer && sentence && !sentence.includes(BLANK)) sentence = sentence.replace(keyTermPattern(answer, "iu"), BLANK);
  if (isKeyTerm(answer, card) && validCloze(sentence, [answer])) {
    const seen = new Set([normalizeAnswer(answer)]);
    const alternatives = (raw.cloze?.alternatives ?? []).map((a) => clean(a, 80)).filter((a) => {
      const key = normalizeAnswer(a);
      if (!isTermPhrase(a) || seen.has(key) || keyTermPattern(a, "iu").test(sentence)) return false;
      seen.add(key);
      return true;
    });
    out.cloze = { text: sentence, answers: [answer, ...alternatives].slice(0, 5) };
  }

  const t = clean(raw.trueFalse?.trueStatement, 700);
  const f = clean(raw.trueFalse?.falseStatement, 700);
  if (t && f && normalizeAnswer(t) !== normalizeAnswer(f)) out.trueFalse = { statements: [t, f], trueIndex: 0 };

  const application = clean(raw.application, 400);
  const synthesis = clean(raw.synthesis, 400);
  if (application || synthesis) {
    out.questions = {
      ...(application ? { application: ensureQuestionMark(application) } : {}),
      ...(synthesis ? { synthesis: ensureQuestionMark(synthesis) } : {}),
    };
  }
  return out;
}

export function toStoredPractice(card: PracticeCard, parts: PracticeParts, engine: string): StoredPractice {
  return { v: PRACTICE_VERSION, engine, sourceHash: cardSourceHash(card), ...parts };
}
