import { Auth0Client } from "@auth0/nextjs-auth0/server";

/**
 * Auth0 is optional so the app still boots in Demo Mode for judges.
 * The SDK only warns on missing config, so we gate construction ourselves.
 */
export const auth0Configured = Boolean(
  process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_CLIENT_SECRET &&
    process.env.AUTH0_SECRET,
);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

function isLoopback(url: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Where Auth0 sends learners back after login and logout. Render injects
 * RENDER_EXTERNAL_URL, so deploys work without setting APP_BASE_URL by hand.
 * On Render, a localhost APP_BASE_URL (copied from .env.example) would send the
 * callback to the learner's own machine, so Render's public URL wins over it.
 */
export function authBaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const configured = env.APP_BASE_URL?.trim();
  const render = env.RENDER_EXTERNAL_URL?.trim();
  if (render && (!configured || isLoopback(configured))) return render;
  return configured || undefined;
}

const appBaseUrl = authBaseUrl();
if (auth0Configured && process.env.APP_BASE_URL && appBaseUrl !== process.env.APP_BASE_URL.trim()) {
  console.warn(`[auth0] Ignoring APP_BASE_URL=${process.env.APP_BASE_URL} on Render; using ${appBaseUrl}`);
}

export const auth0: Auth0Client | null = auth0Configured
  ? new Auth0Client({
      appBaseUrl,
      signInReturnToPath: "/",
      authorizationParameters: { scope: "openid profile email" },
    })
  : null;
