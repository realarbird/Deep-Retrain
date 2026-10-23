import mongoose from "mongoose";
import { NextResponse, userAgent, type NextRequest } from "next/server";
import { effectiveDailyCapFor, getAccountState } from "@/lib/account";
import type { LogEngine } from "@/lib/ai/types";
import { getGoogleApiKey } from "@/lib/aiKey";
import { HttpError, readJson, safeAfter, withIdentity } from "@/lib/api";
import { describeDevice, DEVICE_HEADER, validDeviceId } from "@/lib/devices";
import { evaluateAndFollowUp, explainDifferently, replyToFollowUp } from "@/lib/engine";
import { applyExamWindow } from "@/lib/examPlan";
import type { Identity } from "@/lib/identity";
import { decideOutcome, MODE_RULES, selfRatingScore, type OutcomeResult, type SelfRating, type StudyMode } from "@/lib/leitner";
import { cardSourceHash, resolvePractice, type Sibling } from "@/lib/practice";
import { capStatus } from "@/lib/pacer";
import { syncProgressNow } from "@/lib/progressSync";
import { findRelatedConcepts, assertOwnership, type RelatedHit, type RetrievalMethod } from "@/lib/retrieval";
import {
  chooseNextQuestion,
  gradeChoiceAttempt,
  gradeClozeAttempt,
  gradeTrueFalseAttempt,
  selfRatedFeedback,
  type KeyGrade,
} from "@/lib/reviewFlow";
import { getCapStatus, toReviewCardDTO } from "@/lib/study";
import { revealedSinceReview, teachQuestion } from "@/lib/studyQueue";
import { resolveZone } from "@/lib/timezone";
import { reviewBodySchema, type GradedReviewBody } from "@/lib/validation";
import { ConceptCard, type ConceptCardDoc } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";

export const maxDuration = 120;

const LATENCY_HISTORY_LIMIT = 50;
/** Flip and Listen must be rated within this long of showing the answer. */
const REVEAL_WINDOW_MS = 30 * 60_000;
const CAP_MESSAGE = "That's today's reviews. The rest wait until tomorrow.";

export const POST = withIdentity(async (identity, request: NextRequest) => {
  const body = reviewBodySchema.parse(await readJson(request));
  switch (body.mode) {
    case "followup":
      return handleFollowUp(identity, body.reviewLogId, body.answer);
    case "reveal":
      return handleReveal(identity, body.cardId, body.tzOffsetMinutes);
    case "explain":
      return handleExplain(identity, body.reviewLogId);
    default:
      return handleGraded(identity, body, request);
  }
});

type CardDoc = ConceptCardDoc;

interface Graded {
  mode: StudyMode;
  score: number;
  feedback: string;
  coveredKeyPoints: string[];
  missingKeyPoints: string[];
  decision: OutcomeResult;
  followUpQuestion: string | null;
  analogy: string | null;
  modelNextQuestion: string | null;
  engine: LogEngine;
  correctAnswer: string | null;
  given: string;
  question: string;
  selfRating: SelfRating | null;
  retrieval: { method: RetrievalMethod; concepts: RelatedHit[] };
}

function deviceOf(request: NextRequest): { kind: string; label: string } | null {
  if (!validDeviceId(request.headers.get(DEVICE_HEADER))) return null;
  return describeDevice(userAgent(request));
}

async function capFor(identity: Identity, tz: number, now: Date) {
  const account = await getAccountState(identity);
  return getCapStatus(identity.userId, tz, now, effectiveDailyCapFor(account.settings, now, tz));
}

