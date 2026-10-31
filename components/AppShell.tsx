"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CardsBrowser } from "@/components/cards/CardsBrowser";
import { IngestEditor } from "@/components/ingest/IngestEditor";
import { SettingsView } from "@/components/settings/SettingsView";
import { SettingsProvider, useSettings } from "@/components/SettingsProvider";
import { StatsView } from "@/components/stats/StatsView";
import { StudyView } from "@/components/study/StudyView";
import { Today } from "@/components/today/Today";
import { Wordmark } from "@/components/Wordmark";
import { Button, cx, ErrorNote } from "@/components/ui/primitives";
import { api, engineName, formatRelative, tzOffset, zoneQuery, type CapStatus, type DashboardData } from "@/lib/client";
import type { DefaultMode, SessionSize } from "@/lib/settingsSchema";

export type Tab = "today" | "study" | "cards" | "stats" | "add" | "settings";
type Mode = "auth0" | "demo";

/** Demo Mode is sample decks only; adding notes needs an account. */
const TABS: { id: Tab; label: string; modes: Mode[] }[] = [
  { id: "today", label: "Today", modes: ["auth0", "demo"] },
  { id: "study", label: "Study", modes: ["auth0", "demo"] },
  { id: "cards", label: "Cards", modes: ["auth0", "demo"] },
  { id: "stats", label: "Stats", modes: ["auth0", "demo"] },
  { id: "add", label: "Add notes", modes: ["auth0"] },
  { id: "settings", label: "Settings", modes: ["auth0", "demo"] },
];

export interface StudyRequest {
  mode?: DefaultMode;
  size?: SessionSize;
  deckId?: string;
  /** Start straight away instead of showing the session setup. */
  now?: boolean;
}

export interface AppActions {
  refresh: () => Promise<void>;
  goTo: (tab: Tab) => void;
  startStudy: (request?: StudyRequest) => void;
  loadSample: (deck: "bio" | "cs") => Promise<void>;
  setCap: (cap: CapStatus) => void;
  resetDemo: () => Promise<void>;
  sampleLoading: "bio" | "cs" | null;
}

