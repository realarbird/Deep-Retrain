import { describe, expect, it } from "vitest";
import { assertOwnership, authorizeHits } from "@/lib/retrieval";
import type { Identity } from "@/lib/identity";

const alice: Identity = { userId: "auth0|alice", mode: "auth0", name: "Alice", email: null, picture: null };

describe("identity-scoped retrieval guards", () => {
  it("rejects anchor cards the caller does not own", () => {
    expect(() => assertOwnership(alice, { auth0Id: "auth0|bob" })).toThrow(/your own decks/);
    expect(() => assertOwnership(alice, { auth0Id: "auth0|alice" })).not.toThrow();
  });

  it("drops cross-tenant hits before they reach Gemma", () => {
    const { allowed, blocked } = authorizeHits(alice, [
      { auth0Id: "auth0|alice", conceptTitle: "Mine" },
      { auth0Id: "auth0|bob", conceptTitle: "Not mine" },
      { auth0Id: "demo|00000000-0000-4000-8000-000000000000", conceptTitle: "Demo" },
    ]);
    expect(allowed.map((h) => h.conceptTitle)).toEqual(["Mine"]);
    expect(blocked).toBe(2);
  });
});
