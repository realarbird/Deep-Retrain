/**
 * The learner's account state: settings, devices and sync status.
 *
 * For signed-in learners the copy in Auth0 `app_metadata` is the one every
 * device reads; MongoDB keeps a mirror so a slow or misconfigured Auth0 never
 * blocks studying. When both copies exist, the newer `updatedAt` wins. Demo
 * learners have no Auth0 account, so their settings stay in MongoDB only.
 */
import { accountSyncDown, markAccountSyncDown, readAppMetadata, writeAppMetadata } from "@/lib/appMetadata";
import { ManagementApiError } from "@/lib/auth0Management";
import { mergeDevices, toDevices, upsertDevice, type DeviceInfo, type DeviceKind } from "@/lib/devices";
import type { Identity } from "@/lib/identity";
import { dailyCap } from "@/lib/pacer";
import { PROGRESS_FIELD, type ProgressSnapshot } from "@/lib/progress";
import { localDateKey } from "@/lib/retention";
import {
  applySettingsPatch,
  defaultSettings,
  effectiveDailyCap,
  newerSettings,
  parseSettings,
  type Settings,
  type SettingsPatch,
} from "@/lib/settingsSchema";
import { UserProfile } from "@/models/UserProfile";

export const SETTINGS_FIELD = "deepretain_settings";
export const DEVICES_FIELD = "deepretain_devices";

/**
 * synced: Auth0 has the latest copy. pending: saved here, the Auth0 write is
 * still to happen. offline: Auth0 can't be reached right now. local: Demo
 * Mode, kept on this server only.
 */
export type SyncStatus = "synced" | "pending" | "offline" | "local";

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
}

export interface AccountState {
  settings: Settings;
  devices: DeviceInfo[];
  sync: SyncState;
}

interface LoadedAccount extends AccountState {
  /** Work to do after the response: push a newer local copy, or mirror Auth0's copy locally. */
  reconcile: { push: boolean; mirror: boolean };
}

export function serverDefaults(): Settings {
  return defaultSettings(dailyCap());
}

/** Today's cap for a learner, on the same local-day boundary as the cap count. */
export function effectiveDailyCapFor(settings: Settings, now: Date, tzOffsetMinutes: number): number {
  return effectiveDailyCap(settings, localDateKey(now, tzOffsetMinutes));
}

export function syncErrorMessage(err: unknown): string {
  if (err instanceof ManagementApiError) {
    if (err.status === 401 || err.status === 403) {
      return "DeepRetain isn't allowed to write to Auth0 yet. Whoever runs this deployment needs to authorize the Auth0 Management API (README, Auth0 step 4).";
    }
    if (err.status === 429) return "Auth0 asked us to slow down. Your changes are saved and will sync shortly.";
    if (err.status === 503) return "Auth0 isn't configured on this server, so changes stay on this server.";
  }
  return "Auth0 couldn't be reached. Your changes are saved and will sync when it's back.";
}

type ProfileSlice = {
  settings?: unknown;
  devices?: unknown;
  sync?: { pending?: boolean | null; lastSyncedAt?: Date | null; lastError?: string | null } | null;
  progress?: unknown;
  progressSyncedAt?: Date | null;
} | null;

async function loadProfile(userId: string): Promise<ProfileSlice> {
  return (await UserProfile.findOne({ auth0Id: userId })
    .select("settings devices sync progress progressSyncedAt")
    .lean()) as ProfileSlice;
}

function localState(profile: ProfileSlice): { settings: Settings | null; devices: DeviceInfo[] } {
  return {
    settings: profile?.settings ? parseSettings(profile.settings, serverDefaults()) : null,
    devices: toDevices(profile?.devices),
  };
}

