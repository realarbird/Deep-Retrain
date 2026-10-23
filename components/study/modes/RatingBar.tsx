"use client";

import { useEffect } from "react";
import { cx, Kbd } from "@/components/ui/primitives";
import type { SelfRating } from "@/lib/client";

const RATINGS: { value: SelfRating; label: string; hint: string }[] = [
  { value: "again", label: "Forgot", hint: "Starts over tomorrow" },
  { value: "hard", label: "Hard", hint: "Stays where it is" },
  { value: "good", label: "Got it", hint: "Moves up if you were quick" },
  { value: "easy", label: "Easy", hint: "Moves up if you were quick" },
];

/** How did that go? Keys 1 to 4. */
export function RatingBar({ busy, onRate }: { busy: boolean; onRate: (r: SelfRating) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) onRate(RATINGS[n - 1].value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onRate]);

  return (
    <div>
      <p className="mb-2 text-sm text-ink-2">How did that go?</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RATINGS.map((r, i) => (
          <button
            key={r.value}
            type="button"
            disabled={busy}
            onClick={() => onRate(r.value)}
            className={cx(
              "flex flex-col items-start rounded-[5px] border border-line-strong bg-paper px-3 py-2 text-left shadow-[inset_0_-2px_0_var(--color-line)]",
              "transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60",
              r.value === "again" && "hover:border-critical",
            )}
          >
            <span className="flex w-full items-center justify-between text-[15px] font-medium text-ink">
              {r.label} <Kbd>{i + 1}</Kbd>
            </span>
            <span className="text-xs text-ink-3">{r.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
