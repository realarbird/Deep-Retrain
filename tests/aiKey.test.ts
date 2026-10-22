import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Identity } from "@/lib/identity";

const alice: Identity = { userId: "auth0|alice", mode: "auth0", name: "Alice", email: null, picture: null };
const demo: Identity = { userId: "demo|00000000-0000-4000-8000-000000000000", mode: "demo", name: "Demo", email: null, picture: null };
const KEY = "AIzaSyD-example-key-0123456789abcdefghi";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fake Auth0 tenant: a token endpoint and one user's app_metadata. */
function fakeAuth0() {
  const appMetadata: Record<string, unknown> = {};
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/oauth/token")) return json({ access_token: "mgmt-token", expires_in: 86_400 });
    if (url.includes("/api/v2/users/")) {
      if (init?.method === "PATCH") {
        const patch = JSON.parse(String(init.body)).app_metadata as Record<string, unknown>;
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete appMetadata[k];
          else appMetadata[k] = v;
        }
        return json({});
      }
      return json({ app_metadata: appMetadata });
    }
    throw new Error(`unexpected ${url}`);
  });
  return { appMetadata, fetchMock };
}

async function load() {
  vi.resetModules();
  return import("@/lib/aiKey");
}

describe("learner AI keys", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH0_DOMAIN", "tenant.example.auth0.com");
    vi.stubEnv("AUTH0_CLIENT_ID", "client");
    vi.stubEnv("AUTH0_CLIENT_SECRET", "secret");
    vi.stubEnv("AUTH0_SECRET", "s".repeat(64));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("only ever sends the sealed key to Auth0", async () => {
    const { appMetadata, fetchMock } = fakeAuth0();
    vi.stubGlobal("fetch", fetchMock);
    const { saveGoogleApiKey } = await load();

    await saveGoogleApiKey(alice, KEY);
    for (const [, init] of fetchMock.mock.calls) expect(String(init?.body ?? "")).not.toContain(KEY);
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch?.[0]).toBe("https://tenant.example.auth0.com/api/v2/users/auth0%7Calice");
    expect(new Headers(patch?.[1]?.headers).get("authorization")).toBe("Bearer mgmt-token");
    expect(String(appMetadata.deepretain_google_ai_key)).toMatch(/^v1\./);
  });

  it("reads the key back from Auth0 and caches it", async () => {
    const { fetchMock } = fakeAuth0();
    vi.stubGlobal("fetch", fetchMock);
    const first = await load();
    await first.saveGoogleApiKey(alice, KEY);

    // A fresh process has an empty cache, so it reads app_metadata once.
    const { getGoogleApiKey } = await load();
    fetchMock.mockClear();
    expect(await getGoogleApiKey(alice)).toBe(KEY);
    expect(await getGoogleApiKey(alice)).toBe(KEY);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/v2/users/"))).toHaveLength(1);
  });

  it("removes the key", async () => {
    const { appMetadata, fetchMock } = fakeAuth0();
    vi.stubGlobal("fetch", fetchMock);
    const { saveGoogleApiKey, deleteGoogleApiKey, getGoogleApiKey } = await load();
    await saveGoogleApiKey(alice, KEY);
    await deleteGoogleApiKey(alice);
    expect(appMetadata.deepretain_google_ai_key).toBeUndefined();
    expect(await getGoogleApiKey(alice)).toBeNull();
  });

  it("has no key in Demo Mode and never calls Auth0 for it", async () => {
    const { fetchMock } = fakeAuth0();
    vi.stubGlobal("fetch", fetchMock);
    const { getGoogleApiKey } = await load();
    expect(await getGoogleApiKey(demo)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an Auth0 outage as no key instead of failing the request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "access_denied" }, 403)));
    const { getGoogleApiKey, loadGoogleApiKey } = await load();
    expect(await getGoogleApiKey(alice)).toBeNull();
    await expect(loadGoogleApiKey(alice)).rejects.toThrow(/HTTP 403/);
  });
});
