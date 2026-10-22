import { NextResponse, type NextRequest } from "next/server";
import { withIdentity } from "@/lib/api";
import { ENGINE_LABELS } from "@/lib/ai/types";
import { warmOllama } from "@/lib/ai/ollama";
import { getGoogleApiKey } from "@/lib/aiKey";
import { activeEngine } from "@/lib/engine";
import { BOX_INTERVALS_DAYS } from "@/lib/leitner";
import { sanitizeTzOffset } from "@/lib/pacer";
import { buildLatencyTrend, localDateKey } from "@/lib/retention";
import { removeSampleDecks } from "@/lib/sampleDecks";
import { getCapStatus, toReviewCardDTO } from "@/lib/study";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";
import { UserProfile } from "@/models/UserProfile";

const TREND_DAYS = 28;
const DUE_QUEUE_LIMIT = 25;

/** Due cards, Leitner box stats, pacing, and chart data for the signed-in learner. */
export const GET = withIdentity(async (identity, request: NextRequest) => {
  const tz = sanitizeTzOffset(request.nextUrl.searchParams.get("tz"));
  const now = new Date();
  const userId = identity.userId;

  await UserProfile.updateOne(
    { auth0Id: userId },
    {
      $set: { name: identity.name, email: identity.email, isDemo: identity.mode === "demo", lastActiveAt: now },
      $setOnInsert: { auth0Id: userId },
    },
    { upsert: true },
  );

  // Sample decks belong to Demo Mode. Signed-in learners only study their own notes.
  if (identity.mode === "auth0") await removeSampleDecks(userId);
  const googleApiKey = await getGoogleApiKey(identity);

  const trendStart = new Date(now.getTime() - (TREND_DAYS + 1) * 86_400_000);
  const [boxAgg, dueCount, dueCards, nextDue, cap, logs, decks, recent, engine] = await Promise.all([
    ConceptCard.aggregate<{ _id: number; count: number }>([
      { $match: { auth0Id: userId } },
      { $group: { _id: "$leitnerBox", count: { $sum: 1 } } },
    ]),
    ConceptCard.countDocuments({ auth0Id: userId, nextReviewDate: { $lte: now } }),
    ConceptCard.find({ auth0Id: userId, nextReviewDate: { $lte: now } })
      .sort({ nextReviewDate: 1 })
      .limit(DUE_QUEUE_LIMIT)
      .select("deckId conceptTitle currentQuestion leitnerBox difficultyTier reviewCount latencyHistory nextReviewDate")
      .lean(),
    ConceptCard.findOne({ auth0Id: userId, nextReviewDate: { $gt: now } })
      .sort({ nextReviewDate: 1 })
      .select("nextReviewDate conceptTitle")
      .lean(),
    getCapStatus(userId, tz, now),
    ReviewLog.find({ auth0Id: userId, reviewedAt: { $gte: trendStart } })
      .select("reviewedAt responseLatencyMs score simulated")
      .lean(),
    StudyDeck.find({ auth0Id: userId }).sort({ createdAt: -1 }).select("title sourceType cardCount createdAt").lean(),
    ReviewLog.find({ auth0Id: userId, simulated: { $ne: true } })
      .sort({ reviewedAt: -1 })
      .limit(6)
      .select("conceptTitle outcome score responseLatencyMs boxBefore boxAfter reviewedAt engine")
      .lean(),
    activeEngine({ googleApiKey }),
  ]);

  if (engine === "ollama") warmOllama();

  const boxes = BOX_INTERVALS_DAYS.map((intervalDays, i) => ({
    box: i + 1,
    intervalDays,
    count: boxAgg.find((b) => b._id === i + 1)?.count ?? 0,
  }));
  const totalCards = boxes.reduce((s, b) => s + b.count, 0);

  const latencyTrend = buildLatencyTrend(
    logs.map((l) => ({ reviewedAt: l.reviewedAt, responseLatencyMs: l.responseLatencyMs })),
    { days: TREND_DAYS, now, tzOffsetMinutes: tz },
  );

  const studyDays = new Set(logs.map((l) => localDateKey(l.reviewedAt, tz)));
  let streak = 0;
  for (let d = studyDays.has(localDateKey(now, tz)) ? 0 : 1; ; d++) {
    if (!studyDays.has(localDateKey(new Date(now.getTime() - d * 86_400_000), tz))) break;
    streak++;
  }

  const last7 = logs.filter((l) => l.reviewedAt.getTime() >= now.getTime() - 7 * 86_400_000);
  const avgLatency7d = last7.length
    ? Math.round(last7.reduce((s, l) => s + l.responseLatencyMs, 0) / last7.length / 100) / 10
    : null;
  const avgScore7d = last7.length ? Math.round(last7.reduce((s, l) => s + l.score, 0) / last7.length) : null;

  return NextResponse.json({
    identity: { name: identity.name, mode: identity.mode, picture: identity.picture },
    engine: { id: engine, label: ENGINE_LABELS[engine] },
    aiKey: { saved: Boolean(googleApiKey) },
    boxes,
    totals: {
      cards: totalCards,
      dueNow: dueCount,
      mastered: boxes[4].count,
      reviewedToday: cap.used,
      streakDays: streak,
      avgLatency7d,
      avgScore7d,
    },
    cap,
    dueCards: dueCards.map(toReviewCardDTO),
    nextDue: nextDue ? { at: nextDue.nextReviewDate.toISOString(), conceptTitle: nextDue.conceptTitle } : null,
    latencyTrend,
    hasSimulatedHistory: logs.some((l) => l.simulated),
    decks: decks.map((d) => ({ id: String(d._id), title: d.title, sourceType: d.sourceType, cardCount: d.cardCount })),
    recentReviews: recent.map((r) => ({
      id: String(r._id),
      conceptTitle: r.conceptTitle,
      outcome: r.outcome,
      score: r.score,
      latencyMs: r.responseLatencyMs,
      boxBefore: r.boxBefore,
      boxAfter: r.boxAfter,
      reviewedAt: r.reviewedAt.toISOString(),
      engine: r.engine,
    })),
  });
});
