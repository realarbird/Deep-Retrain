/** Conservative, source-backed term selection for practice questions. Server only. */
import nlp from "compromise";
import { STOPWORDS } from "@/lib/ai/heuristic";

interface TermSource {
  conceptTitle: string;
  coreFact: string;
  expectedKeyPoints: string[];
}

const GENERIC = new Set(
  ("thing things something anything everything concept concepts topic topics idea ideas fact facts point points term terms keyword keywords " +
    "important main different certain several many much example examples information material stuff way ways part parts " +
    "fought fight fights happened happens happen made make makes used use uses worked work works").split(" "),
);

/** Literal term boundaries also protect chemical symbols and hyphenated words. */
export function keyTermPattern(term: string, flags = "giu"): RegExp {
  const literal = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}+−-])${literal}(?:['’]s|es|s)?(?![\\p{L}\\p{N}+−-])`, flags);
}

const nounTerms = new Map<string, boolean>();

export function isTermPhrase(term: string, curated = false): boolean {
  if (!term || term.length > 80 || term.split(/\s+/).length > 4 || !/^[\p{L}\p{N}][\p{L}\p{N}\s'’+−\-/.^()]*$/u.test(term)) return false;
  const words = term.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const content = words.filter((w) => !STOPWORDS.has(w) && !GENERIC.has(w));
  if (!content.length || (words.some((w) => GENERIC.has(w)) && content.every((w) => /^\d+$/.test(w)))) return false;
  if (curated) return true;

  const cached = nounTerms.get(term);
  if (cached !== undefined) return cached;
  const parsed = nlp(term);
  const valid = !parsed.has("#Verb") && !parsed.has("#Pronoun") && parsed.has("(#Noun|#Date|#Value)");
  if (nounTerms.size >= 512) nounTerms.delete(nounTerms.keys().next().value!);
  nounTerms.set(term, valid);
  return valid;
}

/** Curated terms can include specialist adjectives the general parser doesn't know. */
export function isKeyTerm(term: string, card: TermSource, curated = false): boolean {
  return isTermPhrase(term, curated) && [card.conceptTitle, card.coreFact, ...card.expectedKeyPoints].some((text) => keyTermPattern(term, "iu").test(text));
}

const candidates = new Map<string, string[]>();

/** No arbitrary noun/longest-word fallback: prefer explicit terms, titles, then entities. */
export function keyTermCandidates(card: TermSource): string[] {
  const cacheKey = JSON.stringify([card.conceptTitle, card.coreFact, card.expectedKeyPoints]);
  const cached = candidates.get(cacheKey);
  if (cached) return cached;
  const explicit = card.expectedKeyPoints.flatMap((point) => {
    const match = point.match(/^(?:key\s*terms?|keywords?|terms?)\s*:\s*(.+)$/i);
    return match ? match[1].split(/[,;]/).map((t) => t.trim()) : [];
  });
  const title = card.conceptTitle.trim();
  const parsed = nlp(card.coreFact);
  const entities: string[] = ["#ProperNoun+", "#Acronym", "#Date+"].flatMap((pattern) => parsed.match(pattern).out("array"))
    .map((term) => term.replace(/^[\s"'“‘]+|[\s.,;:!?"'”’]+$/g, ""));
  const points = card.expectedKeyPoints.join("\n");
  const terms = [...new Set([...explicit, title, ...entities])].filter((term) =>
    isKeyTerm(term, card, explicit.includes(term)) &&
    (term === title || explicit.includes(term) || keyTermPattern(term, "iu").test(points)) &&
    [...card.coreFact.matchAll(keyTermPattern(term))].length === 1,
  );
  if (candidates.size >= 128) candidates.delete(candidates.keys().next().value!);
  candidates.set(cacheKey, terms);
  return terms;
}
