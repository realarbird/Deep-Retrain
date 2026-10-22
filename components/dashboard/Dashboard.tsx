"use client";

import { ArrowRight, BookOpenText, CheckCircle2, CircleAlert, RotateCcw, Sprout } from "lucide-react";
import type { AppActions } from "@/components/AppShell";
import { SampleDeckButtons } from "@/components/SampleDeckButtons";
import { Button, Card, Chip, SectionTitle } from "@/components/ui/primitives";
import { ENGINE_SHORT, formatRelative, formatSeconds, type DashboardData, type Outcome } from "@/lib/client";
import { LatencyTrendChart } from "./LatencyTrendChart";
import { LeitnerBoxes } from "./LeitnerBoxes";
import { RetentionCurveChart } from "./RetentionCurveChart";
import { StatTiles } from "./StatTiles";

const OUTCOME_META: Record<Outcome, { label: string; tone: "emerald" | "amber" | "rose"; icon: typeof CheckCircle2 }> = {
  promote: { label: "Promoted", tone: "emerald", icon: CheckCircle2 },
  hesitation: { label: "Hesitated", tone: "amber", icon: CircleAlert },
  reset: { label: "Reset", tone: "rose", icon: RotateCcw },
};

export function Dashboard({ data, actions }: { data: DashboardData; actions: AppActions }) {
  if (data.totals.cards === 0) return <EmptyDashboard actions={actions} />;

  return (
    <div className="space-y-6 animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">Your memory map</h1>
          <p className="mt-1 text-sm text-slate-400">
            {data.totals.dueNow > 0
              ? `${data.totals.dueNow} concept${data.totals.dueNow === 1 ? " is" : "s are"} ready for a micro-review.`
              : data.nextDue
                ? `Nothing due. Next up: ${data.nextDue.conceptTitle}, ${formatRelative(data.nextDue.at)}.`
                : "Nothing due right now."}
          </p>
        </div>
        {data.totals.dueNow > 0 && !data.cap.reached && (
          <Button onClick={() => actions.goTo("review")} icon={<ArrowRight className="size-4" aria-hidden />}>
            Start micro-review
          </Button>
        )}
      </div>

      <StatTiles data={data} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <LeitnerBoxes boxes={data.boxes} />
        </div>
        <div className="lg:col-span-3">
          <RetentionCurveChart retention={data.retention} />
        </div>
      </div>

      <LatencyTrendChart trend={data.latencyTrend} simulated={data.hasSimulatedHistory} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Recent micro-reviews" />
          {data.recentReviews.length ? (
            <ul className="divide-y divide-slate-800">
              {data.recentReviews.map((r) => {
                const meta = OUTCOME_META[r.outcome];
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <Chip tone={meta.tone} icon={<meta.icon className="size-3" aria-hidden />}>
                      {meta.label}
                    </Chip>
                    <span className="min-w-0 flex-1 truncate text-slate-200">{r.conceptTitle}</span>
                    <span className="font-mono text-xs text-slate-400">
                      {r.score}% · {formatSeconds(r.latencyMs)} · Box {r.boxBefore}→{r.boxAfter}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No reviews yet today. Your first micro-review will show up here.</p>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Decks"
            action={
              <Button variant="ghost" className="text-xs" onClick={() => actions.goTo("ingest")} icon={<BookOpenText className="size-3.5" aria-hidden />}>
                Add notes
              </Button>
            }
          />
          <ul className="divide-y divide-slate-800">
            {data.decks.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-200">{d.title}</span>
                <Chip tone={d.sourceType === "sample" ? "sky" : "indigo"}>{d.sourceType === "sample" ? "Sample" : "Your notes"}</Chip>
                <span className="font-mono text-xs text-slate-400">{d.cardCount} cards</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">AI engine right now: {ENGINE_SHORT[data.engine.id]}</p>
        </Card>
      </div>
    </div>
  );
}

function EmptyDashboard({ actions }: { actions: AppActions }) {
  return (
    <Card className="mx-auto max-w-2xl p-8 text-center animate-rise sm:p-12">
      <Sprout className="mx-auto size-8 text-emerald-300" aria-hidden />
      <h1 className="mt-4 font-display text-2xl font-semibold text-white">Plant your first deck</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
        Load a sample deck to try the latency-aware review loop in one click, or paste your own lecture notes and let
        Gemma pull out the core concepts.
      </p>
      <SampleDeckButtons actions={actions} className="mt-6 flex flex-wrap justify-center gap-2" />
      <Button variant="ghost" className="mt-3" onClick={() => actions.goTo("ingest")} icon={<BookOpenText className="size-4" aria-hidden />}>
        Paste my own notes
      </Button>
    </Card>
  );
}
