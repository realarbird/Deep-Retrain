import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterQueue, alice, auth, demo, DEVICE_ID, flushAfter, IPHONE_UA } from "./routeSetup";
import { fakeDb } from "./helpers/fakeDb";
import { fakeAuth0, stubAuth0Env } from "./helpers/fakeAuth0";
import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route responses are loose JSON in these tests
type Loose = any;

function request(method: string, body?: unknown, query = "tz=0") {
  return new NextRequest(`http://test/api/settings?${query}`, {
    method,
    headers: { "Content-Type": "application/json", "x-deepretain-device": DEVICE_ID, "user-agent": IPHONE_UA },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function load() {
  vi.resetModules();
  return import("@/app/api/settings/route");
}

describe("/api/settings", () => {
  beforeEach(() => {
    fakeDb.reset();
    afterQueue.length = 0;
    stubAuth0Env();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps Demo Mode settings on this server and never calls Auth0", async () => {
    const auth0 = fakeAuth0();
    vi.stubGlobal("fetch", auth0.fetchMock);
    auth.current = demo;
    const { PATCH } = await load();
    const res = await PATCH(request("PATCH", { settings: { theme: "dark", defaultMode: "flip" } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sync.status).toBe("local");
    expect(body.settings).toMatchObject({ theme: "dark", defaultMode: "flip" });
    expect((fakeDb.UserProfile.docs[0] as Loose).settings.theme).toBe("dark");
    expect(auth0.fetchMock).not.toHaveBeenCalled();
  });

  it("saves a signed-in learner's settings to their Auth0 account", async () => {
    const auth0 = fakeAuth0();
    vi.stubGlobal("fetch", auth0.fetchMock);
    auth.current = alice;
    const { PATCH, GET } = await load();
    const res = await PATCH(request("PATCH", { settings: { theme: "dark", dailyCap: 20 } }));
    const body = await res.json();
    expect(body.sync.status).toBe("synced");
    expect(auth0.users.get("auth0|alice")?.deepretain_settings).toMatchObject({ theme: "dark", dailyCap: 20 });
    // Raising the cap waits until tomorrow.
    expect(body).toMatchObject({ capToday: 15, capFromTomorrow: 20 });

    // Another device sees the same settings, read from Auth0.
    fakeDb.UserProfile.reset();
    const other = await (await GET(request("GET"))).json();
    expect(other.settings.theme).toBe("dark");
    expect(other.sync.status).toBe("synced");
  });

  it("still saves when Auth0 can't be reached, and says it will sync later", async () => {
    const auth0 = fakeAuth0();
    auth0.state.failWith = { status: 403 };
    vi.stubGlobal("fetch", auth0.fetchMock);
    auth.current = alice;
    const { PATCH } = await load();
    const res = await PATCH(request("PATCH", { settings: { showTimer: false } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sync.status).toBe("pending");
    expect(body.sync.error).toMatch(/authorize the Auth0 Management API/);
    expect((fakeDb.UserProfile.docs[0] as Loose).settings.showTimer).toBe(false);
    expect((fakeDb.UserProfile.docs[0] as Loose).sync.pending).toBe(true);
  });

  it("pushes settings saved during an outage once Auth0 is back", async () => {
    const auth0 = fakeAuth0();
    vi.stubGlobal("fetch", auth0.fetchMock);
    auth.current = alice;
    await fakeDb.UserProfile.create({
      auth0Id: alice.userId,
      settings: { theme: "light", updatedAt: "2026-10-23T10:00:00.000Z" },
      sync: { pending: true, lastSyncedAt: null, lastError: "down" },
    });
    const { GET } = await load();
    const body = await (await GET(request("GET"))).json();
    expect(body.sync.status).toBe("pending");
    await flushAfter();
    expect(auth0.users.get("auth0|alice")?.deepretain_settings).toMatchObject({ theme: "light" });
    expect((fakeDb.UserProfile.docs[0] as Loose).sync.pending).toBe(false);
  });

  it("refuses unknown settings", async () => {
    vi.stubGlobal("fetch", fakeAuth0().fetchMock);
    auth.current = demo;
    const { PATCH } = await load();
    const res = await PATCH(request("PATCH", { settings: { capPrev: 25 } }));
    expect(res.status).toBe(400);
  });

  it("forgets a device", async () => {
    const auth0 = fakeAuth0();
    vi.stubGlobal("fetch", auth0.fetchMock);
    auth.current = alice;
    auth0.users.set("auth0|alice", {
      deepretain_devices: [{ id: DEVICE_ID, label: "Safari on iPhone", kind: "phone", lastSeenAt: new Date().toISOString() }],
    });
    const { DELETE } = await load();
    const body = await (await DELETE(request("DELETE", undefined, `device=${DEVICE_ID}&tz=0`))).json();
    expect(body.devices).toEqual([]);
    expect(auth0.users.get("auth0|alice")?.deepretain_devices).toEqual([]);
  });
});
