"use client";

import { useEffect, useState } from "react";
import type { AppActions } from "@/components/AppShell";
import { Button, Card } from "@/components/ui/primitives";
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
    <Card className="mx-auto max-w-xl p-8 sm:p-10">
      <h1 className="text-xl font-semibold text-ink">That&apos;s today&apos;s {cap.limit} reviews</h1>
      <p className="mt-2 text-sm text-ink-2">The rest wait until tomorrow. New reviews open in</p>
      <p className="mt-3 font-mono text-3xl tabular-nums text-ink" aria-label="Time until reviews open again">
        {left}
      </p>

      <div className="mt-8 space-y-3 border-t border-line pt-6 text-sm leading-relaxed text-ink-2">
        <p>
          <span className="font-medium text-ink">Why stop here?</span> Each extra review in one sitting adds less than the
          one before. The same time spread over several days is worth more, because every gap makes you rebuild the memory.
        </p>
        <p>
          <span className="font-medium text-ink">Sleep helps.</span> Overnight, the brain replays what you studied and moves
          it into long-term memory. The break is part of the learning.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => actions.goTo("dashboard")}>
          Back to overview
        </Button>
        {isDemo && (
          <Button variant="ghost" onClick={actions.resetDemo}>
            Reset the demo
          </Button>
        )}
      </div>
    </Card>
  );
}
