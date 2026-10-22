import { NextResponse } from "next/server";
import { embedTexts, embeddingText } from "@/lib/ai/embeddings";
import { HttpError, readJson, withIdentity } from "@/lib/api";
import { extractConceptsFromNotes } from "@/lib/gemma";
import { toReviewCardDTO } from "@/lib/study";
import { ingestBodySchema } from "@/lib/validation";
import { ConceptCard } from "@/models/ConceptCard";
import { StudyDeck } from "@/models/StudyDeck";

export const maxDuration = 300;

/** Chunk raw notes into atomic concepts with Gemma, embed them, and store them in Leitner Box 1. */
export const POST = withIdentity(async (identity, request: Request) => {
  const { deckTitle, rawText } = ingestBodySchema.parse(await readJson(request));

  const { concepts, engine } = await extractConceptsFromNotes(rawText);
  if (!concepts.length) {
    throw new HttpError(422, "No concepts could be extracted. Try notes with clearer headings or full sentences.");
  }

  const { vectors, model } = await embedTexts(concepts.map(embeddingText));
  const now = new Date();

  const deck = await StudyDeck.create({
    auth0Id: identity.userId,
    title: deckTitle,
    sourceType: "notes",
    cardCount: concepts.length,
    engine,
  });

  const cards = await ConceptCard.insertMany(
    concepts.map((c, i) => ({
      auth0Id: identity.userId,
      deckId: deck._id,
      conceptTitle: c.conceptTitle,
      coreFact: c.coreFact,
      initialQuestion: c.initialQuestion,
      currentQuestion: c.initialQuestion,
      expectedKeyPoints: c.expectedKeyPoints,
      leitnerBox: 1,
      // New concepts get their first recall pass right away, then follow box intervals.
      nextReviewDate: now,
      difficultyTier: "recall",
      embedding: vectors[i],
      embeddingModel: model,
      source: "ingest",
    })),
  );

  return NextResponse.json(
    {
      deck: { id: String(deck._id), title: deck.title, cardCount: cards.length },
      cards: cards.map((c) => ({
        ...toReviewCardDTO(c),
        coreFact: c.coreFact,
        expectedKeyPoints: c.expectedKeyPoints,
      })),
      engine,
      embeddingModel: model,
    },
    { status: 201 },
  );
});
