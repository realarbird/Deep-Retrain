/**
 * One cached copy of each learner's Auth0 `app_metadata`.
 *
 * The sealed AI key, settings, devices and the progress summary all live
 * there, so one GET per learner fills the cache for ten minutes and every
 * write goes through it. Auth0 merges `app_metadata` only at the top level, so
 * each value is written as a whole top-level key. A rate limit or outage backs
 * off instead of failing the request; callers fall back to the Mongo mirror.
 */
import { getAppMetadata, ManagementApiError, patchAppMetadata } from "@/lib/auth0Management";

const TTL_MS = 10 * 60_000;
const MAX_USERS = 1_000;
/** After a failure, don't call Auth0 again for this long (unless it asked for longer). */
const OUTAGE_BACKOFF_MS = 60_000;

interface Entry {
  data: Record<string, unknown>;
  /** False when the entry was started by a write: only the keys in `known` can be trusted. */
  complete: boolean;
  known: Set<string>;
  at: number;
}

const cache = new Map<string, Entry>();
let downUntil = 0;

function remember(userId: string, entry: Entry): void {
  cache.delete(userId);
  cache.set(userId, entry);
  if (cache.size > MAX_USERS) cache.delete(cache.keys().next().value!);
}

function isFresh(entry: Entry | undefined): entry is Entry {
  return Boolean(entry && Date.now() - entry.at < TTL_MS);
}

export function accountSyncDown(): boolean {
  return Date.now() < downUntil;
}

export function markAccountSyncDown(err?: unknown): void {
  const retry = err instanceof ManagementApiError ? err.retryAfterMs : null;
  downUntil = Date.now() + Math.max(retry ?? 0, OUTAGE_BACKOFF_MS);
}

/** A key from the cache however old it is (for use during an outage), or undefined. */
export function cachedMetadataKey(userId: string, key: string): unknown {
  const entry = cache.get(userId);
  return entry && (entry.complete || entry.known.has(key)) ? entry.data[key] : undefined;
}

/** The learner's whole `app_metadata`. Throws when Auth0 can't be reached. */
export async function readAppMetadata(userId: string, { fresh = false }: { fresh?: boolean } = {}): Promise<Record<string, unknown>> {
  const hit = cache.get(userId);
  if (!fresh && isFresh(hit) && hit.complete) return hit.data;
  try {
    const data = await getAppMetadata(userId);
    remember(userId, { data: { ...data }, complete: true, known: new Set(Object.keys(data)), at: Date.now() });
    return data;
  } catch (err) {
    if (err instanceof ManagementApiError && err.status === 429) markAccountSyncDown(err);
    throw err;
  }
}

/** One key, served from the cache when that key is known to be current. */
export async function readMetadataKey(userId: string, key: string): Promise<unknown> {
  const hit = cache.get(userId);
  if (isFresh(hit) && (hit.complete || hit.known.has(key))) return hit.data[key];
  return (await readAppMetadata(userId, { fresh: true }))[key];
}

/** Write whole top-level keys. A null value deletes the key. */
export async function writeAppMetadata(userId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await patchAppMetadata(userId, patch);
  } catch (err) {
    if (err instanceof ManagementApiError && err.status === 429) markAccountSyncDown(err);
    throw err;
  }
  const hit = cache.get(userId);
  const entry: Entry = isFresh(hit)
    ? { ...hit, data: { ...hit.data }, known: new Set(hit.known) }
    : { data: {}, complete: false, known: new Set(), at: Date.now() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete entry.data[key];
    else entry.data[key] = value;
    entry.known.add(key);
  }
  remember(userId, entry);
}

/** Drop a learner's cached copy, e.g. once their account is deleted. */
export function forgetAppMetadata(userId: string): void {
  cache.delete(userId);
}
