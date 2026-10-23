import { describe, expect, it } from "vitest";
import { describeDevice, forgetDevice, mergeDevices, toDevices, upsertDevice, validDeviceId } from "@/lib/devices";

const NOW = new Date("2026-10-23T15:00:00.000Z");
const H = 3_600_000;

describe("describeDevice", () => {
  it("names common browsers and devices in plain words", () => {
    expect(describeDevice({ browser: { name: "Mobile Safari" }, os: { name: "iOS" }, device: { type: "mobile", model: "iPhone" } })).toEqual({
      kind: "phone",
      label: "Safari on iPhone",
    });
    expect(describeDevice({ browser: { name: "Chrome" }, os: { name: "Android" }, device: { type: "tablet" } })).toEqual({
      kind: "tablet",
      label: "Chrome on Android tablet",
    });
    expect(describeDevice({ browser: { name: "Chrome" }, os: { name: "Mac OS" }, device: {} }).label).toBe("Chrome on Mac");
    expect(describeDevice({ browser: { name: "Edge" }, os: { name: "Windows" }, device: {} }).label).toBe("Edge on Windows");
    expect(describeDevice({}).label).toBe("a computer");
  });
});

describe("device list", () => {
  const seen = { id: "11111111-aaaa-4bbb-8ccc-dddddddddddd", kind: "phone" as const, label: "Safari on iPhone" };

  it("adds a new device and skips writes for one seen within a day", () => {
    const first = upsertDevice([], seen, NOW);
    expect(first.changed).toBe(true);
    expect(upsertDevice(first.devices, seen, new Date(NOW.getTime() + 2 * H)).changed).toBe(false);
    expect(upsertDevice(first.devices, seen, new Date(NOW.getTime() + 25 * H)).changed).toBe(true);
    expect(upsertDevice(first.devices, { ...seen, label: "Chrome on iPhone" }, NOW).changed).toBe(true);
  });

  it("keeps the six most recently seen", () => {
    let devices = upsertDevice([], seen, NOW).devices;
    for (let i = 0; i < 7; i++) {
      devices = upsertDevice(devices, { id: `2222222${i}-aaaa-4bbb-8ccc-dddddddddddd`, kind: "desktop", label: `Mac ${i}` }, new Date(NOW.getTime() + (i + 1) * H)).devices;
    }
    expect(devices).toHaveLength(6);
    expect(devices[0].label).toBe("Mac 6");
    expect(devices.some((d) => d.id === seen.id)).toBe(false);
    expect(forgetDevice(devices, devices[0].id)).toHaveLength(5);
  });

  it("merges two lists, newest sighting wins, and drops junk", () => {
    const a = [{ id: seen.id, label: "old", kind: "phone" as const, lastSeenAt: new Date(NOW.getTime() - H).toISOString() }];
    const b = [{ id: seen.id, label: "new", kind: "phone" as const, lastSeenAt: NOW.toISOString() }];
    expect(mergeDevices(a, b)).toEqual(b);
    expect(toDevices([{ id: "short" }, null, { id: seen.id, lastSeenAt: NOW, kind: "laptop" }])).toEqual([
      { id: seen.id, label: "", kind: "desktop", lastSeenAt: NOW.toISOString() },
    ]);
    expect(validDeviceId("not valid!")).toBeNull();
  });
});
