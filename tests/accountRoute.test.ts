import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alice, auth, demo } from "./routeSetup";
import { fakeDb } from "./helpers/fakeDb";
import { fakeAuth0, stubAuth0Env } from "./helpers/fakeAuth0";

const jar = { delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => jar }));

async function load() {
  vi.resetModules();
  return import("@/app/api/account/route");
}

async function seed(userId: string) {
  await fakeDb.StudyDeck.create({ auth0Id: userId, title: "Bio" });
  await fakeDb.ConceptCard.create({ auth0Id: userId, conceptTitle: "Glycolysis" });
  await fakeDb.ReviewLog.create({ auth0Id: userId, score: 90 });
  await fakeDb.UserProfile.create({ auth0Id: userId, settings: { theme: "dark" } });
}

function owned(userId: string) {
  return [fakeDb.StudyDeck, fakeDb.ConceptCard, fakeDb.ReviewLog, fakeDb.UserProfile].flatMap((m) => m.docs.filter((d) => d.auth0Id === userId));
}

describe("DELETE /api/account", () => {
  beforeEach(() => {
    fakeDb.reset();
    jar.delete.mockClear();
    stubAuth0Env();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("deletes a signed-in learner's data and their Auth0 user, and nobody else's", async () => {
    const auth0 = fakeAuth0();
    auth0.users.set("auth0|alice", { deepretain_settings: { theme: "dark" } });
    vi.stubGlobal("fetch", auth0.fetchMock);
    await seed("auth0|alice");
    await seed("auth0|bob");
    auth.current = alice;

    const { DELETE } = await load();
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, loginDeleted: true });
    expect(owned("auth0|alice")).toHaveLength(0);
    expect(owned("auth0|bob")).toHaveLength(4);
    expect(auth0.userCalls("DELETE")).toHaveLength(1);
    expect(auth0.users.has("auth0|alice")).toBe(false);
  });

  it("clears what it stored on Auth0 when it isn't allowed to delete the user", async () => {
    const auth0 = fakeAuth0();
    auth0.state.denyDelete = true;
    auth0.users.set("auth0|alice", { deepretain_settings: { theme: "dark" }, deepretain_google_ai_key: "sealed", other: 1 });
    vi.stubGlobal("fetch", auth0.fetchMock);
    await seed("auth0|alice");
    auth.current = alice;

    const { DELETE } = await load();
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, loginDeleted: false });
    expect(owned("auth0|alice")).toHaveLength(0);
    expect(auth0.users.get("auth0|alice")).toEqual({ other: 1 });
  });

  it("wipes a demo learner's data and leaves Demo Mode without calling Auth0", async () => {
    const auth0 = fakeAuth0();
    vi.stubGlobal("fetch", auth0.fetchMock);
    await seed(demo.userId);
    auth.current = demo;

    const { DELETE } = await load();
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(owned(demo.userId)).toHaveLength(0);
    expect(jar.delete).toHaveBeenCalledWith("dr_demo");
    expect(auth0.fetchMock).not.toHaveBeenCalled();
  });

  it("needs a signed-in or demo learner", async () => {
    auth.current = null;
    const { DELETE } = await load();
    expect((await DELETE()).status).toBe(401);
  });
});
