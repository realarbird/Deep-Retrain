import type { Model } from "mongoose";
import { NextResponse } from "next/server";
import { getAccountState } from "@/lib/account";
import { HttpError, withIdentity } from "@/lib/api";
import { pushMobileOperation } from "@/lib/mobileSync";
import { cardRecordContext, collectionModels, draftData, mobileRecord, revisionOf, type Doc } from "@/lib/mobileSyncRecords";
import { mobilePushSchema, objectIdSchema, type MobileCollection } from "@/lib/mobileSyncSchema";
import type { Identity } from "@/lib/identity";
import { UserProfile } from "@/models/UserProfile";

export const maxDuration = 120;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
function guard(identity: Identity, expected: string | null | undefined) {
  if (identity.mode !== "auth0") throw new HttpError(403, "Sign in to synchronize offline study material.");
  if (expected && expected !== identity.userId) throw new HttpError(409, "The signed-in account changed. Sign in to the original account to synchronize this device.", { accountMismatch: true });
}

export const GET = withIdentity(async (identity, request: Request) => {
  const params = new URL(request.url).searchParams;
  guard(identity, params.get("expectedAccountId"));
  const collection = params.get("collection") as MobileCollection;
  if (!["cards", "decks", "reviews", "artifacts"].includes(collection)) throw new HttpError(400, "Choose cards, decks, reviews or artifacts.");
  const after = params.get("after");
  if (after && !objectIdSchema.safeParse(after).success) throw new HttpError(400, "Invalid pagination cursor.");
  const rawLimit = params.get("limit") ?? "200";
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 200) throw new HttpError(400, "Page limit must be from 1 to 200.");
  const limit = Number(rawLimit);
  const rows = await (collectionModels[collection] as Model<Doc>).find({ auth0Id: identity.userId, ...(after ? { _id: { $gt: after } } : {}) }).sort({ _id: 1 }).limit(limit + 1).lean() as Doc[];
  const records = [];
  const page = rows.slice(0, limit);
  const context = collection === "cards" ? await cardRecordContext(page, identity.userId) : undefined;
  for (const row of page) records.push(await mobileRecord(collection, row, identity.userId, undefined, context));
  const first = collection === "cards" && !after;
  const account = first ? await getAccountState(identity) : null;
  const profile = first ? await UserProfile.findOne({ auth0Id: identity.userId }).select("draft").lean() : null;
  return NextResponse.json({
    protocolVersion: 1, accountId: identity.userId, serverTime: new Date().toISOString(), collection, records,
    nextCursor: rows.length > limit ? records.at(-1)!.id : null,
    ...(first ? { settings: account!.settings, settingsRevision: revisionOf(account!.settings), draft: draftData(profile?.draft) } : {}),
  }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withIdentity(async (identity, request: Request) => {
  guard(identity, null);
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "Split this synchronization into smaller batches.");
  // Count streamed bytes too: Content-Length is optional and cannot be trusted.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new HttpError(413, "Split this synchronization into smaller batches."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  let raw: unknown;
  try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "Request body must be valid JSON."); }
  // Account mismatch is checked before validating or touching any operation payload.
  const expected = raw && typeof raw === "object" && "expectedAccountId" in raw ? (raw as { expectedAccountId?: unknown }).expectedAccountId : null;
  if (typeof expected === "string") guard(identity, expected);
  const body = mobilePushSchema.parse(raw);
  const account = await getAccountState(identity);
  const results = [];
  for (const operation of body.operations) results.push(await pushMobileOperation(identity.userId, operation, account.settings));
  return NextResponse.json({ protocolVersion: 1, accountId: identity.userId, results }, { headers: { "Cache-Control": "private, no-store" } });
});
