import { connection, NextResponse } from "next/server";
import { googleModel, verifyGoogleKey } from "@/lib/ai/googleAiStudio";
import { deleteGoogleApiKey, keyHint, loadGoogleApiKey, saveGoogleApiKey } from "@/lib/aiKey";
import { errorResponse, HttpError, readJson, requireIdentity } from "@/lib/api";
import { ManagementApiError } from "@/lib/auth0Management";
import type { Identity } from "@/lib/identity";
import { aiKeyBodySchema } from "@/lib/validation";

/**
 * The signed-in learner's Google AI Studio key: status, save, remove.
 * The key is sealed before it is sent to Auth0 and is never returned in full.
 */
function keyRoute(handler: (identity: Identity, request: Request) => Promise<Response>) {
  return async (request: Request) => {
    await connection();
    try {
      const identity = await requireIdentity();
      if (identity.mode !== "auth0") {
        throw new HttpError(403, "Sign in to use your own AI Studio key. Demo Mode grades with the offline engine.");
      }
      return await handler(identity, request);
    } catch (err) {
      if (err instanceof ManagementApiError) {
        console.error("[ai-key]", err.message);
        return NextResponse.json(
          {
            error:
              "Your Auth0 account couldn't be reached to store the key. If you run this deployment, authorize the app for the Auth0 Management API (see the README).",
          },
          { status: 503 },
        );
      }
      return errorResponse(err);
    }
  };
}

export const GET = keyRoute(async (identity) => {
  const key = await loadGoogleApiKey(identity);
  return NextResponse.json({ saved: Boolean(key), hint: key ? keyHint(key) : null, model: googleModel() });
});

export const PUT = keyRoute(async (identity, request) => {
  const { apiKey } = aiKeyBodySchema.parse(await readJson(request));
  const check = await verifyGoogleKey(apiKey);
  if (check === "invalid") {
    throw new HttpError(400, "Google rejected this key. Copy it again from aistudio.google.com/api-keys.");
  }
  await saveGoogleApiKey(identity, apiKey);
  return NextResponse.json({ saved: true, hint: keyHint(apiKey), model: googleModel(), verified: check === "valid" });
});

export const DELETE = keyRoute(async (identity) => {
  await deleteGoogleApiKey(identity);
  return NextResponse.json({ saved: false, hint: null, model: googleModel() });
});
