import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEVICES_FIELD, SETTINGS_FIELD } from "@/lib/account";
import { AI_KEY_FIELD } from "@/lib/aiKey";
import { forgetAppMetadata, writeAppMetadata } from "@/lib/appMetadata";
import { withIdentity } from "@/lib/api";
import { deleteUser } from "@/lib/auth0Management";
import { DEMO_COOKIE } from "@/lib/identity";
import { PROGRESS_FIELD } from "@/lib/progress";
import { deleteAllUserData } from "@/lib/study";

/**
 * Delete the learner's account: every deck, card, answer and setting in
 * MongoDB, then the Auth0 user itself. If Auth0 won't delete the user (the
 * app lacks `delete:users`), what DeepRetain stored on it is cleared instead
 * and `loginDeleted` is false, so the client can say the sign-in remains.
 */
export const DELETE = withIdentity(async (identity) => {
  await deleteAllUserData(identity.userId);

  if (identity.mode !== "auth0") {
    (await cookies()).delete(DEMO_COOKIE);
    return NextResponse.json({ ok: true, loginDeleted: true });
  }

  let loginDeleted = true;
  try {
    await deleteUser(identity.userId);
  } catch (err) {
    console.warn("[account] could not delete the Auth0 user:", (err as Error).message);
    loginDeleted = false;
    try {
      await writeAppMetadata(identity.userId, {
        [SETTINGS_FIELD]: null,
        [DEVICES_FIELD]: null,
        [PROGRESS_FIELD]: null,
        [AI_KEY_FIELD]: null,
      });
    } catch (clearErr) {
      console.warn("[account] could not clear the Auth0 app_metadata:", (clearErr as Error).message);
    }
  }
  forgetAppMetadata(identity.userId);
  return NextResponse.json({ ok: true, loginDeleted });
});
