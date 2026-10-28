import { NextResponse, type NextRequest } from "next/server";
import { getAccountState } from "@/lib/account";
import { withIdentity } from "@/lib/api";
import { toCsv } from "@/lib/export";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";

const CARD_FIELDS =
  "deckId conceptTitle coreFact expectedKeyPoints initialQuestion currentQuestion leitnerBox difficultyTier nextReviewDate lastReviewedAt reviewCount lapses lastScore suspended createdAt";
const LOG_FIELDS =
  "cardId deckId conceptTitle question userAnswer score responseLatencyMs latencyThresholdMs outcome boxBefore boxAfter mode engine confidence device reviewedAt simulated";

/** The time the card allowed. Logs from before cards had their own time have none. */
function secondsAllowed(log: { latencyThresholdMs?: number | null }): number | null {
  return typeof log.latencyThresholdMs === "number" ? log.latencyThresholdMs / 1000 : null;
}

function attachment(body: string, filename: string, type: string) {
  return new NextResponse(body, {
    headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}

/** Download everything: `format=json` (default), `cards.csv` or `reviews.csv`. */
export const GET = withIdentity(async (identity, request: NextRequest) => {
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const userId = identity.userId;
  const day = new Date().toISOString().slice(0, 10);
  const [decks, cards, logs] = await Promise.all([
    StudyDeck.find({ auth0Id: userId }).select("title sourceType cardCount examDate examLabel createdAt").lean(),
    ConceptCard.find({ auth0Id: userId }).select(CARD_FIELDS).lean(),
    ReviewLog.find({ auth0Id: userId }).sort({ reviewedAt: 1 }).select(LOG_FIELDS).lean(),
  ]);
  const deckTitle = new Map(decks.map((d) => [String(d._id), d.title]));

  if (format === "cards.csv") {
    return attachment(
      toCsv(cards, [
        { header: "Deck", value: (c) => deckTitle.get(String(c.deckId)) },
        { header: "Concept", value: (c) => c.conceptTitle },
        { header: "Question", value: (c) => c.currentQuestion },
        { header: "Core fact", value: (c) => c.coreFact },
        { header: "Key points", value: (c) => c.expectedKeyPoints },
        { header: "Box", value: (c) => c.leitnerBox },
        { header: "Next review", value: (c) => c.nextReviewDate },
        { header: "Reviews", value: (c) => c.reviewCount },
        { header: "Lapses", value: (c) => c.lapses },
        { header: "Last score", value: (c) => c.lastScore },
        { header: "Suspended", value: (c) => (c.suspended ? "yes" : "no") },
      ]),
      `deepretain-cards-${day}.csv`,
      "text/csv",
    );
  }
  if (format === "reviews.csv") {
    return attachment(
      toCsv(logs, [
        { header: "When", value: (l) => l.reviewedAt },
        { header: "Deck", value: (l) => deckTitle.get(String(l.deckId)) },
        { header: "Concept", value: (l) => l.conceptTitle },
        { header: "Mode", value: (l) => l.mode ?? "write" },
        { header: "Score", value: (l) => l.score },
        { header: "Seconds", value: (l) => Math.round(l.responseLatencyMs / 100) / 10 },
        { header: "Seconds allowed", value: (l) => secondsAllowed(l) },
        { header: "Outcome", value: (l) => l.outcome },
        { header: "Box before", value: (l) => l.boxBefore },
        { header: "Box after", value: (l) => l.boxAfter },
        { header: "Graded by", value: (l) => l.engine },
        { header: "Confidence", value: (l) => l.confidence },
        { header: "Device", value: (l) => l.device?.label },
        { header: "Simulated", value: (l) => (l.simulated ? "yes" : "") },
      ]),
      `deepretain-reviews-${day}.csv`,
      "text/csv",
    );
  }

  // Explicit fields only: no embeddings, practice items, replay data or internal ids beyond what's needed.
  const account = await getAccountState(identity);
  const body = {
    exportedAt: new Date().toISOString(),
    account: { name: identity.name, email: identity.email, mode: identity.mode },
    settings: account.settings,
    decks: decks.map((d) => ({
      id: String(d._id),
      title: d.title,
      sourceType: d.sourceType,
      cardCount: d.cardCount,
      examDate: d.examDate ?? null,
      examLabel: d.examLabel ?? "",
      createdAt: d.createdAt ?? null,
    })),
    cards: cards.map((c) => ({
      id: String(c._id),
      deckId: String(c.deckId),
      conceptTitle: c.conceptTitle,
      coreFact: c.coreFact,
      expectedKeyPoints: c.expectedKeyPoints,
      initialQuestion: c.initialQuestion,
      currentQuestion: c.currentQuestion,
      leitnerBox: c.leitnerBox,
      difficultyTier: c.difficultyTier,
      nextReviewDate: c.nextReviewDate,
      lastReviewedAt: c.lastReviewedAt ?? null,
      reviewCount: c.reviewCount ?? 0,
      lapses: c.lapses ?? 0,
      lastScore: c.lastScore ?? null,
      suspended: Boolean(c.suspended),
      createdAt: c.createdAt ?? null,
    })),
    reviews: logs.map((l) => ({
      id: String(l._id),
      cardId: String(l.cardId),
      deckId: String(l.deckId),
      conceptTitle: l.conceptTitle,
      question: l.question,
      answer: l.userAnswer,
      score: l.score,
      seconds: Math.round(l.responseLatencyMs / 100) / 10,
      secondsAllowed: secondsAllowed(l),
      outcome: l.outcome,
      boxBefore: l.boxBefore,
      boxAfter: l.boxAfter,
      mode: l.mode ?? "write",
      gradedBy: l.engine,
      confidence: l.confidence ?? null,
      device: l.device?.label ?? null,
      reviewedAt: l.reviewedAt,
      simulated: Boolean(l.simulated),
    })),
  };
  return attachment(JSON.stringify(body, null, 2), `deepretain-${day}.json`, "application/json");
});
