"use client";

import { useEffect, useState } from "react";
import { BarChart3, Moon, RotateCcw } from "lucide-react";
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
    <Card className="mx-auto max-w-2xl overflow-hidden animate-rise">
      <div className="bg-gradient-to-b from-indigo-500/15 to-transparent px-6 pb-2 pt-10 text-center sm:px-10">
        <Moon className="mx-auto size-10 text-indigo-200" aria-hidden />
        <h1 className="mt-4 font-display text-3xl font-semibold text-white">Memory Consolidation Active</h1>
        <p className="mt-2 text-sm text-slate-400">
          You&apos;ve done all {cap.limit} micro-reviews for today. Cramming mode is locked.
        </p>
        <p className="mt-6 font-mono text-4xl tabular-nums text-indigo-100" aria-label="Time until the cap resets">
          {left}
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">until tomorrow&apos;s reviews unlock</p>
      </div>

      <div className="space-y-4 px-6 py-8 text-sm leading-relaxed text-slate-300 sm:px-10">
        <p>
          <strong className="text-slate-100">Why stop now?</strong> Each extra review today adds less and less. The
          <em> spacing effect</em> is one of the most replicated results in learning science: the same study time spread
          across days beats one long session, because every gap forces your brain to rebuild the memory.
        </p>
        <p>
          <strong className="text-slate-100">What happens tonight.</strong> During slow-wave sleep your hippocampus replays
          today&apos;s material and hands it to long-term cortical storage. Rest isn&apos;t a break from learning; it&apos;s
          the part where memories become durable.
        </p>
        <p className="text-slate-400">Slow and steady: a few minutes a day, and the forgetting curve flattens on its own.</p>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="secondary" onClick={() => actions.goTo("dashboard")} icon={<BarChart3 className="size-4" aria-hidden />}>
            See my forgetting curve
          </Button>
          {isDemo && (
            <Button variant="ghost" onClick={actions.resetDemo} icon={<RotateCcw className="size-4" aria-hidden />}>
              Judges: reset demo to try again
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
