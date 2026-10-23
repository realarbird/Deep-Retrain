import { NextResponse, type NextRequest } from "next/server";
import { withIdentity } from "@/lib/api";
import { toCardRow } from "@/lib/cards";
import { ConceptCard } from "@/models/ConceptCard";

const FIELDS =
  "deckId conceptTitle coreFact expectedKeyPoints currentQuestion leitnerBox difficultyTier nextReviewDate lastReviewedAt reviewCount lapses lastScore suspended";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Your cards, for the Cards tab: optionally one deck, a search, or only due / suspended ones. */
export const GET = withIdentity(async (identity, request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const deck = params.get("deck");
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const status = params.get("status");
  const now = new Date();
  const filter: Record<string, unknown> = { auth0Id: identity.userId };
  if (deck && /^[0-9a-f]{24}$/i.test(deck)) filter.deckId = deck;
  if (q) {
    const pattern = { $regex: escapeRegExp(q), $options: "i" };
    filter.$or = [{ conceptTitle: pattern }, { coreFact: pattern }, { currentQuestion: pattern }];
  }
  if (status === "suspended") filter.suspended = true;
  if (status === "due") Object.assign(filter, { suspended: { $ne: true }, nextReviewDate: { $lte: now } });

  const cards = await ConceptCard.find(filter).sort({ nextReviewDate: 1 }).limit(500).select(FIELDS).lean();
  return NextResponse.json({ cards: cards.map((c) => toCardRow(c, now)) });
});
