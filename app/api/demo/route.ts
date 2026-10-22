import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { DEMO_COOKIE, demoModeEnabled, getIdentity, isDemoId, newDemoId } from "@/lib/identity";
import { deleteAllUserData } from "@/lib/study";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

/** Enter Demo Mode: an isolated, account-free learner id per browser. */
export async function POST() {
  try {
    if (!demoModeEnabled()) throw new HttpError(403, "Demo Mode is disabled on this deployment.");
    const jar = await cookies();
    const existing = jar.get(DEMO_COOKIE)?.value;
    const demoId = isDemoId(existing) ? existing : newDemoId();
    jar.set(DEMO_COOKIE, demoId, COOKIE_OPTIONS);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Reset the demo learner's data. `?exit=1` also leaves Demo Mode. */
export async function DELETE(request: NextRequest) {
  try {
    const identity = await getIdentity();
    if (!identity || identity.mode !== "demo") throw new HttpError(403, "Only Demo Mode data can be reset here.");
    await connectDB();
    await deleteAllUserData(identity.userId);

    const jar = await cookies();
    if (request.nextUrl.searchParams.get("exit") === "1") jar.delete(DEMO_COOKIE);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
