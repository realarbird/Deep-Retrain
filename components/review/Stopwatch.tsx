"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import { cx } from "@/components/ui/primitives";

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

export function Stopwatch({ elapsedMs, frozen, thresholdMs }: { elapsedMs: number; frozen?: boolean; thresholdMs: number | null }) {
  const { settings, update } = useSettings();
  const hidden = !settings.showTimer;
  const seconds = elapsedMs / 1000;
  const limit = (thresholdMs ?? 0) / 1000;
  const slow = limit > 0 && seconds >= limit;
  const progress = limit > 0 ? Math.min(1, seconds / limit) : 0;
  const r = 9;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-2 text-xs text-ink-3" aria-live="off">
      {hidden ? (
        <span className="inline-flex items-center gap-1.5">
          <span className={cx("size-1.5 rounded-full bg-ink-3", !frozen && "animate-pulse")} aria-hidden />
          Timer hidden
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-2"
          title={
            limit
              ? `This card gets ${limit}s: more for a harder question, more to read, or a longer answer. A good answer inside that moves it up a box.`
              : "This mode sets its own pace."
          }
        >
          {limit > 0 && (
            <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden>
              <circle cx="12" cy="12" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3" />
              <circle
                cx="12"
                cy="12"
                r={r}
                fill="none"
                stroke={slow ? "var(--color-warning)" : "var(--color-accent)"}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - progress)}
              />
            </svg>
          )}
          <span className="tabular-nums">
            <span className="inline-block w-12 text-ink-2">{seconds.toFixed(1)}s</span>
            {limit > 0 && <span className="text-ink-3">/ {limit}s</span>}
          </span>
        </span>
      )}
      <button
        type="button"
        onClick={() => update({ showTimer: hidden })}
        className="rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink"
        aria-label={hidden ? "Show timer" : "Hide timer"}
        title={hidden ? "Show timer" : "Hide timer (time is still measured)"}
      >
        {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </button>
    </div>
  );
}