export async function getAccountState(identity: Identity): Promise<LoadedAccount> {
  const profile = await loadProfile(identity.userId);
  const local = localState(profile);
  const noWork = { push: false, mirror: false };

  if (identity.mode !== "auth0") {
    return {
      settings: local.settings ?? serverDefaults(),
      devices: local.devices,
      sync: { status: "local", lastSyncedAt: null, error: null },
      reconcile: noWork,
    };
  }

  const lastSyncedAt = profile?.sync?.lastSyncedAt ? new Date(profile.sync.lastSyncedAt).toISOString() : null;
  const offline = (error: string): LoadedAccount => ({
    settings: local.settings ?? serverDefaults(),
    devices: local.devices,
    sync: { status: "offline", lastSyncedAt, error },
    reconcile: noWork,
  });
  if (accountSyncDown()) return offline(profile?.sync?.lastError ?? syncErrorMessage(null));

  try {
    const meta = await readAppMetadata(identity.userId);
    const remote = meta[SETTINGS_FIELD] ? parseSettings(meta[SETTINGS_FIELD], serverDefaults()) : null;
    const settings = newerSettings(remote, local.settings) ?? serverDefaults();
    const devices = mergeDevices(toDevices(meta[DEVICES_FIELD]), local.devices);
    const localIsNewer = Boolean(local.settings && settings === local.settings && local.settings !== remote && (local.settings.updatedAt ?? "") > (remote?.updatedAt ?? ""));
    const push = Boolean(profile?.sync?.pending) || localIsNewer;
    const mirror = Boolean(remote && settings === remote && (remote.updatedAt ?? "") > (local.settings?.updatedAt ?? ""));
    return {
      settings,
      devices,
      sync: { status: push ? "pending" : "synced", lastSyncedAt, error: push ? (profile?.sync?.lastError ?? null) : null },
      reconcile: { push, mirror },
    };
  } catch (err) {
    console.warn("[account] could not read Auth0 app_metadata:", (err as Error).message);
    markAccountSyncDown(err);
    return offline(syncErrorMessage(err));
  }
}

async function markSynced(userId: string, now: Date): Promise<void> {
  await UserProfile.updateOne(
    { auth0Id: userId },
    { $set: { sync: { pending: false, lastSyncedAt: now, lastError: null } }, $setOnInsert: { auth0Id: userId } },
    { upsert: true },
  );
}

async function markPending(userId: string, err: unknown, lastSyncedAt: string | null): Promise<string> {
  const message = syncErrorMessage(err);
  await UserProfile.updateOne(
    { auth0Id: userId },
    {
      $set: { sync: { pending: true, lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt) : null, lastError: message } },
      $setOnInsert: { auth0Id: userId },
    },
    { upsert: true },
  );
  return message;
}

/** After a response: push settings saved during an outage, or copy Auth0's newer settings into Mongo. */
export async function reconcileAccount(identity: Identity, state: LoadedAccount, now = new Date()): Promise<void> {
  if (identity.mode !== "auth0") return;
  if (state.reconcile.mirror) {
    await UserProfile.updateOne({ auth0Id: identity.userId }, { $set: { settings: state.settings } });
  }
  if (state.reconcile.push && !accountSyncDown()) {
    try {
      await writeAppMetadata(identity.userId, { [SETTINGS_FIELD]: state.settings, [DEVICES_FIELD]: state.devices });
      await markSynced(identity.userId, now);
    } catch (err) {
      markAccountSyncDown(err);
      await markPending(identity.userId, err, state.sync.lastSyncedAt);
    }
  }
}

