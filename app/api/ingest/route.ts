import { NextResponse } from "next/server";
import { embedTexts, embeddingText } from "@/lib/ai/embeddings";
import { getGoogleApiKey } from "@/lib/aiKey";
import { HttpError, readJson, safeAfter, withIdentity } from "@/lib/api";
import { extractConceptsFromNotes } from "@/lib/engine";
import { fillPractice } from "@/lib/practiceJobs";
import { toReviewCardDTO } from "@/lib/study";
import { ingestBodySchema } from "@/lib/validation";
import { ConceptCard } from "@/models/ConceptCard";
import { StudyDeck } from "@/models/StudyDeck";
import { UserProfile } from "@/models/UserProfile";

export const maxDuration = 300;

/** Chunk raw notes into atomic concepts, embed them, and store them in Leitner Box 1. Signed-in learners only. */
export const POST = withIdentity(async (identity, request: Request) => {
  if (identity.mode !== "auth0") throw new HttpError(403, "Demo Mode only uses the sample decks. Sign in to add your own notes.");
  const { deckTitle, rawText } = ingestBodySchema.parse(await readJson(request));

  const { concepts, engine } = await extractConceptsFromNotes(rawText, { googleApiKey: await getGoogleApiKey(identity) });
  if (!concepts.length) {
    throw new HttpError(422, "No concepts could be extracted. Try notes with clearer headings or full sentences.");
  }

  const { vectors, model } = await embedTexts(concepts.map(embeddingText));
  const now = new Date();

  const deck = await StudyDeck.create({
    auth0Id: identity.userId,
    title: deckTitle,
    rawText,
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

  // The notes are now cards, so the draft they came from (synced across devices) can go.
  await UserProfile.updateOne({ auth0Id: identity.userId }, { $set: { draft: null } });
  // Gemma writes the multiple-choice, cloze and true/false items after the response, so cards appear right away.
  safeAfter("practice", () => fillPractice(identity, cards.map((c) => String(c._id))));

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
