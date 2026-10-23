"use client";

import { useEffect } from "react";
import { cx, Kbd } from "@/components/ui/primitives";

/** Pick one of four. Keys 1 to 4 work too. */
export function ChoiceAnswer({ options, busy, onSubmit }: { options: string[]; busy: boolean; onSubmit: (choice: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest("textarea, input, select")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) onSubmit(options[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, options, onSubmit]);

  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {options.map((option, i) => (
        <li key={option}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSubmit(option)}
            className={cx(
              "flex h-full w-full items-start gap-3 rounded-[5px] border border-line-strong bg-paper px-4 py-3 text-left text-[15px] leading-snug text-ink shadow-[inset_0_-2px_0_var(--color-line)]",
              "transition-colors hover:border-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60",
            )}
          >
            <Kbd>{i + 1}</Kbd>
            <span>{option}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
