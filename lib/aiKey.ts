/**
 * The learner's own Google AI Studio key.
 *
 * A saved key is sealed with AES-256-GCM (lib/secretBox) before it is sent to
 * Auth0, and lives in the user's `app_metadata` only in that form. Reads go
 * through the shared `app_metadata` cache (lib/appMetadata), so reviews don't
 * call the Management API on every answer. Demo Mode learners have no Auth0
 * account and no key.
 */
import { accountSyncDown, cachedMetadataKey, markAccountSyncDown, readMetadataKey, writeAppMetadata } from "@/lib/appMetadata";
import type { Identity } from "@/lib/identity";
import { openSecret, sealSecret } from "@/lib/secretBox";

export const AI_KEY_FIELD = "deepretain_google_ai_key";

function open(sealed: unknown, userId: string): string | null {
  // A value sealed under a rotated AUTH0_SECRET won't open; the learner saves the key again.
  return typeof sealed === "string" && sealed ? openSecret(sealed, userId) : null;
}

/** The key in plain text, read through the cache. Throws if Auth0 can't be reached. */
export async function loadGoogleApiKey(identity: Identity): Promise<string | null> {
  if (identity.mode !== "auth0") return null;
  return open(await readMetadataKey(identity.userId, AI_KEY_FIELD), identity.userId);
}

/** Like `loadGoogleApiKey`, but an Auth0 outage only drops the request to the next engine. */
export async function getGoogleApiKey(identity: Identity): Promise<string | null> {
  if (identity.mode !== "auth0") return null;
  if (accountSyncDown()) return open(cachedMetadataKey(identity.userId, AI_KEY_FIELD), identity.userId);
  try {
    return await loadGoogleApiKey(identity);
  } catch (err) {
    console.warn("[ai-key] could not load the learner's key from Auth0:", (err as Error).message);
    markAccountSyncDown(err);
    return null;
  }
}

export async function saveGoogleApiKey(identity: Identity, apiKey: string): Promise<void> {
  await writeAppMetadata(identity.userId, { [AI_KEY_FIELD]: sealSecret(apiKey, identity.userId) });
}

export async function deleteGoogleApiKey(identity: Identity): Promise<void> {
  await writeAppMetadata(identity.userId, { [AI_KEY_FIELD]: null });
}

/** What the settings panel shows instead of the key. */
export function keyHint(apiKey: string): string {
  return `ending in ${apiKey.slice(-4)}`;
}
