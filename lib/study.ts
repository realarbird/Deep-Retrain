import { MobileSyncReceipt } from "@/models/MobileSyncReceipt";
import { MobileSyncArtifact } from "@/models/MobileSyncArtifact";
import { capStatus, dailyCap, localDayBounds, type CapStatus } from "@/lib/pacer";
import { ConceptCard } from "@/models/ConceptCard";
import { ReviewLog } from "@/models/ReviewLog";
import { StudyDeck } from "@/models/StudyDeck";
import { UserProfile } from "@/models/UserProfile";

/** Real (non-simulated) micro-reviews in the user's local day, against the daily cognitive cap. */
export async function getCapStatus(userId: string, tzOffsetMinutes: number, now = new Date(), limit = dailyCap()): Promise<CapStatus> {
  const { start, end } = localDayBounds(now, tzOffsetMinutes);
  const used = await ReviewLog.countDocuments({
    auth0Id: userId,
    simulated: { $ne: true },
    reviewedAt: { $gte: start, $lt: end },
  });
  return capStatus(used, limit, end);
}

/** Card fields safe to send before an answer: no key points or core fact. */
export interface ReviewCardDTO {
  id: string;
  deckId: string;
  conceptTitle: string;
  question: string;
  leitnerBox: number;
  difficultyTier: string;
  reviewCount: number;
  lastLatencyMs: number | null;
  nextReviewDate: string;
}

export function toReviewCardDTO(card: {
  _id: unknown;
  deckId: unknown;
  conceptTitle: string;
  currentQuestion: string;
  leitnerBox: number;
  difficultyTier: string;
  reviewCount?: number | null;
  latencyHistory?: number[] | null;
  nextReviewDate: Date;
}): ReviewCardDTO {
  return {
    id: String(card._id),
    deckId: String(card.deckId),
    conceptTitle: card.conceptTitle,
    question: card.currentQuestion,
    leitnerBox: card.leitnerBox,
    difficultyTier: card.difficultyTier,
    reviewCount: card.reviewCount ?? 0,
    lastLatencyMs: card.latencyHistory?.at(-1) ?? null,
    nextReviewDate: new Date(card.nextReviewDate).toISOString(),
  };
}

export async function deleteAllUserData(userId: string): Promise<void> {
  await Promise.all([
    MobileSyncReceipt.deleteMany({ auth0Id: userId }),
    MobileSyncArtifact.deleteMany({ auth0Id: userId }),
    ConceptCard.deleteMany({ auth0Id: userId }),
    ReviewLog.deleteMany({ auth0Id: userId }),
    StudyDeck.deleteMany({ auth0Id: userId }),
    UserProfile.deleteMany({ auth0Id: userId }),
  ]);
}
