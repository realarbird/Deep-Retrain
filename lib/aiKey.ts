/**
 * The learner's own Google AI Studio key.
 *
 * A saved key is sealed with AES-256-GCM (lib/secretBox) before it is sent to
 * Auth0, and lives in the user's `app_metadata` only in that form. Sealed values
 * are cached in memory for a few minutes so reviews don't call the Management
 * API on every answer. Demo Mode learners have no Auth0 account and no key.
 */
import { getAppMetadata, patchAppMetadata } from "@/lib/auth0Management";
import type { Identity } from "@/lib/identity";
import { openSecret, sealSecret } from "@/lib/secretBox";

const METADATA_FIELD = "deepretain_google_ai_key";
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_USERS = 1_000;
/** After a Management API failure, don't retry on every request. */
const OUTAGE_BACKOFF_MS = 60_000;

const cache = new Map<string, { sealed: string | null; at: number }>();
let managementDownUntil = 0;

function remember(userId: string, sealed: string | null): void {
  cache.delete(userId);
  cache.set(userId, { sealed, at: Date.now() });
  if (cache.size > CACHE_MAX_USERS) cache.delete(cache.keys().next().value!);
}

/** The key in plain text, read through the cache. Throws if Auth0 can't be reached. */
export async function loadGoogleApiKey(identity: Identity): Promise<string | null> {
  if (identity.mode !== "auth0") return null;
  const hit = cache.get(identity.userId);
  let sealed = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.sealed : undefined;
  if (sealed === undefined) {
    const value = (await getAppMetadata(identity.userId))[METADATA_FIELD];
    sealed = typeof value === "string" ? value : null;
    remember(identity.userId, sealed);
  }
  // A value sealed under a rotated AUTH0_SECRET won't open; the learner saves the key again.
  return sealed ? openSecret(sealed, identity.userId) : null;
}

/** Like `loadGoogleApiKey`, but an Auth0 outage only drops the request to the next engine. */
export async function getGoogleApiKey(identity: Identity): Promise<string | null> {
  if (identity.mode !== "auth0") return null;
  if (Date.now() < managementDownUntil) {
    const stale = cache.get(identity.userId)?.sealed;
    return stale ? openSecret(stale, identity.userId) : null;
  }
  try {
    return await loadGoogleApiKey(identity);
  } catch (err) {
    console.warn("[ai-key] could not load the learner's key from Auth0:", (err as Error).message);
    managementDownUntil = Date.now() + OUTAGE_BACKOFF_MS;
    return null;
  }
}

export async function saveGoogleApiKey(identity: Identity, apiKey: string): Promise<void> {
  const sealed = sealSecret(apiKey, identity.userId);
  await patchAppMetadata(identity.userId, { [METADATA_FIELD]: sealed });
  remember(identity.userId, sealed);
}

export async function deleteGoogleApiKey(identity: Identity): Promise<void> {
  await patchAppMetadata(identity.userId, { [METADATA_FIELD]: null });
  remember(identity.userId, null);
}

/** What the settings panel shows instead of the key. */
export function keyHint(apiKey: string): string {
  return `ending in ${apiKey.slice(-4)}`;
}
