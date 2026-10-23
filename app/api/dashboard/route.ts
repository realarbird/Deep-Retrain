import { NextResponse, userAgent, type NextRequest } from "next/server";
import { effectiveDailyCapFor, getAccountState, reconcileAccount, syncAccountExtras, touchDevice } from "@/lib/account";
import { ENGINE_LABELS } from "@/lib/ai/types";
import { warmOllama } from "@/lib/ai/ollama";
import { getGoogleApiKey } from "@/lib/aiKey";
import { safeAfter, withIdentity } from "@/lib/api";
import { activeCards, dueCards } from "@/lib/cardQueries";
import { describeDevice, DEVICE_HEADER, validDeviceId, type DeviceInfo } from "@/lib/devices";
import { activeEngine } from "@/lib/engine";
import { daysUntilExam, deckReadiness, forecastDue } from "@/lib/examPlan";
import { BOX_INTERVALS_DAYS } from "@/lib/leitner";
import { sanitizeTzOffset } from "@/lib/pacer";
import { buildProgressSnapshot, progressSyncDue, sameProgress, type ProgressSnapshot } from "@/lib/progress";
import { recallAt } from "@/lib/retention";
import { removeSampleDecks } from "@/lib/sampleDecks";
import { streaks } from "@/lib/stats";
import { getCapStatus, toReviewCardDTO } from "@/lib/study";
import { localParts, resolveZone, startOfLocalDay } from "@/lib/timezone";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";
import { UserProfile } from "@/models/UserProfile";

const DAY_MS = 86_400_000;
const DUE_QUEUE_LIMIT = 25;

