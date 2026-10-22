"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, LayoutDashboard, LogOut, RotateCcw, Swords, TimerReset } from "lucide-react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { IngestEditor } from "@/components/ingest/IngestEditor";
import { ReviewArena } from "@/components/review/ReviewArena";
import { Button, Chip, cx, ErrorNote, ProgressBar } from "@/components/ui/primitives";
import { api, tzOffset, type CapStatus, type DashboardData, type EngineId } from "@/lib/client";

export type Tab = "dashboard" | "ingest" | "review";

const TABS: { id: Tab; label: string; short: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", short: "Dashboard", icon: LayoutDashboard },
  { id: "ingest", label: "Ingest Notes", short: "Ingest", icon: BookOpenText },
  { id: "review", label: "Review Arena", short: "Review", icon: Swords },
];

const ENGINE_TONE: Record<EngineId, { dot: string; short: string; hint: string }> = {
  ollama: { dot: "bg-emerald-400", short: "Gemma 2 · local", hint: "Gemma 2 is running on Ollama." },
  "google-ai-studio": { dot: "bg-indigo-400", short: "Gemma · hosted", hint: "Local Ollama is offline; using hosted Gemma on Google AI Studio." },
  heuristic: {
    dot: "bg-amber-400",
    short: "Offline engine",
    hint: "No Gemma endpoint is reachable, so the offline heuristic engine is grading. Reviews still work.",
  },
};

export interface AppActions {
  refresh: () => Promise<void>;
  goTo: (tab: Tab) => void;
  loadSample: (deck: "bio" | "cs") => Promise<void>;
  setCap: (cap: CapStatus) => void;
  resetDemo: () => Promise<void>;
  sampleLoading: "bio" | "cs" | null;
}

export function AppShell({ user }: { user: { name: string; mode: "auth0" | "demo"; picture: string | null } }) {
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
    if (!window.confirm("Reset all Demo Mode decks and review history?")) return;
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
  const engine = data?.engine;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6 xl:flex-nowrap">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
              <rect width="32" height="32" rx="8" fill="#0f172a" />
              <path d="M6 9c6 0 7 14 20 14" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" />
              <path d="M6 9c3 0 4 4 6 7" fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
              <circle cx="26" cy="23" r="2.5" fill="#059669" />
            </svg>
            <span className="font-display text-lg font-semibold text-white">DeepRetain</span>
          </div>

          <nav aria-label="Sections" className="scrollbar-none order-3 -mx-1 flex w-full gap-1 overflow-x-auto xl:order-none xl:w-auto xl:shrink-0">
            {TABS.map(({ id, label, short, icon: Icon }) => (
              <button
                key={id}
                onClick={() => goTo(id)}
                aria-current={tab === id ? "page" : undefined}
                className={cx(
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === id ? "bg-slate-800 text-white ring-1 ring-slate-700" : "text-slate-400 hover:text-slate-100",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
                {id === "review" && data && data.totals.dueNow > 0 && (
                  <span className="rounded-full bg-indigo-500 px-1.5 text-[11px] font-semibold text-white">{data.totals.dueNow}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {cap && (
              <div className="hidden w-28 sm:block" title="Daily cognitive cap: micro-reviews done today">
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <TimerReset className="size-3" aria-hidden /> Today
                  </span>
                  <span className="font-mono text-slate-300">
                    {cap.used}/{cap.limit}
                  </span>
                </div>
                <ProgressBar value={cap.used} max={cap.limit} tone={cap.reached ? "amber" : "indigo"} label="Daily micro-reviews used" />
              </div>
            )}
            {engine && (
              <span title={`${engine.label}. ${ENGINE_TONE[engine.id].hint}`} className="hidden items-center gap-2 whitespace-nowrap text-xs text-slate-400 md:inline-flex">
                <span className={cx("size-2 rounded-full", ENGINE_TONE[engine.id].dot)} aria-hidden />
                {ENGINE_TONE[engine.id].short}
              </span>
            )}
            <div className="flex items-center gap-2">
              {user.mode === "demo" ? (
                <>
                  <Chip tone="amber">Demo</Chip>
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={resetDemo} loading={resetting} icon={<RotateCcw className="size-3.5" aria-hidden />}>
                    Reset
                  </Button>
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={exitDemo} icon={<LogOut className="size-3.5" aria-hidden />}>
                    Exit
                  </Button>
                </>
              ) : (
                <>
                  <span className="max-w-32 truncate text-sm text-slate-300">{user.name}</span>
                  <a href="/auth/logout" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white">
                    <LogOut className="size-3.5" aria-hidden /> Log out
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {error && (
          <div className="mb-6">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {!data && !error && <p className="py-20 text-center text-slate-400">Loading your memory map…</p>}
        {data && tab === "dashboard" && <Dashboard data={data} actions={actions} />}
        {data && tab === "ingest" && <IngestEditor actions={actions} />}
        {data && tab === "review" && <ReviewArena data={data} actions={actions} isDemo={user.mode === "demo"} />}
      </main>
    </div>
  );
}
