"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { IngestEditor } from "@/components/ingest/IngestEditor";
import { ReviewArena } from "@/components/review/ReviewArena";
import { AiKeySettings } from "@/components/settings/AiKeySettings";
import { Wordmark } from "@/components/Wordmark";
import { Button, cx, ErrorNote, ProgressBar } from "@/components/ui/primitives";
import { api, engineName, tzOffset, type CapStatus, type DashboardData } from "@/lib/client";

export type Tab = "dashboard" | "ingest" | "review" | "settings";
type Mode = "auth0" | "demo";

/** Demo Mode is sample decks only; adding notes and the AI key need an account. */
const TABS: { id: Tab; label: string; modes: Mode[] }[] = [
  { id: "dashboard", label: "Overview", modes: ["auth0", "demo"] },
  { id: "review", label: "Review", modes: ["auth0", "demo"] },
  { id: "ingest", label: "Add notes", modes: ["auth0"] },
  { id: "settings", label: "AI key", modes: ["auth0"] },
];

export interface AppActions {
  refresh: () => Promise<void>;
  goTo: (tab: Tab) => void;
  loadSample: (deck: "bio" | "cs") => Promise<void>;
  setCap: (cap: CapStatus) => void;
  resetDemo: () => Promise<void>;
  sampleLoading: "bio" | "cs" | null;
}

export function AppShell({ user }: { user: { name: string; mode: Mode; picture: string | null } }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState<"bio" | "cs" | null>(null);
  const [resetting, setResetting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api<DashboardData>(`/api/dashboard?tz=${tzOffset()}`);
      setData(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<DashboardData>(`/api/dashboard?tz=${tzOffset()}`)
      .then((next) => !cancelled && setData(next))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSample = useCallback(
    async (deck: "bio" | "cs") => {
      setSampleLoading(deck);
      try {
        await api("/api/sample", { method: "POST", json: { deck, tzOffsetMinutes: tzOffset() } });
        await refresh();
        setTab("review");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSampleLoading(null);
      }
    },
    [refresh],
  );

  const resetDemo = useCallback(async () => {
    if (!window.confirm("Reset the demo? This clears the sample decks and your review history.")) return;
    setResetting(true);
    try {
      await api("/api/demo", { method: "DELETE" });
      await refresh();
      setTab("dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResetting(false);
    }
  }, [refresh]);

  async function exitDemo() {
    await api("/api/demo?exit=1", { method: "DELETE" }).catch(() => undefined);
    router.refresh();
  }

  const setCap = useCallback((cap: CapStatus) => {
    setData((d) => (d ? { ...d, cap, totals: { ...d.totals, reviewedToday: cap.used } } : d));
  }, []);

  const goTo = useCallback(
    (next: Tab) => {
      setTab(next);
      if (next === "dashboard") void refresh();
    },
    [refresh],
  );

  const actions: AppActions = { refresh, goTo, loadSample, setCap, resetDemo, sampleLoading };
  const cap = data?.cap;
  const tabs = TABS.filter((t) => t.modes.includes(user.mode));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-page/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 pt-3 sm:px-6 md:flex-nowrap md:pt-0">
          <Wordmark />

          <nav aria-label="Sections" className="scrollbar-none order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => goTo(id)}
                aria-current={tab === id ? "page" : undefined}
                className={cx(
                  "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-3 text-sm transition-colors md:py-4",
                  tab === id ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {label}
                {id === "review" && data && data.totals.dueNow > 0 && (
                  <span className="font-mono text-xs text-ink-3">{data.totals.dueNow}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4 text-sm">
            {cap && (
              <div className="hidden w-24 sm:block" title="Reviews done today, out of the daily limit">
                <div className="mb-1 flex justify-between text-xs text-ink-3">
                  <span>Today</span>
                  <span className="font-mono tabular-nums text-ink-2">
                    {cap.used}/{cap.limit}
                  </span>
                </div>
                <ProgressBar value={cap.used} max={cap.limit} tone={cap.reached ? "warning" : "accent"} label="Reviews done today" />
              </div>
            )}
            {user.mode === "demo" ? (
              <div className="flex items-center gap-1">
                <span className="mr-1 text-xs text-ink-3">Demo</span>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={resetDemo} loading={resetting}>
                  Reset
                </Button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={exitDemo}>
                  Exit
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="hidden max-w-36 truncate text-ink-2 sm:inline">{user.name}</span>
                <a href="/auth/logout" className="text-xs text-ink-2 hover:text-ink">
                  Log out
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {error && (
          <div className="mb-6">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {!data && !error && <p className="py-20 text-center text-sm text-ink-3">Loading…</p>}
        {data && tab === "dashboard" && <Dashboard data={data} actions={actions} isDemo={user.mode === "demo"} />}
        {data && tab === "ingest" && user.mode === "auth0" && <IngestEditor actions={actions} hasAiKey={data.aiKey.saved} />}
        {data && tab === "review" && <ReviewArena data={data} actions={actions} isDemo={user.mode === "demo"} />}
        {data && tab === "settings" && user.mode === "auth0" && <AiKeySettings onChange={refresh} />}
        {data && tab !== "review" && (
          <p className="mt-12 text-xs text-ink-3" title={data.engine.label}>
            Answers are graded by {engineName(data.engine.id)}
            {data.engine.id === "heuristic" && user.mode === "auth0" && !data.aiKey.saved && (
              <>
                {" · "}
                <button className="underline underline-offset-2 hover:text-ink" onClick={() => goTo("settings")}>
                  add your AI key
                </button>
              </>
            )}
          </p>
        )}
      </main>
    </div>
  );
}
