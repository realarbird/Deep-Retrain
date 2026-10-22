import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { auth0 } from "@/lib/auth0";

export type IdentityMode = "auth0" | "demo";

export interface Identity {
  /** Auth0 `user.sub`, or `demo|<uuid>` for Demo Mode. Every query is scoped by this. */
  userId: string;
  mode: IdentityMode;
  name: string;
  email: string | null;
  picture: string | null;
}

export const DEMO_COOKIE = "dr_demo";
const DEMO_ID_PATTERN = /^demo\|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function demoModeEnabled(): boolean {
  return process.env.DEMO_MODE_ENABLED !== "false";
}

export function isDemoId(value: string | undefined | null): value is string {
  return typeof value === "string" && DEMO_ID_PATTERN.test(value);
}

export function newDemoId(): string {
  return `demo|${crypto.randomUUID()}`;
}

/** Auth0 session wins; otherwise a valid Demo Mode cookie; otherwise anonymous. */
export async function getIdentity(): Promise<Identity | null> {
  if (auth0) {
    try {
      const session = await auth0.getSession();
      const user = session?.user;
      if (user?.sub) {
        return {
          userId: user.sub,
          mode: "auth0",
          name: (user.name as string) || (user.nickname as string) || (user.email as string) || "Learner",
          email: (user.email as string) ?? null,
          picture: (user.picture as string) ?? null,
        };
      }
    } catch (err) {
      unstable_rethrow(err); // let Next's prerender/dynamic-rendering signals through
      console.warn("[identity] Auth0 session read failed:", (err as Error).message);
    }
  }

  if (demoModeEnabled()) {
    const demoId = (await cookies()).get(DEMO_COOKIE)?.value;
    if (isDemoId(demoId)) {
      return { userId: demoId, mode: "demo", name: "Demo Judge", email: null, picture: null };
    }
  }
  return null;
}
