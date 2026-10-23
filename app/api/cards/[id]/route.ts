import { NextResponse, type NextRequest } from "next/server";
import { embedTexts, embeddingText } from "@/lib/ai/embeddings";
import { HttpError, readJson, withIdentity } from "@/lib/api";
import { toCardRow } from "@/lib/cards";
import { cardPatchSchema } from "@/lib/validation";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";

type Ctx = { params: Promise<{ id: string }> };

async function ownedCard(userId: string, id: string) {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new HttpError(404, "That card doesn't exist.");
  const card = await ConceptCard.findOne({ _id: id, auth0Id: userId }).lean();
  if (!card) throw new HttpError(404, "That card doesn't exist.");
  return card;
}

/** Edit a card's text, suspend it, or start it over. Text edits re-embed the card and retire its practice items. */
export const PATCH = withIdentity(async (identity, request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const patch = cardPatchSchema.parse(await readJson(request));
  const card = await ownedCard(identity.userId, id);
  const set: Record<string, unknown> = {};

  const next = {
    conceptTitle: patch.conceptTitle ?? card.conceptTitle,
    coreFact: patch.coreFact ?? card.coreFact,
    expectedKeyPoints: patch.expectedKeyPoints ?? card.expectedKeyPoints,
  };
  const textChanged =
    next.conceptTitle !== card.conceptTitle ||
    next.coreFact !== card.coreFact ||
    JSON.stringify(next.expectedKeyPoints) !== JSON.stringify(card.expectedKeyPoints);
  if (textChanged) {
    const { vectors, model } = await embedTexts([embeddingText(next)]);
    Object.assign(set, next, { embedding: vectors[0], embeddingModel: model, practice: null });
  }
  if (patch.question) {
    set.currentQuestion = patch.question;
    if (card.difficultyTier === "recall") set.initialQuestion = patch.question;
  }
  if (patch.suspended !== undefined) set.suspended = patch.suspended;
  if (patch.resetProgress) {
    Object.assign(set, {
      leitnerBox: 1,
      difficultyTier: "recall",
      currentQuestion: set.initialQuestion ?? card.initialQuestion,
      nextReviewDate: new Date(),
      revealedAt: null,
    });
  }

  const updated = await ConceptCard.findOneAndUpdate({ _id: card._id, auth0Id: identity.userId }, { $set: set }, { new: true }).lean();
  if (!updated) throw new HttpError(404, "That card doesn't exist.");
  return NextResponse.json({ card: toCardRow(updated) });
});

/** Delete a card and its review history. */
export const DELETE = withIdentity(async (identity, _request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const card = await ownedCard(identity.userId, id);
  await Promise.all([
    ConceptCard.deleteOne({ _id: card._id, auth0Id: identity.userId }),
    ReviewLog.deleteMany({ auth0Id: identity.userId, cardId: card._id }),
    StudyDeck.updateOne({ _id: card.deckId, auth0Id: identity.userId }, { $inc: { cardCount: -1 } }),
  ]);
  return NextResponse.json({ ok: true });
});
