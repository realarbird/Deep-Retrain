/**
 * A small progress summary kept on the learner's Auth0 account, so any device
 * (and the Auth0 dashboard) can see where they are without loading every card.
 * Stays well under Auth0's metadata size guidance: at most 10 decks, short titles.
 */

export const PROGRESS_FIELD = "deepretain_progress";
/** Write the summary to Auth0 at most this often (Free tenants allow about 2 Management API calls a second). */
export const PROGRESS_SYNC_MS = 30 * 60_000;
const MAX_DECKS = 10;
const TITLE_CHARS = 40;

export interface ProgressSnapshot {
  v: 1;
  cards: number;
  mastered: number;
  due: number;
  reviews: number;
  streak: number;
  longest: number;
  lastReviewAt: string | null;
  decks: { id: string; t: string; n: number; exam: string | null }[];
  at: string;
}

export interface ProgressInput {
  cards: number;
  mastered: number;
  due: number;
  reviews: number;
  streak: number;
  longest: number;
  lastReviewAt: Date | null;
  decks: { id: string; title: string; cardCount: number; examDate?: string | null }[];
  now: Date;
}

export function buildProgressSnapshot(input: ProgressInput): ProgressSnapshot {
  return {
    v: 1,
    cards: input.cards,
    mastered: input.mastered,
    due: input.due,
    reviews: input.reviews,
    streak: input.streak,
    longest: input.longest,
    lastReviewAt: input.lastReviewAt ? input.lastReviewAt.toISOString() : null,
    decks: input.decks.slice(0, MAX_DECKS).map((d) => ({
      id: d.id,
      t: d.title.length > TITLE_CHARS ? `${d.title.slice(0, TITLE_CHARS - 1)}…` : d.title,
      n: d.cardCount,
      exam: d.examDate ?? null,
    })),
    at: input.now.toISOString(),
  };
}

/** Same numbers as last time? Then there's nothing to write. */
export function sameProgress(a: ProgressSnapshot | null | undefined, b: ProgressSnapshot): boolean {
  if (!a) return false;
  return JSON.stringify({ ...a, at: null }) === JSON.stringify({ ...b, at: null });
}

export function progressSyncDue(lastSyncedAt: Date | null | undefined, now: Date, force = false): boolean {
  if (force || !lastSyncedAt) return true;
  return now.getTime() - new Date(lastSyncedAt).getTime() >= PROGRESS_SYNC_MS;
}
