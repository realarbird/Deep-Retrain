/**
 * Offline fallback engine. Used when neither the hosted model nor Ollama is
 * reachable, so the review loop never stalls during a demo. It is deliberately
 * simple: lexical key-point coverage, not semantic understanding.
 */
import { ACCURACY_THRESHOLD, type DifficultyTier } from "@/lib/leitner";
import type { EvaluationCardInput, ExtractedConcept, FollowUpReply, RawEvaluation, RelatedConcept } from "./types";

const MAX_CONCEPTS = 12;
const KEY_POINT_COVERED = 0.5;

const STOPWORDS = new Set(
  (
    "a an and are as at be been being but by can could did do does doing for from had has have having he her his how i if in into is it its " +
    "itself me more most my no nor not of off on once only or other our out over own same she should so some such than that the their them " +
    "then there these they this those through to too under until up very was we were what when where which while who whom why will with " +
    "would you your also each just about above after again against all any because before below between both down during few further here " +
    "let lets per via etc ie eg"
  ).split(" "),
);

export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (/(ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) w = w.slice(0, -1);
  if (w.endsWith("e") && w.length > 3) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t)).map(stem);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim())
    .filter((s) => s.split(/\s+/).length >= 3);
}

function clipWords(text: string, max: number): string {
  const words = text.split(/\s+/);
  return words.length <= max ? text : `${words.slice(0, max).join(" ")}…`;
}

