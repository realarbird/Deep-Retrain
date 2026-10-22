/**
 * Identity-scoped retrieval (RAG) over the learner's own concept graph.
 *
 * Gemma only ever sees concepts the authenticated caller owns:
 *   1. the anchor card must belong to the caller (Auth0 `sub` / demo id),
 *   2. Atlas Vector Search is pre-filtered on `auth0Id`,
 *   3. every hit is re-checked against the session before it reaches a prompt.
 */
import type { Types } from "mongoose";
import { HttpError } from "@/lib/api";
import { cosineSimilarity } from "@/lib/ai/embeddings";
import type { Identity } from "@/lib/identity";
import { ConceptCard } from "@/models/ConceptCard";

export type RetrievalMethod = "atlas-vector-search" | "in-app-cosine" | "none";

export interface RelatedHit {
  _id: Types.ObjectId;
  conceptTitle: string;
  coreFact: string;
  score: number;
}

interface AnchorCard {
  _id: Types.ObjectId;
  auth0Id: string;
  embedding?: number[] | null;
  embeddingModel?: string | null;
}

interface CandidateHit extends RelatedHit {
  auth0Id: string;
}

const MIN_SIMILARITY = 0.2;

export function vectorIndexName(): string {
  return process.env.ATLAS_VECTOR_INDEX?.trim() || "concept_embedding_index";
}

export function assertOwnership(identity: Identity, card: { auth0Id: string }): void {
  if (card.auth0Id !== identity.userId) {
    throw new HttpError(403, "You can only review concepts from your own decks.");
  }
}

/** Drop any hit the caller does not own. Returns the survivors and how many were blocked. */
export function authorizeHits<T extends { auth0Id: string }>(identity: Identity, hits: T[]): { allowed: T[]; blocked: number } {
  const allowed = hits.filter((h) => h.auth0Id === identity.userId);
  const blocked = hits.length - allowed.length;
  if (blocked) console.warn(`[authz] blocked ${blocked} cross-tenant retrieval hit(s) for ${identity.mode} user`);
  return { allowed, blocked };
}

async function atlasVectorSearch(identity: Identity, card: AnchorCard, k: number): Promise<CandidateHit[]> {
  return ConceptCard.aggregate<CandidateHit>([
    {
      $vectorSearch: {
        index: vectorIndexName(),
        path: "embedding",
        queryVector: card.embedding ?? [],
        numCandidates: Math.max(50, k * 20),
        limit: k + 1,
        filter: { auth0Id: { $eq: identity.userId }, embeddingModel: { $eq: card.embeddingModel ?? "" } },
      },
    },
    { $project: { conceptTitle: 1, coreFact: 1, auth0Id: 1, score: { $meta: "vectorSearchScore" } } },
  ]);
}

async function inAppCosine(identity: Identity, card: AnchorCard, k: number): Promise<CandidateHit[]> {
  const pool = await ConceptCard.find({
    auth0Id: identity.userId,
    embeddingModel: card.embeddingModel ?? "",
    _id: { $ne: card._id },
  })
    .select("conceptTitle coreFact auth0Id embedding")
    .limit(500)
    .lean();

  return pool
    .map((c) => ({
      _id: c._id,
      conceptTitle: c.conceptTitle,
      coreFact: c.coreFact,
      auth0Id: c.auth0Id,
      // Vector Search reports cosine as (1 + cos) / 2; match that scale.
      score: (1 + cosineSimilarity(card.embedding ?? [], c.embedding ?? [])) / 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k + 1);
}

export async function findRelatedConcepts(
  identity: Identity,
  card: AnchorCard,
  k = 3,
): Promise<{ concepts: RelatedHit[]; method: RetrievalMethod }> {
  assertOwnership(identity, card);
  if (!card.embedding?.length) return { concepts: [], method: "none" };

  let method: RetrievalMethod = "atlas-vector-search";
  let hits: CandidateHit[] = [];
  try {
    hits = await atlasVectorSearch(identity, card, k);
  } catch (err) {
    console.warn("[retrieval] Atlas Vector Search unavailable, using in-app cosine:", (err as Error).message);
  }
  if (!hits.filter((h) => String(h._id) !== String(card._id)).length) {
    method = "in-app-cosine";
    hits = await inAppCosine(identity, card, k);
  }

  const { allowed } = authorizeHits(identity, hits);
  const concepts = allowed
    .filter((h) => String(h._id) !== String(card._id) && h.score >= (1 + MIN_SIMILARITY) / 2)
    .slice(0, k)
    .map(({ _id, conceptTitle, coreFact, score }) => ({ _id, conceptTitle, coreFact, score }));

  return { concepts, method: concepts.length ? method : "none" };
}
