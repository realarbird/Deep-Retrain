"use client";

import { useEffect, useState } from "react";
import type { AppActions } from "@/components/AppShell";
import { Tortoise } from "@/components/notebook/Doodles";
import { RedPen } from "@/components/notebook/RedPen";
import { Button } from "@/components/ui/primitives";
import type { CapStatus } from "@/lib/client";

function countdown(to: string): string {
  const ms = Math.max(0, new Date(to).getTime() - Date.now());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function RestScreen({ cap, actions, isDemo }: { cap: CapStatus; actions: AppActions; isDemo: boolean }) {
  const [left, setLeft] = useState(() => countdown(cap.resetsAt));

  useEffect(() => {
    const t = window.setInterval(() => setLeft(countdown(cap.resetsAt)), 1000);
    return () => window.clearInterval(t);
  }, [cap.resetsAt]);

  return (
    <div className="mx-auto max-w-2xl py-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <Tortoise className="h-20 w-36" sleeping />
        <RedPen className="mb-3" rotate={-4}>
          slow and steady
        </RedPen>
      </div>
      <h1 className="mt-6 font-serif text-3xl font-medium text-ink">Done for today.</h1>
      <p className="mt-2 text-[15px] text-ink-2">
        That&apos;s your {cap.limit} reviews. The rest wait until tomorrow. New reviews open in{" "}
        <span className="font-medium tabular-nums text-ink" aria-label="Time until reviews open again">
          {left}
        </span>
        .
      </p>

      <div className="mt-8 space-y-3 border-t border-line pt-6 text-[15px] leading-relaxed text-ink-2">
        <p>
          <span className="font-medium text-ink">Why stop here?</span> Each extra review in one sitting adds less than the one before.
          The same time spread over several days is worth more, because every gap makes you rebuild the memory.
        </p>
        <p>
          <span className="font-medium text-ink">Sleep does some of the work.</span> Overnight, the brain replays what you studied and
          files it away for the long term. The break is part of the learning.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => actions.goTo("today")}>
          Back to today
        </Button>
        <Button variant="ghost" onClick={() => actions.goTo("stats")}>
          Look at your stats
        </Button>
        {isDemo && (
          <Button variant="ghost" onClick={actions.resetDemo}>
            Reset the demo
          </Button>
        )}
      </div>
    </div>
  );
}
