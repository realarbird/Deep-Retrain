import { NextResponse, type NextRequest } from "next/server";
import { effectiveDailyCapFor, getAccountState } from "@/lib/account";
import { withIdentity } from "@/lib/api";
import { buildStats, parseRange, STATS_HISTORY_MS } from "@/lib/stats";
import { getCapStatus } from "@/lib/study";
import { resolveZone, sanitizeOffset } from "@/lib/timezone";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";

const LOG_FIELDS = "reviewedAt score responseLatencyMs outcome boxBefore mode confidence thinkMs device capLimit simulated cardId deckId";
const CARD_FIELDS = "deckId conceptTitle leitnerBox nextReviewDate lastReviewedAt reviewCount lapses lastScore latencyHistory createdAt suspended";

/** Everything on the Stats tab, for one range (30, 90 or 365 days) and optionally one deck. */
export const GET = withIdentity(async (identity, request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const tz = sanitizeOffset(params.get("tz"));
  const zone = resolveZone(params.get("tzName"), tz);
  const rangeDays = parseRange(params.get("range"));
  const deck = params.get("deck");
  const deckFilter = deck && /^[0-9a-f]{24}$/i.test(deck) ? { deckId: deck } : {};
  const now = new Date();
  const userId = identity.userId;

  const account = await getAccountState(identity);
  const cap = await getCapStatus(userId, tz, now, effectiveDailyCapFor(account.settings, now, tz));
  const [logs, cards, decks] = await Promise.all([
    ReviewLog.find({ auth0Id: userId, ...deckFilter, reviewedAt: { $gte: new Date(now.getTime() - STATS_HISTORY_MS) } })
      .select(LOG_FIELDS)
      .lean(),
    ConceptCard.find({ auth0Id: userId, ...deckFilter }).select(CARD_FIELDS).lean(),
    StudyDeck.find({ auth0Id: userId, ...(deck ? { _id: deck } : {}) }).sort({ createdAt: -1 }).select("title examDate examLabel").lean(),
  ]);

  return NextResponse.json(
    buildStats({ logs, cards, decks, now, zone, cap: cap.limit, usedToday: cap.used, rangeDays }),
  );
});