/** Grade one answer in any mode, move the card, and log the review. */
async function handleGraded(identity: Identity, body: GradedReviewBody, request: NextRequest): Promise<Response> {
  const now = new Date();
  const mode: StudyMode = body.mode === "answer" ? "write" : body.mode;
  const tz = body.tzOffsetMinutes;

  // A retried submit gets the original result back instead of moving the card twice.
  if (body.attemptId) {
    const prior = await ReviewLog.findOne({ auth0Id: identity.userId, attemptId: body.attemptId }).select("replay").lean();
    if (prior?.replay) return NextResponse.json({ ...(prior.replay as object), replayed: true });
  }

  const capBefore = await capFor(identity, tz, now);
  if (capBefore.reached) throw new HttpError(429, CAP_MESSAGE, { capReached: true, cap: capBefore });

  const card = await ConceptCard.findById(body.cardId);
  if (!card) throw new HttpError(404, "That card no longer exists.");
  assertOwnership(identity, card);
  if (card.suspended) throw new HttpError(409, "That card is suspended. Turn it back on from the Cards tab to study it.");

  const revealed = revealedSinceReview(card);
  if (mode === "flip" || mode === "listen") {
    if (!revealed || now.getTime() - new Date(card.revealedAt!).getTime() > REVEAL_WINDOW_MS) {
      throw new HttpError(409, "Show the answer before rating the card.", { needsReveal: true });
    }
  } else if (revealed) {
    throw new HttpError(409, "You've already seen this card's answer, so it can only be rated now.", { revealed: true });
  }

  const graded = await gradeAttempt(identity, card, body, mode, now);

  // Gemma takes a few seconds; another device may have used the last review of the day meanwhile.
  if (MODE_RULES[mode].grader === "model") {
    const capAfter = await capFor(identity, tz, now);
    if (capAfter.reached) throw new HttpError(429, CAP_MESSAGE, { capReached: true, cap: capAfter });
  }

  const deck = await StudyDeck.findOne({ _id: card.deckId, auth0Id: identity.userId }).select("examDate").lean();
  const exam = applyExamWindow({
    next: graded.decision.nextReviewDate,
    examDate: deck?.examDate,
    now,
    zone: resolveZone(body.tzName, tz),
    cardId: String(card._id),
  });
  const nextQuestion = chooseNextQuestion(card, graded.decision, graded.modelNextQuestion);
  const latencyMs = body.latencyMs;

  // Only if nobody else has reviewed this card since it was read (another device, a double submit).
  const seenCount = card.reviewCount ?? 0;
  const updated = await ConceptCard.findOneAndUpdate(
    {
      _id: card._id,
      auth0Id: identity.userId,
      ...(seenCount ? { reviewCount: seenCount } : { $or: [{ reviewCount: 0 }, { reviewCount: { $exists: false } }] }),
    },
    {
      $set: {
        leitnerBox: graded.decision.newBox,
        nextReviewDate: exam.date,
        difficultyTier: graded.decision.difficultyTier,
        currentQuestion: nextQuestion,
        lastScore: graded.score,
        lastReviewedAt: now,
        revealedAt: null,
      },
      $inc: { reviewCount: 1, lapses: graded.decision.outcome === "reset" ? 1 : 0 },
      $push: { latencyHistory: { $each: [latencyMs], $slice: -LATENCY_HISTORY_LIMIT } },
    },
    { new: true },
  );
  if (!updated) {
    throw new HttpError(409, "This card was just reviewed somewhere else, maybe on another device. Moving on.", {
      reviewedElsewhere: true,
    });
  }

  // The response is stored for replays before the log is written, so count this review in.
  const counted = await getCapStatus(identity.userId, tz, now, capBefore.limit);
  const cap = capStatus(counted.used + 1, counted.limit, new Date(counted.resetsAt));
  const logId = new mongoose.Types.ObjectId();
  const response = {
    reviewLogId: String(logId),
    result: {
      mode,
      score: graded.score,
      feedback: graded.feedback,
      coveredKeyPoints: graded.coveredKeyPoints,
      missingKeyPoints: graded.missingKeyPoints,
      outcome: graded.decision.outcome,
      boxBefore: card.leitnerBox,
      newBox: graded.decision.newBox,
      intervalDays: graded.decision.intervalDays,
      nextReviewDate: exam.date.toISOString(),
      examAdjusted: exam.adjusted,
      difficultyTier: graded.decision.difficultyTier,
      isFast: graded.decision.isFast,
      isAccurate: graded.decision.isAccurate,
      boxCapped: graded.decision.boxCapped,
      latencyThresholdMs: graded.decision.latencyThresholdMs,
      latencyMs,
      followUpQuestion: graded.followUpQuestion,
      analogy: graded.analogy,
      nextQuestion: graded.modelNextQuestion,
      correctAnswer: graded.correctAnswer,
      selfRating: graded.selfRating,
      engine: graded.engine,
    },
    reveal: { coreFact: card.coreFact, expectedKeyPoints: card.expectedKeyPoints },
    retrieval: {
      method: graded.retrieval.method,
      scopedTo: identity.mode,
      concepts: graded.retrieval.concepts.map((r) => ({ id: String(r._id), conceptTitle: r.conceptTitle, score: Math.round(r.score * 100) / 100 })),
    },
    card: toReviewCardDTO(updated),
    cap,
  };

  try {
    await ReviewLog.create({
      _id: logId,
      auth0Id: identity.userId,
      cardId: card._id,
      deckId: card.deckId,
      conceptTitle: card.conceptTitle,
      question: graded.question,
      userAnswer: graded.given,
      score: graded.score,
      responseLatencyMs: latencyMs,
      outcome: graded.decision.outcome,
      boxBefore: card.leitnerBox,
      boxAfter: graded.decision.newBox,
      difficultyTier: card.difficultyTier,
      feedback: graded.feedback,
      followUpQuestion: graded.followUpQuestion,
      analogy: graded.analogy,
      retrievedConceptIds: graded.retrieval.concepts.map((r) => r._id),
      engine: graded.engine,
      reviewedAt: now,
      mode,
      selfRating: graded.selfRating,
      confidence: body.confidence ?? null,
      thinkMs: body.thinkMs ?? null,
      sessionId: body.sessionId ?? null,
      ...(body.attemptId ? { attemptId: body.attemptId } : {}),
      device: deviceOf(request),
      capLimit: capBefore.limit,
      boxCapped: graded.decision.boxCapped,
      examAdjusted: exam.adjusted,
      replay: response,
    });
  } catch (err) {
    // Two copies of the same attempt raced: return the one that was logged.
    if ((err as { code?: number }).code === 11000 && body.attemptId) {
      const prior = await ReviewLog.findOne({ auth0Id: identity.userId, attemptId: body.attemptId }).select("replay").lean();
      if (prior?.replay) return NextResponse.json({ ...(prior.replay as object), replayed: true });
    }
    throw err;
  }

  // Finishing the day is a good moment to bring the Auth0 summary up to date.
  if (cap.reached) safeAfter("progress", () => syncProgressNow(identity, tz, body.tzName));

  return NextResponse.json(response);
}

