import { NextResponse, type NextRequest } from "next/server";
import { HttpError, readJson, withIdentity } from "@/lib/api";
import { applyExamWindow } from "@/lib/examPlan";
import { isDateKey, resolveZone, startOfLocalDay } from "@/lib/timezone";
import { deckPatchSchema } from "@/lib/validation";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";

type Ctx = { params: Promise<{ id: string }> };

async function ownedDeck(userId: string, id: string) {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new HttpError(404, "That deck doesn't exist.");
  const deck = await StudyDeck.findOne({ _id: id, auth0Id: userId }).lean();
  if (!deck) throw new HttpError(404, "That deck doesn't exist.");
  return deck;
}

/** Rename a deck or set its exam date. A new exam date pulls in reviews that would land after it. */
export const PATCH = withIdentity(async (identity, request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { title, examDate, examLabel, tzOffsetMinutes = 0, tzName } = deckPatchSchema.parse(await readJson(request));
  const deck = await ownedDeck(identity.userId, id);
  if (examDate && !isDateKey(examDate)) throw new HttpError(400, "That isn't a real date.");

  const set: Record<string, unknown> = {};
  if (title !== undefined) set.title = title;
  if (examDate !== undefined) set.examDate = examDate;
  if (examLabel !== undefined) set.examLabel = examLabel;
  const updated = await StudyDeck.findOneAndUpdate({ _id: deck._id, auth0Id: identity.userId }, { $set: set }, { new: true }).lean();

  let pulled = 0;
  if (examDate) {
    const now = new Date();
    const zone = resolveZone(tzName, tzOffsetMinutes);
    const late = await ConceptCard.find({
      auth0Id: identity.userId,
      deckId: deck._id,
      nextReviewDate: { $gte: startOfLocalDay(examDate, zone) },
    })
      .select("nextReviewDate")
      .lean();
    for (const card of late) {
      const { date, adjusted } = applyExamWindow({ next: card.nextReviewDate, examDate, now, zone, cardId: String(card._id) });
      if (!adjusted) continue;
      await ConceptCard.updateOne({ _id: card._id, auth0Id: identity.userId }, { $set: { nextReviewDate: date } });
      pulled++;
    }
  }

  return NextResponse.json({
    deck: {
      id: String(deck._id),
      title: updated?.title ?? deck.title,
      examDate: updated?.examDate ?? null,
      examLabel: updated?.examLabel ?? "",
    },
    pulled,
  });
});

/** Delete a deck with all its cards and review history. */
export const DELETE = withIdentity(async (identity, _request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const deck = await ownedDeck(identity.userId, id);
  await Promise.all([
    ConceptCard.deleteMany({ auth0Id: identity.userId, deckId: deck._id }),
    ReviewLog.deleteMany({ auth0Id: identity.userId, deckId: deck._id }),
    StudyDeck.deleteOne({ _id: deck._id, auth0Id: identity.userId }),
  ]);
  return NextResponse.json({ ok: true });
});