function stripEndPunctuation(text: string): string {
  return text.replace(/[\s.!?;:,]+$/, "");
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Two most frequent content words, in order of first appearance, title-cased. */
function deriveTitle(text: string): string {
  const words = text.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
  const freq = new Map<string, { count: number; first: number; surface: string }>();
  words.forEach((surface, i) => {
    const lower = surface.toLowerCase();
    if (STOPWORDS.has(lower) || lower.length < 3) return;
    const key = stem(lower);
    const entry = freq.get(key);
    if (entry) entry.count++;
    else freq.set(key, { count: 1, first: i, surface });
  });
  const top = [...freq.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, 2)
    .sort((a, b) => a.first - b.first);
  if (!top.length) return "Untitled Concept";
  return top.map((t) => t.surface.charAt(0).toUpperCase() + t.surface.slice(1)).join(" ");
}

interface Section {
  title: string | null;
  body: string;
}

function splitSections(raw: string): Section[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const sections: Section[] = [];
  let current: Section = { title: null, body: "" };
  for (const line of lines) {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      sections.push(current);
      current = { title: heading[1].replace(/[*_`]/g, "").trim(), body: "" };
    } else {
      current.body += `${line}\n`;
    }
  }
  sections.push(current);

  const result: Section[] = [];
  for (const s of sections) {
    if (s.title) {
      result.push(s);
    } else {
      // Heading-less text: every paragraph becomes its own concept.
      for (const para of s.body.split(/\n\s*\n/)) {
        if (para.trim()) result.push({ title: null, body: para });
      }
    }
  }
  return result.filter((s) => s.body.trim().split(/\s+/).length >= 6);
}

function deriveKeyPoints(sentenceList: string[], body: string): string[] {
  let points = sentenceList.slice(0, 4).map((s) => stripEndPunctuation(clipWords(s, 16)));
  if (points.length < 2 && points.length === 1) {
    const clauses = points[0]
      .split(/,|;|\band\b/)
      .map((c) => c.trim())
      .filter((c) => c.split(/\s+/).length >= 3);
    if (clauses.length >= 2) points = clauses.slice(0, 4);
  }
  if (points.length < 2) {
    const terms = [...new Set(tokenize(body))].slice(0, 3);
    points.push(`Key terms: ${terms.join(", ")}`);
  }
  return points.slice(0, 5);
}

export function heuristicExtract(rawText: string): ExtractedConcept[] {
  return splitSections(rawText)
    .slice(0, MAX_CONCEPTS)
    .map((section) => {
      const sentenceList = sentences(section.body);
      const title = section.title ?? deriveTitle(section.body);
      const coreFact = clipWords(sentenceList.slice(0, 2).join(" ") || section.body.trim(), 60);
      return {
        conceptTitle: clipWords(title, 10),
        coreFact,
        initialQuestion: `Explain ${title} in your own words: what is the core idea, and how does it work?`,
        expectedKeyPoints: deriveKeyPoints(sentenceList, section.body),
      };
    });
}

function coverage(keyPoint: string, answerTokens: Set<string>): number {
  const kp = [...new Set(tokenize(keyPoint).filter((t) => t !== "key" && t !== "term"))];
  if (!kp.length) return 1;
  return kp.filter((t) => answerTokens.has(t)).length / kp.length;
}

const NEXT_TIER: Record<DifficultyTier, DifficultyTier> = {
  recall: "application",
  application: "synthesis",
  synthesis: "synthesis",
};

export function heuristicQuestion(title: string, tier: DifficultyTier, related: RelatedConcept[]): string {
  if (tier === "recall") return `What is ${title}, and what are its essential parts?`;
  if (tier === "application")
    return `Apply it: describe a real situation where ${title} explains what you observe — what would you predict happens next?`;
  if (related.length)
    return `How does ${title} connect to ${related[0].conceptTitle}, and what would happen to one if the other failed?`;
  return `Compare ${title} with a related idea you know: what do they share, and where do they differ?`;
}

export function heuristicEvaluate(
  card: EvaluationCardInput,
  answer: string,
  related: RelatedConcept[],
  targetTier: DifficultyTier = NEXT_TIER[card.difficultyTier],
): RawEvaluation {
  const answerTokens = new Set(tokenize(answer));
  const scored = card.expectedKeyPoints.map((kp) => ({ kp, cov: coverage(kp, answerTokens) }));

  let score = scored.length
    ? Math.round((scored.reduce((sum, s) => sum + Math.min(1, s.cov / 0.75), 0) / scored.length) * 100)
    : 0;
  if (answer.trim().split(/\s+/).length < 4) score = Math.min(score, 40);

  const covered = scored.filter((s) => s.cov >= KEY_POINT_COVERED).map((s) => s.kp);
  const missing = scored.filter((s) => s.cov < KEY_POINT_COVERED).map((s) => s.kp);
  const weakest = [...scored].sort((a, b) => a.cov - b.cov)[0]?.kp ?? card.coreFact;
  const firstFact = stripEndPunctuation(card.coreFact.split(/(?<=[.!?])\s+/)[0] ?? card.coreFact);

  const feedback =
    score >= ACCURACY_THRESHOLD
      ? `Solid recall — you covered ${covered.length} of ${scored.length} key points.`
      : missing.length
        ? `You're on the way, but you missed: ${missing.slice(0, 2).join("; ")}.`
        : "Your answer is in the right area but too thin to show real understanding.";

  return {
    score,
    feedback,
    coveredKeyPoints: covered,
    missingKeyPoints: missing,
    analogy: `Think of ${card.conceptTitle} as a recipe: ${lowerFirst(firstFact)}. If you keep only one ingredient in mind, keep this one: ${lowerFirst(stripEndPunctuation(weakest))}.`,
    socraticFollowUp: `Socratic check: why is it true that ${lowerFirst(stripEndPunctuation(weakest))} — and what would break if it weren't?`,
    nextQuestion: heuristicQuestion(card.conceptTitle, targetTier, related),
  };
}

export function heuristicFollowUpReply(
  card: Pick<EvaluationCardInput, "conceptTitle" | "coreFact">,
  answer: string,
): FollowUpReply {
  const factTokens = new Set(tokenize(card.coreFact));
  const answerTokens = tokenize(answer);
  const overlap = answerTokens.filter((t) => factTokens.has(t)).length / Math.max(1, factTokens.size);
  return {
    reply:
      overlap >= 0.3
        ? `Good — that ties back to the core of ${card.conceptTitle}: ${card.coreFact}`
        : `Close. Anchor your reasoning to the core of ${card.conceptTitle}: ${card.coreFact}`,
  };
}