function tabFromHash(mode: Mode): Tab | null {
  if (typeof window === "undefined") return null;
  const id = window.location.hash.replace(/^#/, "");
  const tab = TABS.find((t) => t.id === id);
  return tab && tab.modes.includes(mode) ? tab.id : null;
}

export function AppShell({ user, apps }: { user: { name: string; mode: Mode; picture: string | null }; apps: ReactNode }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState<"bio" | "cs" | null>(null);
  const [resetting, setResetting] = useState(false);
  const [studyRequest, setStudyRequest] = useState<StudyRequest | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api<DashboardData>(`/api/dashboard?${zoneQuery()}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<DashboardData>(`/api/dashboard?${zoneQuery()}`)
      .then((next) => !cancelled && setData(next))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // Each screen has its own address (#study, #stats …), so it can be bookmarked or opened on another device.
  useEffect(() => {
    const sync = () => {
      const fromHash = tabFromHash(user.mode);
      if (fromHash) setTab(fromHash);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [user.mode]);

  const goTo = useCallback(
    (next: Tab) => {
      setTab(next);
      if (window.location.hash !== `#${next}`) window.history.replaceState(null, "", `#${next}`);
      if (next === "today") void refresh();
      window.scrollTo({ top: 0 });
    },
    [refresh],
  );

  const startStudy = useCallback(
    (request: StudyRequest = {}) => {
      setStudyRequest({ now: true, ...request });
      goTo("study");
    },
    [goTo],
  );

  const loadSample = useCallback(
    async (deck: "bio" | "cs") => {
      setSampleLoading(deck);
      try {
        await api("/api/sample", { method: "POST", json: { deck, tzOffsetMinutes: tzOffset() } });
        await refresh();
        goTo("today");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSampleLoading(null);
      }
    },
    [refresh, goTo],
  );

  const resetDemo = useCallback(async () => {
    if (!window.confirm("Reset the demo? This clears the sample decks and your review history.")) return;
    setResetting(true);
    try {
      await api("/api/demo", { method: "DELETE" });
      await refresh();
      goTo("today");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResetting(false);
    }
  }, [refresh, goTo]);

  async function exitDemo() {
    await api("/api/demo?exit=1", { method: "DELETE" }).catch(() => undefined);
    router.refresh();
  }

  const setCap = useCallback((cap: CapStatus) => {
    setData((d) => (d ? { ...d, cap, totals: { ...d.totals, reviewedToday: cap.used } } : d));
  }, []);

  const actions: AppActions = { refresh, goTo, startStudy, loadSample, setCap, resetDemo, sampleLoading };
  const tabs = TABS.filter((t) => t.modes.includes(user.mode));

  if (!data) {
    return (
      <div className="min-h-screen">
        <Header user={user} tabs={tabs} tab={tab} goTo={goTo} onReset={resetDemo} onExit={exitDemo} resetting={resetting} />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {error ? <ErrorNote>{error}</ErrorNote> : <p className="py-20 text-center text-sm text-ink-3">Opening your notebook…</p>}
        </main>
      </div>
    );
  }

  return (
    <SettingsProvider
      initial={{ settings: data.settings, sync: data.sync, devices: data.devices, thisDevice: data.thisDevice, capToday: data.cap.limit }}
    >
      <div className="min-h-screen">
        <Header user={user} tabs={tabs} tab={tab} goTo={goTo} onReset={resetDemo} onExit={exitDemo} resetting={resetting} data={data} />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {error && (
            <div className="mb-6">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          {tab === "today" && <Today data={data} actions={actions} isDemo={user.mode === "demo"} />}
          {tab === "study" && (
            <StudyView data={data} actions={actions} isDemo={user.mode === "demo"} request={studyRequest} onRequestUsed={() => setStudyRequest(null)} />
          )}
          {tab === "cards" && <CardsBrowser data={data} actions={actions} isDemo={user.mode === "demo"} />}
          {tab === "stats" && <StatsView decks={data.decks} />}
          {tab === "add" && user.mode === "auth0" && <IngestEditor actions={actions} hasAiKey={data.aiKey.saved} />}
          {tab === "settings" && <SettingsView isDemo={user.mode === "demo"} onKeyChange={refresh} apps={apps} />}
          {tab !== "study" && (
            <p className="mt-14 border-t border-line pt-4 text-xs text-ink-3" title={data.engine.label}>
              {data.engine.id === "heuristic"
                ? "Answers you write are marked by a simple offline grader for now."
                : `Answers you write are marked by ${engineName(data.engine.id)}, an open model.`}
              {data.engine.id === "heuristic" && user.mode === "auth0" && !data.aiKey.saved && (
                <>
                  {" "}
                  <button className="underline underline-offset-2 hover:text-ink" onClick={() => goTo("settings")}>
                    Add your free AI key
                  </button>{" "}
                  to use Gemma.
                </>
              )}
            </p>
          )}
        </main>
      </div>
    </SettingsProvider>
  );
}

function Header({
  user,
  tabs,
  tab,
  goTo,
  onReset,
  onExit,
  resetting,
  data,
}: {
  user: { name: string; mode: Mode };
  tabs: { id: Tab; label: string }[];
  tab: Tab;
  goTo: (tab: Tab) => void;
  onReset: () => void;
  onExit: () => void;
  resetting: boolean;
  data?: DashboardData;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pt-3 sm:px-6 md:flex-nowrap md:pt-0">
        <button onClick={() => goTo("today")} className="rounded focus-visible:outline-2 focus-visible:outline-accent" aria-label="Today">
          <Wordmark />
        </button>

        <nav aria-label="Sections" className="scrollbar-none order-3 -mx-1 flex w-full gap-0.5 overflow-x-auto md:order-none md:w-auto">
          {tabs.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                goTo(id);
              }}
              aria-current={tab === id ? "page" : undefined}
              className={cx(
                "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-3 text-sm transition-colors md:py-4",
                tab === id ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
              )}
            >
              {label}
              {id === "study" && data && data.totals.dueNow > 0 && !data.cap.reached && (
                <span className="rounded-full bg-sunken px-1.5 text-[11px] tabular-nums text-ink-2">{data.totals.dueNow}</span>
              )}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm">
          {data && <CapMeter cap={data.cap} />}
          {data && <SyncChip onClick={() => goTo("settings")} />}
          {user.mode === "demo" ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onReset} loading={resetting}>
                Reset
              </Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onExit}>
                Exit demo
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="hidden max-w-36 truncate text-ink-2 lg:inline">{user.name}</span>
              <a href="/auth/logout" className="text-xs text-ink-2 hover:text-ink">
                Log out
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** "9 of 15": today's reviews as tally marks against the cap. */
function CapMeter({ cap }: { cap: CapStatus }) {
  return (
    <div className="hidden items-center gap-2 sm:flex" title="Reviews done today, out of your daily limit">
      <span className="text-xs text-ink-3">Today</span>
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: cap.limit }, (_, i) => (
          <span key={i} className={cx("h-3 w-[3px] rounded-full", i < cap.used ? (cap.reached ? "bg-warning" : "bg-accent") : "bg-line-strong/60")} />
        ))}
      </span>
      <span className="text-xs tabular-nums text-ink-2">
        {cap.used}/{cap.limit}
      </span>
    </div>
  );
}

function SyncChip({ onClick }: { onClick: () => void }) {
  const { sync, saving } = useSettings();
  const meta = saving
    ? { dot: "bg-accent animate-pulse", label: "Saving" }
    : {
        synced: { dot: "bg-good", label: "Synced" },
        pending: { dot: "bg-warning", label: "Will sync" },
        offline: { dot: "bg-critical", label: "Not syncing" },
        local: { dot: "bg-ink-3", label: "This browser" },
      }[sync.status];
  const title =
    sync.status === "local"
      ? "Demo Mode: settings stay with this demo. Sign in to sync across devices."
      : sync.status === "synced"
        ? `Settings and progress are saved to your Auth0 account${sync.lastSyncedAt ? `, last ${formatRelative(sync.lastSyncedAt)}` : ""}.`
        : (sync.error ?? "Saved here. It will sync to your Auth0 account shortly.");
  return (
    <button onClick={onClick} title={title} className="hidden items-center gap-1.5 rounded px-1.5 py-1 text-xs text-ink-2 hover:bg-sunken hover:text-ink sm:inline-flex">
      <span className={cx("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </button>
  );
}
