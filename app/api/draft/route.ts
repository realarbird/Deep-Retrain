import { NextResponse, userAgent, type NextRequest } from "next/server";
import { HttpError, readJson, withIdentity } from "@/lib/api";
import { describeDevice } from "@/lib/devices";
import type { Identity } from "@/lib/identity";
import { draftBodySchema } from "@/lib/validation";
import { UserProfile } from "@/models/UserProfile";

/**
 * The notes you're working on in "Add notes", saved to your account so you can
 * start on one device and finish on another. Signed-in learners only.
 */
function signedIn(identity: Identity) {
  if (identity.mode !== "auth0") throw new HttpError(403, "Sign in to keep a notes draft.");
}

type Draft = { title: string; text: string; updatedAt: Date; deviceLabel: string } | null;

function toJson(draft: Draft) {
  return draft?.text || draft?.title
    ? { title: draft.title, text: draft.text, updatedAt: new Date(draft.updatedAt).toISOString(), deviceLabel: draft.deviceLabel }
    : null;
}

export const GET = withIdentity(async (identity) => {
  signedIn(identity);
  const profile = await UserProfile.findOne({ auth0Id: identity.userId }).select("draft").lean();
  return NextResponse.json({ draft: toJson((profile?.draft as Draft) ?? null) });
});

export const PUT = withIdentity(async (identity, request: NextRequest) => {
  signedIn(identity);
  const { title, text, baseUpdatedAt, force } = draftBodySchema.parse(await readJson(request));
  const profile = await UserProfile.findOne({ auth0Id: identity.userId }).select("draft").lean();
  const current = toJson((profile?.draft as Draft) ?? null);
  // Someone (you, on another device) saved a newer draft since this edit started.
  if (current && !force && baseUpdatedAt !== current.updatedAt) {
    throw new HttpError(409, `A newer draft was saved from ${current.deviceLabel || "another device"}.`, { draft: current });
  }
  const draft = { title, text, updatedAt: new Date(), deviceLabel: describeDevice(userAgent(request)).label };
  await UserProfile.updateOne(
    { auth0Id: identity.userId },
    { $set: { draft: text || title ? draft : null }, $setOnInsert: { auth0Id: identity.userId } },
    { upsert: true },
  );
  return NextResponse.json({ draft: toJson(text || title ? draft : null) });
});

export const DELETE = withIdentity(async (identity) => {
  signedIn(identity);
  await UserProfile.updateOne({ auth0Id: identity.userId }, { $set: { draft: null } });
  return NextResponse.json({ draft: null });
});
