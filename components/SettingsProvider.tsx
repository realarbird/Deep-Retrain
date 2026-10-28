"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { api, tzOffset, zoneQuery, type DeviceInfo, type Settings, type SettingsResponse, type SyncState } from "@/lib/client";
import type { SettingsPatch } from "@/lib/settingsSchema";
import { applyDisplaySettings } from "@/lib/themeScript";
import { SettingsSaveQueue } from "@/lib/settingsSaveQueue";

interface AccountView {
  settings: Settings;
  sync: SyncState;
  devices: DeviceInfo[];
  thisDevice: string | null;
  /** Today's cap (a raised cap waits until tomorrow). */
  capToday: number | null;
}

interface SettingsContextValue extends AccountView {
  update: (patch: SettingsPatch) => void;
  saving: boolean;
  dirty: boolean;
  error: string | null;
  retry: () => void;
  replace: (next: Partial<AccountView>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const SAVE_DELAY_MS = 800;
const REFETCH_AFTER_MS = 60_000;
const OLD_TIMER_KEY = "deepretain:hide-timer";

/**
 * Settings follow the account. Changes show at once, are saved after a short
 * pause (one request for a burst of changes), and come back from the server
 * with the sync status. Coming back to the tab picks up changes made on
 * another device.
 */
export function SettingsProvider({ initial, children }: { initial: AccountView; children: ReactNode }) {
  const [view, setView] = useState<AccountView>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef(new SettingsSaveQueue());
  const timer = useRef<number | null>(null);
  const lastFetch = useRef(0);

  // Display settings apply to the whole page and are remembered for the next first paint.
  useLayoutEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    applyDisplaySettings(document.documentElement, storage, {
      theme: view.settings.theme,
      reduceMotion: view.settings.reduceMotion,
      handwriting: view.settings.handwriting,
    });
  }, [view.settings.theme, view.settings.reduceMotion, view.settings.handwriting]);

  const flush = useCallback(async function save() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const patch = queue.current.begin();
    if (!patch) return;
    setSaving(true);
    setError(null);
    let succeeded = false;
    try {
      const r = await api<SettingsResponse>("/api/settings", { method: "PATCH", json: { settings: patch, tzOffsetMinutes: tzOffset() } });
      lastFetch.current = Date.now();
      // Keep anything typed while this request was in flight.
      const settings = queue.current.overlay(r.settings);
      setView((v) => ({
        ...v,
        settings,
        sync: r.sync,
        devices: r.devices,
        capToday: r.capToday,
      }));
      succeeded = true;
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      const again = queue.current.finish(succeeded);
      setSaving(false);
      setDirty(queue.current.dirty);
      if (again) void save();
    }
  }, []);

  const update = useCallback(
    (patch: SettingsPatch) => {
      setView((v) => ({
        ...v,
        settings: { ...v.settings, ...patch, speech: { ...v.settings.speech, ...(patch.speech ?? {}) } } as Settings,
      }));
      queue.current.enqueue(patch);
      setDirty(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  const replace = useCallback((next: Partial<AccountView>) => {
    if (queue.current.dirty) return;
    setView((v) => ({ ...v, ...next }));
  }, []);

  // Save before the page goes away.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && timer.current) {
        window.clearTimeout(timer.current);
        void flush();
      }
    };
    const onOnline = () => {
      if (queue.current.dirty) void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  // Pick up changes made on another device when you come back to this tab.
  useEffect(() => {
    const onShow = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastFetch.current < REFETCH_AFTER_MS) return;
      lastFetch.current = Date.now();
      try {
        const r = await api<SettingsResponse>(`/api/settings?${zoneQuery()}`);
        replace({ settings: r.settings, sync: r.sync, devices: r.devices, capToday: r.capToday });
      } catch {
        // Offline: keep what we have.
      }
    };
    lastFetch.current = Date.now();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [replace]);

  // The timer used to be hidden per browser; carry that choice over to the account once.
  useEffect(() => {
    let hidden = false;
    try {
      hidden = window.localStorage.getItem(OLD_TIMER_KEY) === "1" && !initial.settings.updatedAt;
      window.localStorage.removeItem(OLD_TIMER_KEY);
    } catch {
      // Storage unavailable: nothing to migrate.
    }
    if (!hidden) return;
    const t = window.setTimeout(() => update({ showTimer: false }), 0);
    return () => window.clearTimeout(t);
  }, [initial.settings.updatedAt, update]);

  return <SettingsContext.Provider value={{ ...view, update, saving, dirty, error, retry: () => void flush(), replace }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
