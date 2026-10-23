import { NextResponse, userAgent, type NextRequest } from "next/server";
import { effectiveDailyCapFor, getAccountState } from "@/lib/account";
import { safeAfter, withIdentity } from "@/lib/api";
import { dueCards, activeCards } from "@/lib/cardQueries";
import { isTouchDevice } from "@/lib/devices";
import { storedPractice, type Sibling } from "@/lib/practice";
import { fillPractice } from "@/lib/practiceJobs";
import { getCapStatus } from "@/lib/study";
import { buildSession, MAX_SESSION } from "@/lib/studyQueue";
import { resolveZone } from "@/lib/timezone";
import { studyQuerySchema } from "@/lib/validation";
import { ConceptCard } from "@/models/ConceptCard";
import { StudyDeck } from "@/models/StudyDeck";

export const maxDuration = 60;

const DAY_MS = 86_400_000;
const CARD_FIELDS =
  "deckId conceptTitle coreFact expectedKeyPoints currentQuestion initialQuestion leitnerBox difficultyTier reviewCount latencyHistory nextReviewDate practice revealedAt lastReviewedAt";

/**
 * A study session: due cards in order, each with the mode it will be asked in
 * and only what's needed to ask it. Answers stay on the server.
 */
export const GET = withIdentity(async (identity, request: NextRequest) => {
  const q = studyQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const now = new Date();
  const zone = resolveZone(q.tzName, q.tz);
  const userId = identity.userId;

  const account = await getAccountState(identity);
  const cap = await getCapStatus(userId, q.tz, now, effectiveDailyCapFor(account.settings, now, q.tz));
  const [due, dueTotal, decks] = await Promise.all([
    ConceptCard.find(dueCards(userId, now, q.deck)).sort({ nextReviewDate: 1 }).limit(120).select(CARD_FIELDS).lean(),
    ConceptCard.countDocuments(dueCards(userId, now, q.deck)),
    StudyDeck.find({ auth0Id: userId }).select("title examDate").lean(),
  ]);

  const size = q.size ?? account.settings.sessionSize;
  const limit = cap.reached ? 0 : Math.min(size === "all" ? cap.remaining : size, cap.remaining, MAX_SESSION);

  const deckIds = [...new Set(due.map((c) => String(c.deckId)))];
  const siblingRows = deckIds.length
    ? await ConceptCard.find({ auth0Id: userId, deckId: { $in: deckIds } }).select("deckId conceptTitle coreFact").limit(2000).lean()
    : [];
  const siblingsByDeck = new Map<string, Sibling[]>();
  for (const s of siblingRows) {
    const key = String(s.deckId);
    siblingsByDeck.set(key, [...(siblingsByDeck.get(key) ?? []), { conceptTitle: s.conceptTitle, coreFact: s.coreFact }]);
  }

  const items = buildSession(due, decks, siblingsByDeck, {
    requested: q.mode,
    limit,
    now,
    zone,
    freeRecall: account.settings.freeRecall,
    speech: q.speech === "1",
    touch: isTouchDevice(userAgent(request)),
    extraTime: account.settings.extraTime,
  });

  // Gemma writes practice items for this session's cards and the next day's, without holding up the response.
  const soon = await ConceptCard.find({ ...activeCards(userId), nextReviewDate: { $lte: new Date(now.getTime() + DAY_MS) } })
    .select("conceptTitle coreFact expectedKeyPoints practice")
    .sort({ nextReviewDate: 1 })
    .limit(40)
    .lean();
  const missing = soon.filter((c) => !storedPractice(c)).map((c) => String(c._id));
  if (missing.length) safeAfter("practice", () => fillPractice(identity, missing));

  return NextResponse.json({
    items,
    cap,
    dueTotal,
    mode: q.mode,
    settings: { askConfidence: account.settings.askConfidence, showTimer: account.settings.showTimer },
  });
});
