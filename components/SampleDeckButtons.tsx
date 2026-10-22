"use client";

import type { AppActions } from "@/components/AppShell";
import { Button } from "@/components/ui/primitives";

const DECKS = [
  { key: "bio", label: "AP Biology" },
  { key: "cs", label: "Computer Science" },
] as const;

/** Demo Mode only: signed-in learners study their own notes. */
export function SampleDeckButtons({ actions, className }: { actions: AppActions; className?: string }) {
  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {DECKS.map(({ key, label }, i) => (
        <Button
          key={key}
          variant={i === 0 ? "primary" : "secondary"}
          onClick={() => actions.loadSample(key)}
          loading={actions.sampleLoading === key}
          disabled={actions.sampleLoading !== null}
        >
          {label} deck
        </Button>
      ))}
    </div>
  );
}
