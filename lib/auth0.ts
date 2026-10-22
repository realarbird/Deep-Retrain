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

export const auth0: Auth0Client | null = auth0Configured
  ? new Auth0Client({
      // Render injects RENDER_EXTERNAL_URL, so deploys work without setting APP_BASE_URL by hand.
      appBaseUrl: process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || undefined,
      signInReturnToPath: "/",
      authorizationParameters: { scope: "openid profile email" },
    })
  : null;
