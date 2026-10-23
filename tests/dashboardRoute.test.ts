import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterQueue, alice, auth, demo, DEVICE_ID, flushAfter, IPHONE_UA } from "./routeSetup";
import { fakeDb } from "./helpers/fakeDb";
import { fakeAuth0, stubAuth0Env } from "./helpers/fakeAuth0";
import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route responses are loose JSON in these tests
type Loose = any;

function get(url: string) {
  return new NextRequest(url, { headers: { "x-deepretain-device": DEVICE_ID, "user-agent": IPHONE_UA } });
}

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    fakeDb.reset();
    afterQueue.length = 0;
    vi.stubEnv("OLLAMA_BASE_URL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("shows a seeded demo deck with its exam, forecast and curated practice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    auth.current = demo;
    const { POST } = await import("@/app/api/sample/route");
    const seeded = await POST(new Request("http://test/api/sample", { method: "POST", body: JSON.stringify({ deck: "bio", tzOffsetMinutes: 0 }) }));
    expect(seeded.status).toBe(201);
    const cards = fakeDb.ConceptCard.docs as Loose[];
    expect(cards).toHaveLength(10);
    expect(cards.every((c) => c.practice?.engine === "curated")).toBe(true);

    const { GET } = await import("@/app/api/dashboard/route");
    const body = await (await GET(get("http://test/api/dashboard?tz=0&tzName=UTC"))).json();
    expect(body.totals.cards).toBe(10);
    expect(body.totals.dueNow).toBe(6);
    expect(body.totals.longestStreak).toBeGreaterThan(1);
    expect(body.forecast).toHaveLength(7);
    expect(body.exam).toMatchObject({ daysLeft: 12, examLabel: "AP Biology exam" });
    expect(body.exam.readiness.keepUp).toBeGreaterThan(body.exam.readiness.stopToday);
    expect(body.sync.status).toBe("local");
    expect(body.devices[0]).toMatchObject({ id: DEVICE_ID, label: "Safari on iPhone", kind: "phone" });
    expect(body.settings.dailyCap).toBe(15);
  });

  it("sends a signed-in learner's progress summary and devices to Auth0 after the response", async () => {
    stubAuth0Env();
    const auth0 = fakeAuth0();
    vi.stubGlobal("fetch", auth0.fetchMock);
    auth.current = alice;
    vi.resetModules();
    const { GET } = await import("@/app/api/dashboard/route");
    const res = await GET(get("http://test/api/dashboard?tz=0"));
    expect(res.status).toBe(200);
    expect(auth0.userCalls("PATCH")).toHaveLength(0);
    await flushAfter();
    const meta = auth0.users.get("auth0|alice")!;
    expect(meta.deepretain_progress).toMatchObject({ v: 1, cards: 0 });
    expect(meta.deepretain_devices).toEqual([expect.objectContaining({ id: DEVICE_ID, label: "Safari on iPhone" })]);
    expect(auth0.userCalls("PATCH")).toHaveLength(1);

    // A second load right away writes nothing new.
    await GET(get("http://test/api/dashboard?tz=0"));
    await flushAfter();
    expect(auth0.userCalls("PATCH")).toHaveLength(1);
  });
});