/** Today: due cards, box counts, pacing, the week ahead, and the account's settings and sync status. */
export const GET = withIdentity(async (identity, request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const tz = sanitizeTzOffset(params.get("tz"));
  const zone = resolveZone(params.get("tzName"), tz);
  const now = new Date();
  const userId = identity.userId;

  const profile = await UserProfile.findOneAndUpdate(
    { auth0Id: userId },
    {
      $set: { name: identity.name, email: identity.email, isDemo: identity.mode === "demo", lastActiveAt: now },
      $setOnInsert: { auth0Id: userId },
    },
    { upsert: true, new: true },
  )
    .select("progress progressSyncedAt")
    .lean();

  // Sample decks belong to Demo Mode. Signed-in learners only study their own notes.
  if (identity.mode === "auth0") await removeSampleDecks(userId);
  const [account, googleApiKey] = await Promise.all([getAccountState(identity), getGoogleApiKey(identity)]);
  const cap = await getCapStatus(userId, tz, now, effectiveDailyCapFor(account.settings, now, tz));

  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [cards, dueCount, dueList, studyDays, weekLogs, decks, recent, totalReviews, engine] = await Promise.all([
    ConceptCard.find(activeCards(userId)).select("deckId conceptTitle leitnerBox nextReviewDate lastReviewedAt reviewCount").lean(),
    ConceptCard.countDocuments(dueCards(userId, now)),
    ConceptCard.find(dueCards(userId, now))
      .sort({ nextReviewDate: 1 })
      .limit(DUE_QUEUE_LIMIT)
      .select("deckId conceptTitle currentQuestion leitnerBox difficultyTier reviewCount latencyHistory nextReviewDate")
      .lean(),
    ReviewLog.find({ auth0Id: userId, reviewedAt: { $gte: new Date(now.getTime() - 366 * DAY_MS) } })
      .select("reviewedAt")
      .sort({ reviewedAt: -1 })
      .lean(),
    ReviewLog.find({ auth0Id: userId, reviewedAt: { $gte: weekAgo } }).select("responseLatencyMs score simulated").lean(),
    StudyDeck.find({ auth0Id: userId }).sort({ createdAt: -1 }).select("title sourceType cardCount examDate examLabel").lean(),
    ReviewLog.find({ auth0Id: userId, simulated: { $ne: true } })
      .sort({ reviewedAt: -1 })
      .limit(6)
      .select("conceptTitle outcome score responseLatencyMs boxBefore boxAfter reviewedAt engine mode")
      .lean(),
    ReviewLog.countDocuments({ auth0Id: userId, simulated: { $ne: true } }),
    activeEngine({ googleApiKey }),
  ]);

  if (engine === "ollama") warmOllama();

  const boxes = BOX_INTERVALS_DAYS.map((intervalDays, i) => ({
    box: i + 1,
    intervalDays,
    count: cards.filter((c) => c.leitnerBox === i + 1).length,
  }));

  const todayKey = localParts(now, zone).dateKey;
  const { current: streakDays, longest: longestStreak } = streaks(new Set(studyDays.map((l) => localParts(l.reviewedAt, zone).dateKey)), todayKey);

  const avgLatency7d = weekLogs.length
    ? Math.round(weekLogs.reduce((s, l) => s + l.responseLatencyMs, 0) / weekLogs.length / 100) / 10
    : null;
  const avgScore7d = weekLogs.length ? Math.round(weekLogs.reduce((s, l) => s + l.score, 0) / weekLogs.length) : null;
  const minutesThisWeek = Math.round(weekLogs.reduce((s, l) => s + l.responseLatencyMs, 0) / 60_000);

  const recalls = cards.map((c) => recallAt(c, now)).filter((r): r is number => r !== null);
  const recallNow = recalls.length ? Math.round((recalls.reduce((a, b) => a + b, 0) / recalls.length) * 100) : null;

  const forecast = forecastDue(
    cards.map((c) => c.nextReviewDate),
    { days: 7, now, zone, cap: cap.limit, usedToday: cap.used },
  );

  const dueByDeck = new Map<string, number>();
  for (const c of cards) {
    if (c.nextReviewDate.getTime() <= now.getTime()) dueByDeck.set(String(c.deckId), (dueByDeck.get(String(c.deckId)) ?? 0) + 1);
  }

  const upcoming = decks
    .map((d) => ({ deck: d, days: daysUntilExam(d.examDate, now, zone) }))
    .filter((e): e is { deck: (typeof decks)[number]; days: number } => e.days !== null && e.days >= 0)
    .sort((a, b) => a.days - b.days)[0];
  const exam = upcoming
    ? {
        deckId: String(upcoming.deck._id),
        title: upcoming.deck.title,
        examDate: upcoming.deck.examDate as string,
        examLabel: upcoming.deck.examLabel || "",
        daysLeft: upcoming.days,
        readiness: deckReadiness(
          cards.filter((c) => String(c.deckId) === String(upcoming.deck._id)),
          startOfLocalDay(upcoming.deck.examDate as string, zone),
          now,
        ),
      }
    : null;

  const nextDue = cards
    .filter((c) => c.nextReviewDate.getTime() > now.getTime())
    .sort((a, b) => a.nextReviewDate.getTime() - b.nextReviewDate.getTime())[0];

  // Cross-device bookkeeping, after the response: this device, the Auth0 progress summary, pending settings.
  let devices: DeviceInfo[] = account.devices;
  let devicesChanged = false;
  const deviceId = validDeviceId(request.headers.get(DEVICE_HEADER));
  if (deviceId) {
    const seen = describeDevice(userAgent(request));
    const touched = await touchDevice(identity, account.devices, { id: deviceId, ...seen }, now);
    devices = touched.devices;
    devicesChanged = touched.changed;
  }
  const progress = buildProgressSnapshot({
    cards: cards.length,
    mastered: boxes[4].count,
    due: dueCount,
    reviews: totalReviews,
    streak: streakDays,
    longest: longestStreak,
    lastReviewAt: studyDays[0]?.reviewedAt ?? null,
    decks: decks.map((d) => ({ id: String(d._id), title: d.title, cardCount: d.cardCount, examDate: d.examDate ?? null })),
    now,
  });
  const progressDue =
    progressSyncDue(profile?.progressSyncedAt ?? null, now) && !sameProgress(profile?.progress as ProgressSnapshot | null, progress);
  if (devicesChanged || progressDue) {
    safeAfter("account", () =>
      syncAccountExtras(identity, { ...(progressDue ? { progress } : {}), ...(devicesChanged ? { devices } : {}) }, now),
    );
  }
  if (account.reconcile.push || account.reconcile.mirror) safeAfter("reconcile", () => reconcileAccount(identity, account, now));

  return NextResponse.json({
    identity: { name: identity.name, mode: identity.mode, picture: identity.picture },
    engine: { id: engine, label: ENGINE_LABELS[engine] },
    aiKey: { saved: Boolean(googleApiKey) },
    settings: account.settings,
    sync: account.sync,
    devices,
    thisDevice: deviceId,
    boxes,
    totals: {
      cards: cards.length,
      dueNow: dueCount,
      mastered: boxes[4].count,
      reviewedToday: cap.used,
      streakDays,
      longestStreak,
      avgLatency7d,
      avgScore7d,
      minutesThisWeek,
      recallNow,
      totalReviews,
    },
    cap,
    dueCards: dueList.map(toReviewCardDTO),
    nextDue: nextDue ? { at: nextDue.nextReviewDate.toISOString(), conceptTitle: nextDue.conceptTitle } : null,
    forecast,
    exam,
    hasSimulatedHistory: weekLogs.some((l) => l.simulated),
    decks: decks.map((d) => ({
      id: String(d._id),
      title: d.title,
      sourceType: d.sourceType,
      cardCount: d.cardCount,
      dueNow: dueByDeck.get(String(d._id)) ?? 0,
      examDate: d.examDate ?? null,
      examLabel: d.examLabel || "",
    })),
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
      mode: r.mode ?? "write",
    })),
  });
});
