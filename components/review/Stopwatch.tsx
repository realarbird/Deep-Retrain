"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { LATENCY_THRESHOLD_S } from "@/lib/client";

const HIDE_KEY = "deepretain:hide-timer";

/**
 * Measures response latency for one card. Time while the tab is hidden is not
 * counted, so switching windows never reads as hesitation.
 */
export function useStopwatch(resetKey: string, running: boolean) {
  const accumulated = useRef(0);
  const startedAt = useRef<number | null>(null);
  const timedKey = useRef<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [shownKey, setShownKey] = useState(resetKey);
  if (shownKey !== resetKey) {
    setShownKey(resetKey);
    setElapsed(0);
  }

  const read = useCallback(() => {
    const live = startedAt.current !== null ? performance.now() - startedAt.current : 0;
    return Math.round(accumulated.current + live);
  }, []);

  useEffect(() => {
    if (timedKey.current !== resetKey) {
      timedKey.current = resetKey;
      accumulated.current = 0;
      startedAt.current = null;
    }
    if (!running) {
      if (startedAt.current !== null) {
        accumulated.current += performance.now() - startedAt.current;
        startedAt.current = null;
      }
      return;
    }

    const resume = () => {
      if (startedAt.current === null && document.visibilityState === "visible") startedAt.current = performance.now();
    };
    const pause = () => {
      if (startedAt.current !== null) {
        accumulated.current += performance.now() - startedAt.current;
        startedAt.current = null;
      }
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? pause() : resume());

    resume();
    document.addEventListener("visibilitychange", onVisibility);
    const tick = window.setInterval(() => setElapsed(read()), 100);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(tick);
      pause();
    };
  }, [running, resetKey, read]);

  return { elapsed, read };
}

export function Stopwatch({ elapsedMs, frozen }: { elapsedMs: number; frozen?: boolean }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false; // storage unavailable: keep the timer visible
    }
  });

  function toggle() {
    setHidden((h) => {
      try {
        window.localStorage.setItem(HIDE_KEY, h ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !h;
    });
  }

  const seconds = elapsedMs / 1000;
  const slow = seconds >= LATENCY_THRESHOLD_S;
  const progress = Math.min(1, seconds / LATENCY_THRESHOLD_S);
  const r = 9;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400" aria-live="off">
      {hidden ? (
        <span className="inline-flex items-center gap-1.5">
          <span className={cx("size-1.5 rounded-full", frozen ? "bg-slate-500" : "animate-pulse bg-slate-400")} aria-hidden />
          Timing quietly
        </span>
      ) : (
        <span className="inline-flex items-center gap-2" title="Response latency. Under 12s with 80%+ accuracy earns a promotion.">
          <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden>
            <circle cx="12" cy="12" r={r} fill="none" stroke="#1e293b" strokeWidth="3" />
            <circle
              cx="12"
              cy="12"
              r={r}
              fill="none"
              stroke={slow ? "#fbbf24" : "#818cf8"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - progress)}
            />
          </svg>
          <span className={cx("w-12 font-mono tabular-nums", slow ? "text-amber-300" : "text-slate-300")}>{seconds.toFixed(1)}s</span>
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
        aria-label={hidden ? "Show timer" : "Hide timer"}
        title={hidden ? "Show timer" : "Hide timer (latency is still measured)"}
      >
        {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </button>
    </div>
  );
}
