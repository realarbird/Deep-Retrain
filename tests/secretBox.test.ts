import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "@/lib/secretBox";

const SECRET = "a".repeat(64);
const KEY = "AIzaSyD-example-key-0123456789abcdefghi";

describe("secretBox", () => {
  it("round-trips a key for the same user", () => {
    const sealed = sealSecret(KEY, "auth0|alice", SECRET);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(KEY);
    expect(openSecret(sealed, "auth0|alice", SECRET)).toBe(KEY);
  });

  it("uses a fresh IV every time", () => {
    expect(sealSecret(KEY, "auth0|alice", SECRET)).not.toBe(sealSecret(KEY, "auth0|alice", SECRET));
  });

  it("won't open for another user, another server secret, or a tampered value", () => {
    const sealed = sealSecret(KEY, "auth0|alice", SECRET);
    expect(openSecret(sealed, "auth0|bob", SECRET)).toBeNull();
    expect(openSecret(sealed, "auth0|alice", "b".repeat(64))).toBeNull();
    const parts = sealed.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(openSecret(parts.join("."), "auth0|alice", SECRET)).toBeNull();
    expect(openSecret("not-sealed", "auth0|alice", SECRET)).toBeNull();
  });
});
