import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Identity } from "@/lib/identity";

const alice: Identity = { userId: "auth0|alice", mode: "auth0", name: "Alice", email: null, picture: null };
const demo: Identity = { userId: "demo|00000000-0000-4000-8000-000000000000", mode: "demo", name: "Demo", email: null, picture: null };

let current: Identity | null = null;
vi.mock("@/lib/identity", () => ({ getIdentity: async () => current }));
// Route handlers opt out of prerendering with connection(), which needs a real request scope.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => undefined }));
vi.mock("@/lib/db", () => ({ connectDB: async () => undefined, DatabaseNotConfiguredError: class extends Error {} }));

const post = (json: unknown) =>
  new Request("http://test/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });

describe("Demo Mode vs signed-in features", () => {
  beforeEach(() => {
    current = null;
  });

  it("only lets Demo Mode load sample decks", async () => {
    const { POST } = await import("@/app/api/sample/route");
    current = alice;
    const res = await POST(post({ deck: "bio" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/only available in Demo Mode/);
  });

  it("only lets signed-in learners add notes", async () => {
    const { POST } = await import("@/app/api/ingest/route");
    current = demo;
    const res = await POST(post({ deckTitle: "Mine", rawText: "x".repeat(100) }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Sign in to add your own notes/);
  });

  it("only lets signed-in learners import files", async () => {
    const { POST } = await import("@/app/api/import/route");
    current = demo;
    const form = new FormData();
    form.append("file", new File(["# Notes"], "notes.md"));
    const res = await POST(new Request("http://test/api/import", { method: "POST", body: form }));
    expect(res.status).toBe(403);

    current = alice;
    const ok = await POST(new Request("http://test/api/import", { method: "POST", body: form }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ title: "notes", text: "# Notes" });
  });

  it("imports files past the old 5 MB cap, up to the 50 MB limit", async () => {
    const { POST } = await import("@/app/api/import/route");
    const { MAX_IMPORT_BYTES } = await import("@/lib/importLimits");
    current = alice;
    const upload = (size: number) => {
      const form = new FormData();
      form.append("file", new File([new Uint8Array(size).fill(97)], "big.txt"));
      return POST(new Request("http://test/api/import", { method: "POST", body: form }));
    };

    const ok = await upload(6 * 1024 * 1024);
    expect(ok.status).toBe(200);
    expect((await ok.json()).truncated).toBe(true);

    const tooBig = await upload(MAX_IMPORT_BYTES + 1);
    expect(tooBig.status).toBe(413);
    expect((await tooBig.json()).error).toMatch(/over 50 MB/);
  });

  it("keeps AI keys to signed-in learners", async () => {
    const { PUT } = await import("@/app/api/ai-key/route");
    current = demo;
    const res = await PUT(post({ apiKey: "AIzaSyD-example-key-0123456789abcdefghi" }));
    expect(res.status).toBe(403);
  });

  it("asks anonymous callers to sign in", async () => {
    const { POST } = await import("@/app/api/import/route");
    const res = await POST(new Request("http://test/api/import", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(401);
  });
});
