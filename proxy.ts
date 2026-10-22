import { NextResponse, type NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

/**
 * Auth0 mounts /auth/login, /auth/callback, /auth/logout and rolls sessions here.
 * Without Auth0 credentials the app runs in Demo Mode, so requests pass through.
 */
export async function proxy(request: NextRequest) {
  if (!auth0) return NextResponse.next();
  return auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml|robots.txt).*)"],
};
