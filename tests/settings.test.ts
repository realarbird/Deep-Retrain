import { describe, expect, it } from "vitest";
import { buildProgressSnapshot, progressSyncDue, sameProgress } from "@/lib/progress";
import {
  applySettingsPatch,
  defaultSettings,
  effectiveDailyCap,
  newerSettings,
  parseSettings,
  settingsPatchSchema,
} from "@/lib/settingsSchema";
import { sealSecret } from "@/lib/secretBox";

const NOW = new Date("2026-10-23T15:00:00.000Z");

describe("parseSettings", () => {
  it("keeps valid fields and defaults the rest", () => {
    const s = parseSettings({ dailyCap: 10, theme: "dark", defaultMode: "nonsense", speech: { rate: 1.2 } });
    expect(s.dailyCap).toBe(10);
    expect(s.theme).toBe("dark");
    expect(s.defaultMode).toBe("auto");
    expect(s.speech).toEqual({ rate: 1.2, pauseSec: 5 });
  });

  it("never accepts a cap outside 5 to 25", () => {
    expect(parseSettings({ dailyCap: 99 }).dailyCap).toBe(15);
    expect(settingsPatchSchema.safeParse({ dailyCap: 2 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ dailyCap: 25 }).success).toBe(true);
    expect(defaultSettings(40).dailyCap).toBe(25);
  });

  it("refuses unknown keys in a patch", () => {
    expect(settingsPatchSchema.safeParse({ capPrev: 25 }).success).toBe(false);
  });
});

describe("daily cap changes", () => {
  it("applies a raise tomorrow, so it can't extend today's session", () => {
    const raised = applySettingsPatch(defaultSettings(), { dailyCap: 25 }, "2026-10-23", NOW);
    expect(raised.dailyCap).toBe(25);
    expect(effectiveDailyCap(raised, "2026-10-23")).toBe(15);
    expect(effectiveDailyCap(raised, "2026-10-24")).toBe(25);

    // Raising again the same day still waits for tomorrow.
    const again = applySettingsPatch({ ...raised, dailyCap: 20 }, { dailyCap: 22 }, "2026-10-23", NOW);
    expect(effectiveDailyCap(again, "2026-10-23")).toBe(15);
  });

  it("applies a lower cap straight away", () => {
    const raised = applySettingsPatch(defaultSettings(), { dailyCap: 25 }, "2026-10-23", NOW);
    const lowered = applySettingsPatch(raised, { dailyCap: 8 }, "2026-10-23", NOW);
    expect(effectiveDailyCap(lowered, "2026-10-23")).toBe(8);
    expect(lowered.capPrev).toBeNull();
  });

  it("stamps updatedAt and merges speech settings", () => {
    const s = applySettingsPatch(defaultSettings(), { speech: { pauseSec: 8 } }, "2026-10-23", NOW);
    expect(s.speech).toEqual({ rate: 1, pauseSec: 8 });
    expect(s.updatedAt).toBe(NOW.toISOString());
  });
});

describe("newerSettings", () => {
  it("picks the copy with the later updatedAt", () => {
    const a = { ...defaultSettings(), theme: "dark" as const, updatedAt: "2026-10-23T10:00:00.000Z" };
    const b = { ...defaultSettings(), theme: "light" as const, updatedAt: "2026-10-23T11:00:00.000Z" };
    expect(newerSettings(a, b)?.theme).toBe("light");
    expect(newerSettings(a, null)?.theme).toBe("dark");
    expect(newerSettings(null, null)).toBeNull();
  });
});

describe("progress summary", () => {
  const input = {
    cards: 40,
    mastered: 5,
    due: 6,
    reviews: 300,
    streak: 4,
    longest: 12,
    lastReviewAt: NOW,
    decks: Array.from({ length: 14 }, (_, i) => ({ id: `${i}`.padStart(24, "a"), title: "A very long deck title that goes on and on ".repeat(3), cardCount: 12, examDate: "2026-11-14" })),
    now: NOW,
  };

  it("keeps at most ten decks with short titles", () => {
    const p = buildProgressSnapshot(input);
    expect(p.decks).toHaveLength(10);
    expect(p.decks[0].t.length).toBeLessThanOrEqual(40);
  });

  it("only syncs when something changed and 30 minutes have passed", () => {
    const p = buildProgressSnapshot(input);
    expect(sameProgress(p, buildProgressSnapshot({ ...input, now: new Date(NOW.getTime() + 60_000) }))).toBe(true);
    expect(sameProgress(p, buildProgressSnapshot({ ...input, due: 7 }))).toBe(false);
    expect(progressSyncDue(new Date(NOW.getTime() - 10 * 60_000), NOW)).toBe(false);
    expect(progressSyncDue(new Date(NOW.getTime() - 31 * 60_000), NOW)).toBe(true);
    expect(progressSyncDue(null, NOW)).toBe(true);
  });

  it("keeps everything DeepRetain stores in Auth0 under 3 KB", () => {
    const settings = { ...defaultSettings(), updatedAt: NOW.toISOString(), capPrev: 15, capChangedOn: "2026-10-23" };
    const devices = Array.from({ length: 6 }, (_, i) => ({
      id: `0000000${i}-aaaa-4bbb-8ccc-dddddddddddd`,
      label: "Samsung Internet on Android tablet",
      kind: "tablet",
      lastSeenAt: NOW.toISOString(),
    }));
    const metadata = {
      deepretain_google_ai_key: sealSecret("AIzaSyD-example-key-0123456789abcdefghi", "auth0|user", "s".repeat(64)),
      deepretain_settings: settings,
      deepretain_devices: devices,
      deepretain_progress: buildProgressSnapshot(input),
    };
    expect(new TextEncoder().encode(JSON.stringify(metadata)).length).toBeLessThan(3_072);
  });
});
