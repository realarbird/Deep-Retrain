/**
 * The devices a learner studies on. The browser keeps a random id and sends it
 * with each request; the label always comes from the server's reading of the
 * User-Agent, never from the client.
 */

export const DEVICE_HEADER = "x-deepretain-device";
export const MAX_DEVICES = 6;
/** Only rewrite a device's last-seen time once a day, to keep Auth0 writes rare. */
const SEEN_REFRESH_MS = 24 * 3_600_000;

export type DeviceKind = "phone" | "tablet" | "desktop";

export interface DeviceInfo {
  id: string;
  label: string;
  kind: DeviceKind;
  lastSeenAt: string;
}

/** The parts of Next's `userAgent()` result this needs. */
export interface ParsedAgent {
  browser?: { name?: string };
  os?: { name?: string };
  device?: { type?: string; model?: string };
}

export function validDeviceId(value: string | null | undefined): string | null {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : null;
}

function browserName(name: string | undefined): string | null {
  if (!name) return null;
  if (/edge/i.test(name)) return "Edge";
  if (/samsung/i.test(name)) return "Samsung Internet";
  if (/firefox/i.test(name)) return "Firefox";
  if (/opera/i.test(name)) return "Opera";
  if (/chrom/i.test(name)) return "Chrome";
  if (/safari/i.test(name)) return "Safari";
  return name.replace(/^Mobile\s+/i, "");
}

function placeName(agent: ParsedAgent, kind: DeviceKind): string {
  const os = agent.os?.name ?? "";
  const model = agent.device?.model ?? "";
  if (/^(iPhone|iPad)$/.test(model)) return model;
  if (/ios/i.test(os)) return kind === "tablet" ? "iPad" : "iPhone";
  if (/mac/i.test(os)) return "Mac";
  if (/windows/i.test(os)) return "Windows";
  if (/android/i.test(os)) return kind === "tablet" ? "Android tablet" : "Android phone";
  if (/chrom/i.test(os)) return "Chromebook";
  if (/linux|ubuntu|fedora|debian/i.test(os)) return "Linux";
  if (os) return os;
  return kind === "phone" ? "a phone" : kind === "tablet" ? "a tablet" : "a computer";
}

export function describeDevice(agent: ParsedAgent): { kind: DeviceKind; label: string } {
  const type = agent.device?.type;
  const kind: DeviceKind = type === "mobile" ? "phone" : type === "tablet" ? "tablet" : "desktop";
  const browser = browserName(agent.browser?.name);
  const place = placeName(agent, kind);
  return { kind, label: browser ? `${browser} on ${place}` : place };
}

/** Record a sighting. `changed` is false when nothing worth writing to Auth0 happened. */
export function upsertDevice(
  devices: DeviceInfo[],
  seen: { id: string; kind: DeviceKind; label: string },
  now: Date,
): { devices: DeviceInfo[]; changed: boolean } {
  const existing = devices.find((d) => d.id === seen.id);
  if (existing) {
    const stale = now.getTime() - Date.parse(existing.lastSeenAt) > SEEN_REFRESH_MS;
    const relabelled = existing.label !== seen.label || existing.kind !== seen.kind;
    if (!stale && !relabelled) return { devices, changed: false };
  }
  const next = [
    { id: seen.id, label: seen.label, kind: seen.kind, lastSeenAt: now.toISOString() },
    ...devices.filter((d) => d.id !== seen.id),
  ]
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .slice(0, MAX_DEVICES);
  return { devices: next, changed: true };
}

export function forgetDevice(devices: DeviceInfo[], id: string): DeviceInfo[] {
  return devices.filter((d) => d.id !== id);
}

/** Device lists from Auth0 or Mongo, cleaned up. */
export function toDevices(raw: unknown): DeviceInfo[] {
  if (!Array.isArray(raw)) return [];
  const out: DeviceInfo[] = [];
  for (const d of raw) {
    if (!d || typeof d !== "object") continue;
    const r = d as Record<string, unknown>;
    const id = validDeviceId(typeof r.id === "string" ? r.id : null);
    const lastSeen = r.lastSeenAt instanceof Date ? r.lastSeenAt.toISOString() : typeof r.lastSeenAt === "string" ? r.lastSeenAt : null;
    if (!id || !lastSeen || Number.isNaN(Date.parse(lastSeen))) continue;
    const kind = r.kind === "phone" || r.kind === "tablet" ? r.kind : "desktop";
    out.push({ id, label: typeof r.label === "string" ? r.label.slice(0, 60) : "", kind, lastSeenAt: lastSeen });
  }
  return out.slice(0, MAX_DEVICES);
}

/** Union of two lists, newest sighting of each device wins. */
export function mergeDevices(a: DeviceInfo[], b: DeviceInfo[]): DeviceInfo[] {
  const byId = new Map<string, DeviceInfo>();
  for (const d of [...a, ...b]) {
    const seen = byId.get(d.id);
    if (!seen || Date.parse(d.lastSeenAt) > Date.parse(seen.lastSeenAt)) byId.set(d.id, d);
  }
  return [...byId.values()].sort((x, y) => Date.parse(y.lastSeenAt) - Date.parse(x.lastSeenAt)).slice(0, MAX_DEVICES);
}