async function gradeAttempt(identity: Identity, card: CardDoc, body: GradedReviewBody, mode: StudyMode, now: Date): Promise<Graded> {
  const none = { method: "none" as RetrievalMethod, concepts: [] as RelatedHit[] };
  const base = {
    mode,
    coveredKeyPoints: [] as string[],
    missingKeyPoints: [] as string[],
    followUpQuestion: null,
    analogy: null,
    modelNextQuestion: null,
    selfRating: null,
    retrieval: none,
  };

  if (body.mode === "answer" || body.mode === "write" || body.mode === "voice" || body.mode === "teach") {
    let related: RelatedHit[] = [];
    let method: RetrievalMethod = "none";
    try {
      const r = await findRelatedConcepts(identity, card);
      related = r.concepts;
      method = r.method;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.warn("[review] retrieval failed, continuing without context:", (err as Error).message);
    }
    const modelMode = mode === "teach" || mode === "voice" ? mode : "write";
    const question = modelMode === "teach" ? teachQuestion(card.conceptTitle) : card.currentQuestion;
    const result = await evaluateAndFollowUp(
      {
        conceptTitle: card.conceptTitle,
        coreFact: card.coreFact,
        expectedKeyPoints: card.expectedKeyPoints,
        currentQuestion: question,
        difficultyTier: card.difficultyTier,
        leitnerBox: card.leitnerBox,
      },
      body.answer,
      body.latencyMs,
      { related, googleApiKey: await getGoogleApiKey(identity), now, mode: modelMode },
    );
    const { score, feedback, coveredKeyPoints, missingKeyPoints, followUpQuestion, analogy, nextQuestion, engine, ...decision } = result;
    return {
      ...base,
      score,
      feedback,
      coveredKeyPoints,
      missingKeyPoints,
      decision,
      followUpQuestion,
      analogy,
      modelNextQuestion: nextQuestion,
      engine,
      correctAnswer: null,
      given: body.answer,
      question,
      retrieval: { method, concepts: related },
    };
  }

  if (body.mode === "flip" || body.mode === "listen") {
    const { score, forceHesitation } = selfRatingScore(body.rating);
    return {
      ...base,
      score,
      feedback: selfRatedFeedback(body.rating),
      decision: decideOutcome({ score, latencyMs: body.latencyMs, box: card.leitnerBox, now, mode, forceHesitation }),
      engine: "self-rated",
      correctAnswer: null,
      given: `(rated ${body.rating})`,
      question: card.currentQuestion,
      selfRating: body.rating,
    };
  }

  // Answer-key modes: rebuild the exact item that was served, then check the answer against it.
  const [kind, hash] = body.practiceVersion.split(":");
  if (hash !== cardSourceHash(card)) throw new HttpError(409, "This card was edited since it was shown. Loading it again.", { stale: true });
  const siblings: Sibling[] = await ConceptCard.find({ auth0Id: identity.userId, deckId: card.deckId, _id: { $ne: card._id } })
    .select("conceptTitle coreFact")
    .limit(500)
    .lean();
  const practice = resolvePractice(card, siblings, { useStored: kind === "s" });
  if (kind === "s" && practice.source !== "stored") throw new HttpError(409, "This card changed since it was shown. Loading it again.", { stale: true });

  let grade: KeyGrade | null = null;
  let question = card.currentQuestion;
  if (body.mode === "choice" && practice.choice) {
    grade = gradeChoiceAttempt(practice.choice, body.choice);
    question = practice.choice.question;
  } else if (body.mode === "truefalse" && practice.trueFalse) {
    grade = gradeTrueFalseAttempt(practice.trueFalse, body.statementId, body.answer);
    question = "True or false?";
  } else if (body.mode === "cloze" && practice.cloze) {
    grade = gradeClozeAttempt(practice.cloze, body.answer);
    question = practice.cloze.text;
  }
  if (!grade) throw new HttpError(409, "This card changed since it was shown. Loading it again.", { stale: true });

  return {
    ...base,
    score: grade.score,
    feedback: grade.feedback,
    decision: decideOutcome({ score: grade.score, latencyMs: body.latencyMs, box: card.leitnerBox, now, mode }),
    engine: "answer-key",
    correctAnswer: grade.correctAnswer,
    given: grade.given,
    question,
  };
}