/** Save a change. Signed-in learners merge onto the freshest Auth0 copy, so two devices don't undo each other. */
export async function saveSettings(
  identity: Identity,
  patch: SettingsPatch,
  { now, todayKey }: { now: Date; todayKey: string },
): Promise<AccountState> {
  const profile = await loadProfile(identity.userId);
  const local = localState(profile);
  const lastSyncedAt = profile?.sync?.lastSyncedAt ? new Date(profile.sync.lastSyncedAt).toISOString() : null;

  let remote: Settings | null = null;
  let remoteDevices: DeviceInfo[] = [];
  let reachError: unknown = null;
  if (identity.mode === "auth0") {
    if (accountSyncDown()) {
      reachError = new Error("Auth0 is backing off");
    } else {
      try {
        const meta = await readAppMetadata(identity.userId, { fresh: true });
        remote = meta[SETTINGS_FIELD] ? parseSettings(meta[SETTINGS_FIELD], serverDefaults()) : null;
        remoteDevices = toDevices(meta[DEVICES_FIELD]);
      } catch (err) {
        markAccountSyncDown(err);
        reachError = err;
      }
    }
  }

  const base = newerSettings(remote, local.settings) ?? serverDefaults();
  const settings = applySettingsPatch(base, patch, todayKey, now);
  const devices = mergeDevices(remoteDevices, local.devices);
  await UserProfile.updateOne(
    { auth0Id: identity.userId },
    { $set: { settings }, $setOnInsert: { auth0Id: identity.userId, isDemo: identity.mode === "demo" } },
    { upsert: true },
  );

  if (identity.mode !== "auth0") return { settings, devices, sync: { status: "local", lastSyncedAt: null, error: null } };

  if (!reachError) {
    try {
      await writeAppMetadata(identity.userId, { [SETTINGS_FIELD]: settings });
      await markSynced(identity.userId, now);
      return { settings, devices, sync: { status: "synced", lastSyncedAt: now.toISOString(), error: null } };
    } catch (err) {
      markAccountSyncDown(err);
      reachError = err;
    }
  }
  const error = await markPending(identity.userId, reachError, lastSyncedAt);
  return { settings, devices, sync: { status: "pending", lastSyncedAt, error } };
}

/**
 * Note that this device was seen. Mongo is updated straight away; the result
 * says whether the device list changed enough to be worth an Auth0 write.
 */
export async function touchDevice(
  identity: Identity,
  devices: DeviceInfo[],
  seen: { id: string; kind: DeviceKind; label: string },
  now: Date,
): Promise<{ devices: DeviceInfo[]; changed: boolean }> {
  const result = upsertDevice(devices, seen, now);
  if (result.changed) {
    await UserProfile.updateOne(
      { auth0Id: identity.userId },
      { $set: { devices: result.devices.map((d) => ({ ...d, lastSeenAt: new Date(d.lastSeenAt) })) }, $setOnInsert: { auth0Id: identity.userId } },
      { upsert: true },
    );
  }
  return result;
}

/** One Auth0 write for whatever changed: the progress summary, the device list, or both. */
export async function syncAccountExtras(
  identity: Identity,
  { progress, devices }: { progress?: ProgressSnapshot; devices?: DeviceInfo[] },
  now = new Date(),
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (progress) {
    set.progress = progress;
    set.progressSyncedAt = now;
  }
  if (devices) set.devices = devices.map((d) => ({ ...d, lastSeenAt: new Date(d.lastSeenAt) }));
  if (Object.keys(set).length) await UserProfile.updateOne({ auth0Id: identity.userId }, { $set: set });
  if (identity.mode !== "auth0" || accountSyncDown() || (!progress && !devices)) return;

  try {
    await writeAppMetadata(identity.userId, {
      ...(progress ? { [PROGRESS_FIELD]: progress } : {}),
      ...(devices ? { [DEVICES_FIELD]: devices } : {}),
    });
    await markSynced(identity.userId, now);
  } catch (err) {
    console.warn("[account] could not sync progress to Auth0:", (err as Error).message);
    markAccountSyncDown(err);
  }
}

export async function lastProgressSync(userId: string): Promise<{ at: Date | null; snapshot: ProgressSnapshot | null }> {
  const profile = await UserProfile.findOne({ auth0Id: userId }).select("progress progressSyncedAt").lean();
  return {
    at: profile?.progressSyncedAt ? new Date(profile.progressSyncedAt) : null,
    snapshot: (profile?.progress as ProgressSnapshot | null) ?? null,
  };
}
