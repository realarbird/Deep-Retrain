import type { Types } from "mongoose";
import { embedTexts, embeddingText } from "@/lib/ai/embeddings";
import type { Identity } from "@/lib/identity";
import { decideOutcome, intervalForBox, tierForBox, type DifficultyTier } from "@/lib/leitner";
import { localDayBounds } from "@/lib/pacer";
import { SAMPLE_DECKS, type SampleConcept, type SampleDeckKey } from "@/lib/sampleDeckData";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 21;

/** Boxes for the 10 sample cards: the first six are due right away so the arena has work. */
const BOX_PLAN = [1, 1, 2, 1, 3, 2, 2, 3, 4, 5];
const DUE_NOW = 6;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function questionForTier(concept: SampleConcept, tier: DifficultyTier): string {
  if (tier === "application") return concept.applicationQuestion;
  if (tier === "synthesis") return concept.synthesisQuestion;
  return concept.initialQuestion;
}

interface SimulatedReview {
  cardIndex: number;
  reviewedAt: Date;
  latencyMs: number;
  score: number;
}

/**
 * Three weeks of simulated practice: recall speeds up from ~18s toward ~8s and
 * accuracy climbs, so the dashboard has a trend to show. Every log is flagged
 * `simulated: true` and is excluded from the daily cap.
 */
function simulateHistory(key: SampleDeckKey, now: Date, tzOffsetMinutes: number): SimulatedReview[] {
  const rand = mulberry32(key === "bio" ? 1337 : 4242);
  const todayStart = localDayBounds(now, tzOffsetMinutes).start;
  const reviews: SimulatedReview[] = [];

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
    if (rand() < 0.12) continue; // a few rest days look realistic
    const progress = (HISTORY_DAYS - daysAgo) / (HISTORY_DAYS - 1);
    const dayStart = todayStart.getTime() - daysAgo * DAY_MS;
    const count = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const latencySeconds = Math.max(3.5, 18 - 10 * progress + (rand() - 0.5) * 6);
      const score = Math.round(Math.min(100, Math.max(25, 62 + 30 * progress + (rand() - 0.5) * 30)));
      reviews.push({
        cardIndex: Math.floor(rand() * BOX_PLAN.length),
        reviewedAt: new Date(dayStart + (9 + rand() * 12) * 3_600_000),
        latencyMs: Math.round(latencySeconds * 1000),
        score,
      });
    }
  }
  return reviews.sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
}

async function removeSampleDeck(identity: Identity, key: SampleDeckKey): Promise<void> {
  const decks = await StudyDeck.find({ auth0Id: identity.userId, sampleKey: key }).select("_id").lean();
  const deckIds = decks.map((d) => d._id);
  if (!deckIds.length) return;
  await Promise.all([
    ConceptCard.deleteMany({ auth0Id: identity.userId, deckId: { $in: deckIds } }),
    ReviewLog.deleteMany({ auth0Id: identity.userId, deckId: { $in: deckIds } }),
    StudyDeck.deleteMany({ auth0Id: identity.userId, _id: { $in: deckIds } }),
  ]);
}

export async function seedSampleDeck(
  identity: Identity,
  key: SampleDeckKey,
  tzOffsetMinutes = 0,
  now = new Date(),
): Promise<{ deckId: Types.ObjectId; title: string; cardCount: number; dueNow: number; embeddingModel: string }> {
  const sample = SAMPLE_DECKS[key];
  await removeSampleDeck(identity, key);

  const deck = await StudyDeck.create({
    auth0Id: identity.userId,
    title: sample.title,
    sourceType: "sample",
    sampleKey: key,
    cardCount: sample.concepts.length,
    engine: "curated",
  });

  const { vectors, model } = await embedTexts(sample.concepts.map(embeddingText));
  const history = simulateHistory(key, now, tzOffsetMinutes);

  const cards = await ConceptCard.insertMany(
    sample.concepts.map((concept, i) => {
      const box = BOX_PLAN[i % BOX_PLAN.length];
      const tier = tierForBox(box);
      const own = history.filter((h) => h.cardIndex === i);
      const last = own.at(-1);
      const nextReviewDate =
        i < DUE_NOW
          ? new Date(now.getTime() - (DUE_NOW - i) * 60_000)
          : new Date(now.getTime() + Math.max(1, intervalForBox(box) - 1) * DAY_MS);
      return {
        auth0Id: identity.userId,
        deckId: deck._id,
        conceptTitle: concept.conceptTitle,
        coreFact: concept.coreFact,
        initialQuestion: concept.initialQuestion,
        currentQuestion: questionForTier(concept, tier),
        expectedKeyPoints: concept.expectedKeyPoints,
        leitnerBox: box,
        nextReviewDate,
        latencyHistory: own.map((h) => h.latencyMs),
        difficultyTier: tier,
        embedding: vectors[i],
        embeddingModel: model,
        reviewCount: own.length,
        lapses: own.filter((h) => h.score < 80).length,
        lastScore: last?.score ?? null,
        lastReviewedAt: last?.reviewedAt ?? null,
        source: "sample",
      };
    }),
  );

  if (history.length) {
    await ReviewLog.insertMany(
      history.map((h) => {
        const card = cards[h.cardIndex];
        const boxBefore = Math.max(1, BOX_PLAN[h.cardIndex] - 1);
        const decision = decideOutcome({ score: h.score, latencyMs: h.latencyMs, box: boxBefore, now: h.reviewedAt });
        return {
          auth0Id: identity.userId,
          cardId: card._id,
          deckId: deck._id,
          conceptTitle: card.conceptTitle,
          question: card.initialQuestion,
          userAnswer: "",
          score: h.score,
          responseLatencyMs: h.latencyMs,
          outcome: decision.outcome,
          boxBefore,
          boxAfter: decision.newBox,
          difficultyTier: tierForBox(boxBefore),
          feedback: "Simulated sample history.",
          engine: "simulated",
          simulated: true,
          reviewedAt: h.reviewedAt,
        };
      }),
    );
  }

  return { deckId: deck._id, title: sample.title, cardCount: cards.length, dueNow: DUE_NOW, embeddingModel: model };
}
