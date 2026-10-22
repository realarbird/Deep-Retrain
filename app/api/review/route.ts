import { NextResponse } from "next/server";
import { HttpError, readJson, withIdentity } from "@/lib/api";
import { evaluateAndFollowUp, replyToFollowUp } from "@/lib/gemma";
import type { Identity } from "@/lib/identity";
import { findRelatedConcepts, assertOwnership, type RelatedHit, type RetrievalMethod } from "@/lib/retrieval";
import { getCapStatus, toReviewCardDTO } from "@/lib/study";
import { reviewBodySchema } from "@/lib/validation";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";

export const maxDuration = 120;

const LATENCY_HISTORY_LIMIT = 50;

export const POST = withIdentity(async (identity, request: Request) => {
  const body = reviewBodySchema.parse(await readJson(request));
  return body.mode === "followup"
    ? handleFollowUp(identity, body.reviewLogId, body.answer)
    : handleAnswer(identity, body.cardId, body.answer, body.latencyMs, body.tzOffsetMinutes);
});

/** Grade an answer, apply the latency-aware Leitner move, and log the review. */
async function handleAnswer(
  identity: Identity,
  cardId: string,
  answer: string,
  latencyMs: number,
  tzOffsetMinutes: number,
): Promise<Response> {
  const capBefore = await getCapStatus(identity.userId, tzOffsetMinutes);
  if (capBefore.reached) {
    throw new HttpError(429, "Daily cognitive cap reached. Memory consolidation is active until tomorrow.", {
      capReached: true,
      cap: capBefore,
    });
  }

  const card = await ConceptCard.findById(cardId);
  if (!card) throw new HttpError(404, "That concept no longer exists.");
  assertOwnership(identity, card);

  let related: RelatedHit[] = [];
  let retrievalMethod: RetrievalMethod = "none";
  try {
    const r = await findRelatedConcepts(identity, card);
    related = r.concepts;
    retrievalMethod = r.method;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.warn("[review] retrieval failed, continuing without context:", (err as Error).message);
  }

  const boxBefore = card.leitnerBox;
  const questionAsked = card.currentQuestion;
  const result = await evaluateAndFollowUp(
    {
      conceptTitle: card.conceptTitle,
      coreFact: card.coreFact,
      expectedKeyPoints: card.expectedKeyPoints,
      currentQuestion: card.currentQuestion,
      difficultyTier: card.difficultyTier,
      leitnerBox: card.leitnerBox,
    },
    answer,
    latencyMs,
    related,
  );

  const nextQuestion =
    result.outcome === "promote" ? (result.nextQuestion ?? card.currentQuestion)
    : result.outcome === "reset" ? card.initialQuestion
    : card.currentQuestion;

  const now = new Date();
  const updated = await ConceptCard.findOneAndUpdate(
    { _id: card._id, auth0Id: identity.userId },
    {
      $set: {
        leitnerBox: result.newBox,
        nextReviewDate: result.nextReviewDate,
        difficultyTier: result.difficultyTier,
        currentQuestion: nextQuestion,
        lastScore: result.score,
        lastReviewedAt: now,
      },
      $inc: { reviewCount: 1, lapses: result.outcome === "reset" ? 1 : 0 },
      $push: { latencyHistory: { $each: [latencyMs], $slice: -LATENCY_HISTORY_LIMIT } },
    },
    { new: true },
  );

  const log = await ReviewLog.create({
    auth0Id: identity.userId,
    cardId: card._id,
    deckId: card.deckId,
    conceptTitle: card.conceptTitle,
    question: questionAsked,
    userAnswer: answer,
    score: result.score,
    responseLatencyMs: latencyMs,
    outcome: result.outcome,
    boxBefore,
    boxAfter: result.newBox,
    difficultyTier: card.difficultyTier,
    feedback: result.feedback,
    followUpQuestion: result.followUpQuestion,
    analogy: result.analogy,
    retrievedConceptIds: related.map((r) => r._id),
    engine: result.engine,
    reviewedAt: now,
  });

  const cap = await getCapStatus(identity.userId, tzOffsetMinutes);

  return NextResponse.json({
    reviewLogId: String(log._id),
    result: {
      score: result.score,
      feedback: result.feedback,
      coveredKeyPoints: result.coveredKeyPoints,
      missingKeyPoints: result.missingKeyPoints,
      outcome: result.outcome,
      boxBefore,
      newBox: result.newBox,
      intervalDays: result.intervalDays,
      nextReviewDate: result.nextReviewDate.toISOString(),
      difficultyTier: result.difficultyTier,
      isFast: result.isFast,
      isAccurate: result.isAccurate,
      latencyMs,
      followUpQuestion: result.followUpQuestion,
      analogy: result.analogy,
      nextQuestion: result.nextQuestion,
      engine: result.engine,
    },
    reveal: { coreFact: card.coreFact, expectedKeyPoints: card.expectedKeyPoints },
    retrieval: {
      method: retrievalMethod,
      scopedTo: identity.mode,
      concepts: related.map((r) => ({ id: String(r._id), conceptTitle: r.conceptTitle, score: Math.round(r.score * 100) / 100 })),
    },
    card: updated ? toReviewCardDTO(updated) : null,
    cap,
  });
}

/** Reply to the learner's answer to a Socratic follow-up. Does not move the card. */
async function handleFollowUp(identity: Identity, reviewLogId: string, answer: string): Promise<Response> {
  const log = await ReviewLog.findById(reviewLogId);
  if (!log) throw new HttpError(404, "That review no longer exists.");
  if (log.auth0Id !== identity.userId) throw new HttpError(403, "You can only answer your own follow-ups.");
  if (!log.followUpQuestion) throw new HttpError(400, "This review has no follow-up question.");

  const card = await ConceptCard.findOne({ _id: log.cardId, auth0Id: identity.userId }).select("conceptTitle coreFact").lean();
  if (!card) throw new HttpError(404, "That concept no longer exists.");

  const { reply, engine } = await replyToFollowUp(card, log.followUpQuestion, answer);
  log.followUpAnswer = answer;
  log.followUpReply = reply;
  await log.save();

  return NextResponse.json({ reply, engine });
}
