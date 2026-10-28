"use client";

import { useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import { speak, speechRecognitionSupported, speechSynthesisSupported } from "@/components/study/useSpeech";
import { Button, Card, ErrorNote, Kicker, SectionTitle, Segmented, Switch, Tag } from "@/components/ui/primitives";
import { api, formatRelative, MODE_INFO, zoneQuery, type DeviceInfo, type SettingsResponse, type SyncState } from "@/lib/client";
import { CAP_MAX, CAP_MIN, DEFAULT_MODES, EXTRA_TIME, type DefaultMode, type ExtraTime, type SessionSize, type ThemeSetting } from "@/lib/settingsSchema";
import { PrivacyPolicy } from "@/components/PrivacyPolicy";
import { AiKeySettings } from "./AiKeySettings";
import { DeleteAccount } from "./DeleteAccount";

const DEVICE_ICON = { phone: Smartphone, tablet: Tablet, desktop: Monitor };
const EXTRA_TIME_LABEL: Record<ExtraTime, string> = { 0: "None", 25: "+25%", 50: "+50%", 100: "Double" };

function syncSentence(sync: SyncState, isDemo: boolean): string {
  if (isDemo) return "This is a demo, so your settings are saved for this demo only. Sign in to keep them in your Auth0 account and use them on every device.";
  if (sync.status === "synced") {
    return `Settings, the devices you use and a progress summary live in your Auth0 account${sync.lastSyncedAt ? ` (last saved ${formatRelative(sync.lastSyncedAt)})` : ""}. Your cards and history are stored under the same account, so signing in anywhere picks up where you left off.`;
  }
  if (sync.status === "pending") return sync.error ?? "Saved here. It will be copied to your Auth0 account in a moment.";
  return sync.error ?? "Auth0 can't be reached right now. Everything is saved here and will sync when it's back.";
}

export function SettingsView({ isDemo, onKeyChange }: { isDemo: boolean; onKeyChange: () => Promise<void> }) {
  const { settings, update, sync, devices, thisDevice, capToday, saving, dirty, error, retry, replace } = useSettings();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const canHear = speechRecognitionSupported();
  const canSpeak = speechSynthesisSupported();

  async function syncNow() {
    setSyncing(true);
    setSyncError(null);
    try {
      const r = await api<{ sync: SyncState; devices: DeviceInfo[] }>(`/api/sync?${zoneQuery()}`, { method: "POST" });
      replace({ sync: r.sync, devices: r.devices });
    } catch (err) {
      setSyncError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function forget(id: string) {
    if (!window.confirm("Remove this device from the list? It stays signed in until you log out on it.")) return;
    try {
      const r = await api<SettingsResponse>(`/api/settings?device=${encodeURIComponent(id)}&${zoneQuery()}`, { method: "DELETE" });
      replace({ devices: r.devices });
    } catch (err) {
      setSyncError((err as Error).message);
    }
  }

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-8">
        <div>
          <h1 className="font-serif text-3xl font-medium text-ink">Settings</h1>
          <p role="status" className="mt-1 text-sm text-ink-3">{saving ? "Saving…" : dirty ? "Unsaved changes." : "Changes save on their own."}</p>
          {error && (
            <div className="mt-2">
              <ErrorNote>{error}</ErrorNote>
              <Button variant="secondary" className="mt-2 text-xs" onClick={retry} disabled={saving}>Retry save</Button>
            </div>
          )}
        </div>

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Daily limit" subtitle="Reviews per day before the rest wait until tomorrow." />
          <div className="flex flex-wrap items-center gap-4">
            <input
              type="range"
              min={CAP_MIN}
              max={CAP_MAX}
              value={settings.dailyCap}
              onChange={(e) => update({ dailyCap: Number(e.target.value) })}
              aria-label="Daily limit"
              className="w-56 accent-[var(--color-ink)]"
            />
            <span className="text-2xl font-semibold tabular-nums text-ink">{settings.dailyCap}</span>
          </div>
          {capToday !== null && settings.dailyCap > capToday && (
            <p className="mt-2 text-sm text-ink-2">Today stays at {capToday}. A higher limit starts tomorrow, so it can&apos;t stretch today&apos;s session.</p>
          )}
          <p className="mt-2 text-xs text-ink-3">
            Between {CAP_MIN} and {CAP_MAX}. Fifteen is plenty for most people; more in one sitting adds less than you&apos;d think.
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Studying" />
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block text-ink">Start with</span>
              <select
                value={settings.defaultMode}
                onChange={(e) => update({ defaultMode: e.target.value as DefaultMode })}
                className="w-full max-w-xs rounded-[4px] border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
              >
                {DEFAULT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_INFO[m].label}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="mb-1.5 text-sm text-ink">Cards per session</p>
              <Segmented<string>
                label="Cards per session"
                value={String(settings.sessionSize)}
                onChange={(v) => update({ sessionSize: (v === "all" ? "all" : Number(v)) as SessionSize })}
                options={[
                  { value: "5", label: "5" },
                  { value: "10", label: "10" },
                  { value: "15", label: "15" },
                  { value: "all", label: "All I can" },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm text-ink">In Auto, cards you know well are answered by</p>
              <Segmented
                label="Free recall"
                value={settings.freeRecall}
                onChange={(v) => update({ freeRecall: v })}
                options={[
                  { value: "write", label: "Writing" },
                  { value: "voice", label: "Speaking" },
                ]}
              />
              {settings.freeRecall === "voice" && !canHear && <p className="mt-1 text-xs text-ink-3">This browser can&apos;t do speech-to-text, so it will fall back to writing here.</p>}
            </div>
            <div>
              <p className="mb-1.5 text-sm text-ink">More time on every card</p>
              <Segmented<ExtraTime>
                label="More time on every card"
                value={settings.extraTime}
                onChange={(v) => update({ extraTime: v })}
                options={EXTRA_TIME.map((v) => ({ value: v, label: EXTRA_TIME_LABEL[v] }))}
              />
              <p className="mt-1 text-xs text-ink-3">
                Each card already gets more time for a harder question or a longer answer. This adds to all of them: for slower typing, reading in a second language, or a slow day.
              </p>
            </div>
            <div className="divide-y divide-line border-t border-line">
              <Switch
                checked={settings.askConfidence}
                onChange={(v) => update({ askConfidence: v })}
                label="Ask how sure I am"
                hint="Before you see the result. Shows on Stats whether your confidence matches your answers."
              />
              <Switch checked={settings.showTimer} onChange={(v) => update({ showTimer: v })} label="Show the timer" hint="Time is measured either way; some people find it calmer not to watch." />
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Listening" subtitle="For Listen mode, which reads cards aloud." />
          {canSpeak ? (
            <div className="space-y-4 text-sm">
              <label className="flex flex-wrap items-center gap-3">
                <span className="w-28 text-ink">Reading speed</span>
                <input
                  type="range"
                  min={0.6}
                  max={1.4}
                  step={0.1}
                  value={settings.speech.rate}
                  onChange={(e) => update({ speech: { rate: Number(e.target.value) } })}
                  className="w-44 accent-[var(--color-ink)]"
                />
                <span className="tabular-nums text-ink-2">{settings.speech.rate.toFixed(1)}×</span>
              </label>
              <div>
                <label className="flex flex-wrap items-center gap-3">
                  <span className="w-28 text-ink">Time to answer</span>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    value={settings.speech.pauseSec}
                    onChange={(e) => update({ speech: { pauseSec: Number(e.target.value) } })}
                    className="w-44 accent-[var(--color-ink)]"
                  />
                  <span className="tabular-nums text-ink-2">{settings.speech.pauseSec}s</span>
                </label>
                <p className="mt-1 text-xs text-ink-3">Harder cards and longer answers wait a few seconds more.</p>
              </div>
              <Button variant="secondary" className="text-xs" onClick={() => void speak("Glycolysis. Where does it happen?", { rate: settings.speech.rate })}>
                Try it
              </Button>
            </div>
          ) : (
            <p className="text-sm text-ink-2">This browser can&apos;t read aloud, so Listen mode isn&apos;t available here.</p>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Look and feel" />
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm text-ink">Theme</p>
              <Segmented<ThemeSetting>
                label="Theme"
                value={settings.theme}
                onChange={(v) => update({ theme: v })}
                options={[
                  { value: "system", label: "Match my device" },
                  { value: "light", label: "Paper" },
                  { value: "dark", label: "Night" },
                ]}
              />
            </div>
            <div className="divide-y divide-line border-t border-line">
              <Switch checked={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} label="Reduce motion" hint="No card flips or sliding; changes fade instead." />
              <Switch
                checked={settings.handwriting}
                onChange={(v) => update({ handwriting: v })}
                label="Handwritten notes"
                hint="The red-pen remarks on marked cards. Off shows them as plain italics."
              />
            </div>
          </div>
        </Card>

        {!isDemo && <AiKeySettings onChange={onKeyChange} />}
      </div>

      <aside className="space-y-8">
        <section>
          <Kicker className="mb-2">Where this is saved</Kicker>
          <p className="text-sm leading-relaxed text-ink-2">{syncSentence(sync, isDemo)}</p>
          {!isDemo && (
            <div className="mt-3 flex items-center gap-3">
              <Button variant="secondary" className="text-xs" onClick={syncNow} loading={syncing}>
                Sync now
              </Button>
              {syncError && <span className="text-xs text-critical-text">{syncError}</span>}
            </div>
          )}
        </section>

        <section>
          <Kicker className="mb-2">Devices</Kicker>
          {devices.length ? (
            <ul className="divide-y divide-line border-y border-line text-sm">
              {devices.map((d) => {
                const Icon = DEVICE_ICON[d.kind] ?? Monitor;
                return (
                  <li key={d.id} className="flex items-center gap-3 py-2.5">
                    <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{d.label || "Unknown device"}</span>
                      <span className="block text-xs text-ink-3">Last used {formatRelative(d.lastSeenAt)}</span>
                    </span>
                    {d.id === thisDevice ? (
                      <Tag tone="accent">This one</Tag>
                    ) : (
                      !isDemo && (
                        <button className="text-xs text-ink-3 hover:text-critical-text" onClick={() => void forget(d.id)}>
                          Remove
                        </button>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Devices show up here after you open DeepRetain on them.</p>
          )}
          {!isDemo && <p className="mt-2 text-xs text-ink-3">Removing a device only takes it off this list. To sign it out, log out on that device.</p>}
        </section>

        <section>
          <Kicker className="mb-2">Your data</Kicker>
          <p className="text-sm text-ink-2">Download everything: decks, cards, every answer and your settings.</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>
              <a className="text-accent-text underline underline-offset-2" href="/api/export">
                Everything (JSON)
              </a>
            </li>
            <li>
              <a className="text-accent-text underline underline-offset-2" href="/api/export?format=cards.csv">
                Cards (CSV)
              </a>
            </li>
            <li>
              <a className="text-accent-text underline underline-offset-2" href="/api/export?format=reviews.csv">
                Every answer (CSV)
              </a>
            </li>
          </ul>
        </section>

        {!isDemo && <DeleteAccount />}
      </aside>

      <div className="lg:col-span-2">
        <PrivacyPolicy />
      </div>
    </div>
  );
}
