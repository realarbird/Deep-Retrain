import { describe, expect, it } from "vitest";
import { localDayBounds, capStatus } from "@/lib/pacer";

describe("localDayBounds", () => {
  it("returns UTC midnight bounds when offset is 0", () => {
    const { start, end } = localDayBounds(new Date("2026-10-21T15:30:00Z"), 0);
    expect(start.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });

  it("shifts to the user's local midnight (UTC-7 => offset 420)", () => {
    const { start, end } = localDayBounds(new Date("2026-10-21T03:00:00Z"), 420);
    // 03:00 UTC is 20:00 on Oct 20 in UTC-7, so the local day started at Oct 20 07:00 UTC
    expect(start.toISOString()).toBe("2026-10-20T07:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-21T07:00:00.000Z");
  });

  it("handles positive-UTC zones (UTC+5:30 => offset -330)", () => {
    const { start } = localDayBounds(new Date("2026-10-21T20:00:00Z"), -330);
    // 20:00 UTC is 01:30 on Oct 22 in IST, so the local day started at Oct 21 18:30 UTC
    expect(start.toISOString()).toBe("2026-10-21T18:30:00.000Z");
  });
});

describe("capStatus", () => {
  it("reports remaining reviews and when the cap resets", () => {
    const s = capStatus(7, 15, new Date("2026-10-22T00:00:00Z"));
    expect(s).toEqual({ used: 7, limit: 15, remaining: 8, reached: false, resetsAt: "2026-10-22T00:00:00.000Z" });
  });

  it("is reached at the limit and never goes negative", () => {
    expect(capStatus(15, 15, new Date()).reached).toBe(true);
    expect(capStatus(20, 15, new Date()).remaining).toBe(0);
  });
});
