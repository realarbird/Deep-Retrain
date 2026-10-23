import { vi } from "vitest";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

/** A fake Auth0 tenant: a token endpoint and users' app_metadata, with an optional failure switch. */
export function fakeAuth0() {
  const users = new Map<string, Record<string, unknown>>();
  const state = { failWith: null as null | { status: number; headers?: Record<string, string> } };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (state.failWith) return json({ error: "nope" }, state.failWith.status, state.failWith.headers);
    if (url.endsWith("/oauth/token")) return json({ access_token: "mgmt-token", expires_in: 86_400 });
    const match = url.match(/\/api\/v2\/users\/([^?]+)/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const meta = users.get(id) ?? {};
      users.set(id, meta);
      if (init?.method === "PATCH") {
        const patch = JSON.parse(String(init.body)).app_metadata as Record<string, unknown>;
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete meta[k];
          else meta[k] = v;
        }
        return json({});
      }
      return json({ app_metadata: meta });
    }
    throw new Error(`unexpected ${url}`);
  });
  const userCalls = (method?: string) =>
    fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/api/v2/users/") && (!method || (init?.method ?? "GET") === method));
  return { users, state, fetchMock, userCalls };
}

export function stubAuth0Env() {
  vi.stubEnv("AUTH0_DOMAIN", "tenant.example.auth0.com");
  vi.stubEnv("AUTH0_CLIENT_ID", "client");
  vi.stubEnv("AUTH0_CLIENT_SECRET", "secret");
  vi.stubEnv("AUTH0_SECRET", "s".repeat(64));
}
