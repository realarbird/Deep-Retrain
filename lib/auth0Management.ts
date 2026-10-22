/**
 * Minimal Auth0 Management API client: read and write one user's `app_metadata`.
 *
 * Uses the client-credentials grant. By default it reuses the app's own
 * AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET, which must be authorized for the
 * Auth0 Management API with the `read:users` and `update:users_app_metadata`
 * scopes. AUTH0_MANAGEMENT_* variables override that, and
 * AUTH0_MANAGEMENT_DOMAIN is needed when AUTH0_DOMAIN is a custom domain.
 */

const TOKEN_SKEW_MS = 60_000;

let cachedToken: { value: string; expiresAt: number } | null = null;

export class ManagementApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function config() {
  const domain = (process.env.AUTH0_MANAGEMENT_DOMAIN || process.env.AUTH0_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const clientId = (process.env.AUTH0_MANAGEMENT_CLIENT_ID || process.env.AUTH0_CLIENT_ID || "").trim();
  const clientSecret = (process.env.AUTH0_MANAGEMENT_CLIENT_SECRET || process.env.AUTH0_CLIENT_SECRET || "").trim();
  if (!domain || !clientId || !clientSecret) throw new ManagementApiError("Auth0 is not configured", 503);
  return { domain, clientId, clientSecret };
}

async function managementToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_SKEW_MS) return cachedToken.value;
  const { domain, clientId, clientSecret } = config();
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ManagementApiError(`Auth0 Management API token request failed: HTTP ${res.status} ${detail.slice(0, 200)}`, res.status);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function managementFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { domain } = config();
  const res = await fetch(`https://${domain}/api/v2${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await managementToken()}`, ...init.headers },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 401) cachedToken = null;
    const detail = await res.text().catch(() => "");
    throw new ManagementApiError(`Auth0 Management API ${init.method ?? "GET"} ${path.split("?")[0]} failed: HTTP ${res.status} ${detail.slice(0, 200)}`, res.status);
  }
  return res;
}

export async function getAppMetadata(userId: string): Promise<Record<string, unknown>> {
  const res = await managementFetch(`/users/${encodeURIComponent(userId)}?fields=app_metadata&include_fields=true`);
  const json = (await res.json()) as { app_metadata?: Record<string, unknown> };
  return json.app_metadata ?? {};
}

/** Merges into `app_metadata`; a null value deletes that property. */
export async function patchAppMetadata(userId: string, patch: Record<string, unknown>): Promise<void> {
  await managementFetch(`/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ app_metadata: patch }),
  });
}
