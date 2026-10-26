/**
 * Shared mocks for route tests: the fake database stands in for the models,
 * identity is whatever the test sets, and `after()` work is queued so tests
 * can run it when they choose. Import this before any route module.
 */
import { vi } from "vitest";
import type { Identity } from "@/lib/identity";

export const auth = { current: null as Identity | null };
export const afterQueue: (() => unknown)[] = [];

vi.mock("@/lib/identity", () => ({ getIdentity: async () => auth.current, DEMO_COOKIE: "dr_demo" }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
  after: (task: () => unknown) => {
    afterQueue.push(task);
  },
}));
vi.mock("@/lib/db", () => ({ connectDB: async () => undefined, DatabaseNotConfiguredError: class extends Error {} }));
vi.mock("@/models/ConceptCard", async () => ({
  ConceptCard: (await import("./helpers/fakeDb")).fakeDb.ConceptCard,
  EMBEDDING_DIMENSIONS: 384,
}));
vi.mock("@/models/ReviewLog", async () => ({ ReviewLog: (await import("./helpers/fakeDb")).fakeDb.ReviewLog }));
vi.mock("@/models/StudyDeck", async () => ({ StudyDeck: (await import("./helpers/fakeDb")).fakeDb.StudyDeck }));
vi.mock("@/models/UserProfile", async () => ({ UserProfile: (await import("./helpers/fakeDb")).fakeDb.UserProfile }));

export async function flushAfter(): Promise<void> {
  while (afterQueue.length) await afterQueue.shift()!();
}

export const alice: Identity = { userId: "auth0|alice", mode: "auth0", name: "Alice", email: null, picture: null };
export const demo: Identity = {
  userId: "demo|00000000-0000-4000-8000-000000000000",
  mode: "demo",
  name: "Demo",
  email: null,
  picture: null,
};

export const DEVICE_ID = "11111111-aaaa-4bbb-8ccc-dddddddddddd";
export const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
