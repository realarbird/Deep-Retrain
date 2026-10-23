import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { applyDisplaySettings, HANDWRITING_KEY, MOTION_KEY, THEME_KEY, themeScript } from "@/lib/themeScript";

function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    removeAttribute: (k: string) => attrs.delete(k),
  };
}

function fakeStorage(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe("pre-paint theme script", () => {
  it("applies the remembered theme, motion and handwriting before the first paint", () => {
    const root = fakeRoot();
    const storage = fakeStorage({ [THEME_KEY]: "dark", [MOTION_KEY]: "reduce", [HANDWRITING_KEY]: "off" });
    runInNewContext(themeScript(), { document: { documentElement: root }, window: { localStorage: storage } });
    expect(Object.fromEntries(root.attrs)).toEqual({ "data-theme": "dark", "data-motion": "reduce", "data-handwriting": "off" });
  });

  it("ignores junk and survives storage that throws", () => {
    const root = fakeRoot();
    runInNewContext(themeScript(), { document: { documentElement: root }, window: { localStorage: fakeStorage({ [THEME_KEY]: "<script>" }) } });
    expect(root.attrs.size).toBe(0);
    const broken = { getItem: () => { throw new Error("blocked"); } };
    expect(() => runInNewContext(themeScript(), { document: { documentElement: root }, window: { localStorage: broken } })).not.toThrow();
  });

  it("writes the account's settings back for next time", () => {
    const root = fakeRoot();
    const storage = fakeStorage();
    applyDisplaySettings(root as unknown as HTMLElement, storage as unknown as Storage, { theme: "light", reduceMotion: false, handwriting: true });
    expect(root.attrs.get("data-theme")).toBe("light");
    expect(root.attrs.has("data-motion")).toBe(false);
    expect(storage.data.get(THEME_KEY)).toBe("light");
    applyDisplaySettings(root as unknown as HTMLElement, storage as unknown as Storage, { theme: "system", reduceMotion: true, handwriting: false });
    expect(root.attrs.has("data-theme")).toBe(false);
    expect(root.attrs.get("data-handwriting")).toBe("off");
  });
});
