/**
 * Shared card filters. Suspended cards stay in their deck but never come due
 * or count toward the schedule. Older cards have no `suspended` field at all,
 * so the filter is `$ne: true`, never `false`.
 */
import type { Types } from "mongoose";

export const NOT_SUSPENDED = { suspended: { $ne: true } } as const;

/** Projection that leaves out the 384-number embedding. */
export const NO_EMBEDDING = "-embedding" as const;

export function activeCards(userId: string, deckId?: Types.ObjectId | string | null) {
  return { auth0Id: userId, ...NOT_SUSPENDED, ...(deckId ? { deckId } : {}) };
}

export function dueCards(userId: string, now: Date, deckId?: Types.ObjectId | string | null) {
  return { ...activeCards(userId, deckId), nextReviewDate: { $lte: now } };
}
