/**
 * Recompute the learner's progress summary from the database and push it to
 * their Auth0 account. Used when the daily cap is reached and by "Sync now";
 * the dashboard builds the same summary from data it already has.
 */
import { syncAccountExtras } from "@/lib/account";
import { activeCards } from "@/lib/cardQueries";
import type { Identity } from "@/lib/identity";
import { buildProgressSnapshot, type ProgressSnapshot } from "@/lib/progress";
import { streaks } from "@/lib/stats";
import { localParts, resolveZone } from "@/lib/timezone";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";

const YEAR_MS = 366 * 86_400_000;

export async function computeProgress(identity: Identity, now: Date, tz: number, tzName?: string | null): Promise<ProgressSnapshot> {
  const zone = resolveZone(tzName, tz);
  const userId = identity.userId;
  const [cards, reviews, recent, decks] = await Promise.all([
    ConceptCard.find(activeCards(userId)).select("leitnerBox nextReviewDate").lean(),
    ReviewLog.countDocuments({ auth0Id: userId, simulated: { $ne: true } }),
    ReviewLog.find({ auth0Id: userId, reviewedAt: { $gte: new Date(now.getTime() - YEAR_MS) } })
      .select("reviewedAt")
      .sort({ reviewedAt: -1 })
      .lean(),
    StudyDeck.find({ auth0Id: userId }).sort({ createdAt: -1 }).select("title cardCount examDate").lean(),
  ]);
  const days = new Set(recent.map((l) => localParts(l.reviewedAt, zone).dateKey));
  const { current, longest } = streaks(days, localParts(now, zone).dateKey);
  return buildProgressSnapshot({
    cards: cards.length,
    mastered: cards.filter((c) => c.leitnerBox === 5).length,
    due: cards.filter((c) => c.nextReviewDate.getTime() <= now.getTime()).length,
    reviews,
    streak: current,
    longest,
    lastReviewAt: recent[0]?.reviewedAt ?? null,
    decks: decks.map((d) => ({ id: String(d._id), title: d.title, cardCount: d.cardCount, examDate: d.examDate ?? null })),
    now,
  });
}

export async function syncProgressNow(identity: Identity, tz: number, tzName?: string | null): Promise<ProgressSnapshot> {
  const now = new Date();
  const progress = await computeProgress(identity, now, tz, tzName);
  await syncAccountExtras(identity, { progress }, now);
  return progress;
}
