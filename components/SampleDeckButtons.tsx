"use client";

import { Cpu, Dna } from "lucide-react";
import type { AppActions } from "@/components/AppShell";
import { Button } from "@/components/ui/primitives";

export function SampleDeckButtons({ actions, className }: { actions: AppActions; className?: string }) {
  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      <Button
        variant="secondary"
        onClick={() => actions.loadSample("bio")}
        loading={actions.sampleLoading === "bio"}
        disabled={actions.sampleLoading !== null}
        icon={<Dna className="size-4 text-emerald-300" aria-hidden />}
      >
        Load Sample AP Biology Deck
      </Button>
      <Button
        variant="secondary"
        onClick={() => actions.loadSample("cs")}
        loading={actions.sampleLoading === "cs"}
        disabled={actions.sampleLoading !== null}
        icon={<Cpu className="size-4 text-indigo-300" aria-hidden />}
      >
        Load Sample CS Deck
      </Button>
    </div>
  );
}
