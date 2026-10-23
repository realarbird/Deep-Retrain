import { EMBEDDING_DIMENSIONS } from "./types";
import { tokenize } from "./heuristic";
import { markOllamaDown, ollamaEmbed, ollamaEmbedModel, ollamaHasModel } from "./ollama";

export const HASH_EMBEDDING_MODEL = "hash-384-v1";

export interface EmbeddingBatch {
  vectors: number[][];
  model: string;
}

export function embeddingText(c: { conceptTitle: string; coreFact: string; expectedKeyPoints?: string[] }): string {
  return [c.conceptTitle, c.coreFact, ...(c.expectedKeyPoints ?? [])].join(". ");
}

function fnv1a(text: string, seed = 0x811c9dc5): number {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm ? v.map((x) => x / norm) : v;
}

/**
 * Deterministic 384-dim feature-hashing embedding (unigrams + bigrams).
 * Lexical, not semantic: the offline fallback when no embedding model is up.
 */
export function hashEmbedding(text: string, dims = EMBEDDING_DIMENSIONS): number[] {
  const v = new Array<number>(dims).fill(0);
  const tokens = tokenize(text);
  const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)];
  for (const f of features) {
    const h = fnv1a(f);
    const sign = fnv1a(f, 0x9747b28c) & 1 ? 1 : -1;
    v[h % dims] += sign * (f.includes("_") ? 0.5 : 1);
  }
  return l2normalize(v);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Embed with Ollama `all-minilm` (384-dim) when available, else feature hashing. */
export async function embedTexts(texts: string[]): Promise<EmbeddingBatch> {
  if (!texts.length) return { vectors: [], model: HASH_EMBEDDING_MODEL };

  const model = ollamaEmbedModel();
  if (await ollamaHasModel(model)) {
    try {
      const vectors = await ollamaEmbed(texts);
      if (vectors.every((v) => v.length === EMBEDDING_DIMENSIONS)) {
        return { vectors: vectors.map(l2normalize), model: `ollama:${model}` };
      }
      console.warn(`[embeddings] ${model} returned ${vectors[0]?.length} dims, expected ${EMBEDDING_DIMENSIONS}; using hashing`);
    } catch (err) {
      console.warn("[embeddings] Ollama embed failed, using hashing:", (err as Error).message);
      markOllamaDown();
    }
  }
  return { vectors: texts.map((t) => hashEmbedding(t)), model: HASH_EMBEDDING_MODEL };
}
