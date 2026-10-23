import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAuth0, stubAuth0Env } from "./helpers/fakeAuth0";

async function load() {
  vi.resetModules();
  return import("@/lib/appMetadata");
}

describe("shared app_metadata cache", () => {
  beforeEach(stubAuth0Env);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("serves the AI key and settings from one GET", async () => {
    const auth0 = fakeAuth0();
    auth0.users.set("auth0|a", { deepretain_google_ai_key: "v1.sealed", deepretain_settings: { theme: "dark" } });
    vi.stubGlobal("fetch", auth0.fetchMock);
    const { readMetadataKey } = await load();
    expect(await readMetadataKey("auth0|a", "deepretain_google_ai_key")).toBe("v1.sealed");
    expect(await readMetadataKey("auth0|a", "deepretain_settings")).toEqual({ theme: "dark" });
    expect(auth0.userCalls("GET")).toHaveLength(1);
  });

  it("writes one key at a time, and a write doesn't stand in for unread keys", async () => {
    const auth0 = fakeAuth0();
    auth0.users.set("auth0|a", { deepretain_settings: { theme: "light" } });
    vi.stubGlobal("fetch", auth0.fetchMock);
    const { readMetadataKey, writeAppMetadata } = await load();

    await writeAppMetadata("auth0|a", { deepretain_devices: [{ id: "x" }] });
    const patch = auth0.userCalls("PATCH")[0][1];
    expect(Object.keys(JSON.parse(String(patch?.body)).app_metadata)).toEqual(["deepretain_devices"]);

    // The written key is known; another key needs a real read.
    expect(await readMetadataKey("auth0|a", "deepretain_devices")).toEqual([{ id: "x" }]);
    expect(auth0.userCalls("GET")).toHaveLength(0);
    expect(await readMetadataKey("auth0|a", "deepretain_settings")).toEqual({ theme: "light" });
    expect(auth0.userCalls("GET")).toHaveLength(1);
  });

  it("backs off when Auth0 rate-limits", async () => {
    const auth0 = fakeAuth0();
    vi.stubGlobal("fetch", auth0.fetchMock);
    const { readAppMetadata, accountSyncDown } = await load();
    auth0.state.failWith = { status: 429, headers: { "retry-after": "120" } };
    await expect(readAppMetadata("auth0|a")).rejects.toThrow(/429/);
    expect(accountSyncDown()).toBe(true);
  });
});
