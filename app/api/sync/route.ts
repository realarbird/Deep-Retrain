import { NextResponse, type NextRequest } from "next/server";
import { getAccountState, reconcileAccount } from "@/lib/account";
import { withIdentity } from "@/lib/api";
import { syncProgressNow } from "@/lib/progressSync";
import { sanitizeOffset } from "@/lib/timezone";

/** "Sync now": push settings, devices and a fresh progress summary to the learner's Auth0 account. */
export const POST = withIdentity(async (identity, request: NextRequest) => {
  const tz = sanitizeOffset(request.nextUrl.searchParams.get("tz"));
  const tzName = request.nextUrl.searchParams.get("tzName");
  const before = await getAccountState(identity);
  await reconcileAccount(identity, { ...before, reconcile: { push: identity.mode === "auth0", mirror: before.reconcile.mirror } });
  const progress = await syncProgressNow(identity, tz, tzName);
  const after = await getAccountState(identity);
  return NextResponse.json({ sync: after.sync, devices: after.devices, progress });
});
