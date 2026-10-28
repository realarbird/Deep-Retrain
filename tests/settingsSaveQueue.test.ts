import { describe, expect, it } from "vitest";
import { SettingsSaveQueue } from "@/lib/settingsSaveQueue";
import { defaultSettings } from "@/lib/settingsSchema";

describe("settings save recovery", () => {
  it("retains a failed patch for retry without starting a retry loop", () => {
    const queue = new SettingsSaveQueue();
    queue.enqueue({ theme: "dark", speech: { rate: 1.2 } });
    expect(queue.begin()).toEqual({ theme: "dark", speech: { rate: 1.2 } });
    expect(queue.finish(false)).toBe(false);
    expect(queue.dirty).toBe(true);
    expect(queue.begin()).toEqual({ theme: "dark", speech: { rate: 1.2 } });
    expect(queue.finish(true)).toBe(false);
    expect(queue.dirty).toBe(false);
    expect(queue.begin()).toBeNull();
  });

  it("serializes overlapping saves and keeps newer edits visible over an old response", () => {
    const queue = new SettingsSaveQueue();
    queue.enqueue({ theme: "dark", speech: { rate: 1.2 } });
    queue.begin();
    queue.enqueue({ theme: "light", speech: { pauseSec: 9 } });
    expect(queue.begin()).toBeNull();
    const saved = { ...defaultSettings(), theme: "dark" as const, speech: { rate: 1.2, pauseSec: 5 } };
    expect(queue.overlay(saved)).toMatchObject({ theme: "light", speech: { rate: 1.2, pauseSec: 9 } });
    expect(queue.finish(true)).toBe(true);
    expect(queue.begin()).toEqual({ theme: "light", speech: { pauseSec: 9 } });
    queue.finish(true);
    expect(queue.dirty).toBe(false);
  });

  it("merges a failed save underneath newer values, including nested speech settings", () => {
    const queue = new SettingsSaveQueue();
    queue.enqueue({ theme: "dark", showTimer: false, speech: { rate: 1.2, pauseSec: 8 } });
    queue.begin();
    queue.enqueue({ theme: "light", speech: { rate: 0.8 } });
    expect(queue.begin()).toBeNull();
    expect(queue.finish(false)).toBe(true);
    expect(queue.begin()).toEqual({ theme: "light", showTimer: false, speech: { rate: 0.8, pauseSec: 8 } });
    queue.finish(true);
    expect(queue.dirty).toBe(false);
  });
});