/** Show the answer for Flip and Listen. After this the card can only be rated. */
async function handleReveal(identity: Identity, cardId: string, tz: number): Promise<Response> {
  const now = new Date();
  const cap = await capFor(identity, tz, now);
  if (cap.reached) throw new HttpError(429, CAP_MESSAGE, { capReached: true, cap });
  const card = await ConceptCard.findOne({ _id: cardId, auth0Id: identity.userId })
    .select("conceptTitle coreFact expectedKeyPoints revealedAt lastReviewedAt suspended")
    .lean();
  if (!card) throw new HttpError(404, "That card no longer exists.");
  if (card.suspended) throw new HttpError(409, "That card is suspended.");
  if (!revealedSinceReview(card)) {
    await ConceptCard.updateOne({ _id: card._id, auth0Id: identity.userId }, { $set: { revealedAt: now } });
  }
  return NextResponse.json({ coreFact: card.coreFact, expectedKeyPoints: card.expectedKeyPoints });
}

/** "Explain it differently": Gemma writes two sentences for a missed card, only when asked. */
async function handleExplain(identity: Identity, reviewLogId: string): Promise<Response> {
  const log = await ReviewLog.findOne({ _id: reviewLogId, auth0Id: identity.userId }).select("cardId question userAnswer analogy").lean();
  if (!log) throw new HttpError(404, "That review no longer exists.");
  if (log.analogy) return NextResponse.json({ analogy: log.analogy, engine: null });

  const card = await ConceptCard.findOne({ _id: log.cardId, auth0Id: identity.userId })
    .select("conceptTitle coreFact expectedKeyPoints")
    .lean();
  if (!card) throw new HttpError(404, "That card no longer exists.");
  const { analogy, engine } = await explainDifferently(card, log.question, log.userAnswer, {
    googleApiKey: await getGoogleApiKey(identity),
  });
  await ReviewLog.updateOne({ _id: log._id, auth0Id: identity.userId }, { $set: { analogy } });
  return NextResponse.json({ analogy, engine });
}

/** Reply to the learner's answer to a Socratic follow-up. Does not move the card. */
async function handleFollowUp(identity: Identity, reviewLogId: string, answer: string): Promise<Response> {
  const log = await ReviewLog.findById(reviewLogId).select("auth0Id cardId followUpQuestion").lean();
  if (!log) throw new HttpError(404, "That review no longer exists.");
  if (log.auth0Id !== identity.userId) throw new HttpError(403, "You can only answer your own follow-ups.");
  if (!log.followUpQuestion) throw new HttpError(400, "This review has no follow-up question.");

  const card = await ConceptCard.findOne({ _id: log.cardId, auth0Id: identity.userId }).select("conceptTitle coreFact").lean();
  if (!card) throw new HttpError(404, "That concept no longer exists.");

  const { reply, engine } = await replyToFollowUp(card, log.followUpQuestion, answer, {
    googleApiKey: await getGoogleApiKey(identity),
  });
  // updateOne, not save(): older logs predate some fields and shouldn't be re-validated.
  await ReviewLog.updateOne({ _id: log._id, auth0Id: identity.userId }, { $set: { followUpAnswer: answer, followUpReply: reply } });

  return NextResponse.json({ reply, engine });
}
