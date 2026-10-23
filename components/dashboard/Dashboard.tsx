"use client";

import type { AppActions } from "@/components/AppShell";
import { SampleDeckButtons } from "@/components/SampleDeckButtons";
import { Button, Card, SectionTitle, Tag } from "@/components/ui/primitives";
import { formatRelative, formatSeconds, type DashboardData, type Outcome } from "@/lib/client";
import { LatencyTrendChart } from "./LatencyTrendChart";
import { LeitnerBoxes } from "./LeitnerBoxes";
import { StatTiles } from "./StatTiles";

const OUTCOME_META: Record<Outcome, { label: string; tone: "good" | "warning" | "critical" }> = {
  promote: { label: "Moved up", tone: "good" },
  hesitation: { label: "Slow", tone: "warning" },
  reset: { label: "Reset", tone: "critical" },
};

export function Dashboard({ data, actions, isDemo }: { data: DashboardData; actions: AppActions; isDemo: boolean }) {
  if (data.totals.cards === 0) return <EmptyDashboard actions={actions} isDemo={isDemo} hasAiKey={data.aiKey.saved} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {data.totals.dueNow > 0 ? `${data.totals.dueNow} due for review` : "Nothing due"}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {data.cap.reached
              ? "You've done today's reviews. The rest wait until tomorrow."
              : data.totals.dueNow === 0 && data.nextDue
                ? `Next up: ${data.nextDue.conceptTitle}, ${formatRelative(data.nextDue.at)}.`
                : `${data.cap.remaining} of today's ${data.cap.limit} reviews left.`}
          </p>
        </div>
        {data.totals.dueNow > 0 && !data.cap.reached && <Button onClick={() => actions.goTo("review")}>Start reviewing</Button>}
      </div>

      {!isDemo && !data.aiKey.saved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-sunken px-4 py-3 text-sm">
          <p className="text-ink-2">
            <span className="font-medium text-ink">Add your free AI key</span> to have answers graded by Gemma 4. Until
            then, the offline grader checks answers by keyword.
          </p>
          <Button variant="secondary" className="py-1.5" onClick={() => actions.goTo("settings")}>
            Add key
          </Button>
        </div>
      )}

      <StatTiles data={data} />

      <div className="grid gap-6 lg:grid-cols-2">
        <LeitnerBoxes boxes={data.boxes} />
        <LatencyTrendChart trend={data.latencyTrend ?? []} simulated={data.hasSimulatedHistory} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Recent reviews" />
          {data.recentReviews.length ? (
            <ul className="divide-y divide-line">
              {data.recentReviews.map((r) => {
                const meta = OUTCOME_META[r.outcome];
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">{r.conceptTitle}</span>
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                    <span className="w-full font-mono text-xs tabular-nums text-ink-3 sm:w-auto">
                      {r.score}% · {formatSeconds(r.latencyMs)} · box {r.boxBefore}→{r.boxAfter}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Your reviews will be listed here.</p>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Decks"
            action={
              !isDemo && (
                <Button variant="ghost" className="-my-1 px-2 py-1 text-xs" onClick={() => actions.goTo("ingest")}>
                  Add notes
                </Button>
              )
            }
          />
          <ul className="divide-y divide-line">
            {data.decks.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{d.title}</span>
                {d.sourceType === "sample" && <Tag>Sample</Tag>}
                <span className="font-mono text-xs tabular-nums text-ink-3">{d.cardCount} cards</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function EmptyDashboard({ actions, isDemo, hasAiKey }: { actions: AppActions; isDemo: boolean; hasAiKey: boolean }) {
  return (
    <Card className="mx-auto max-w-xl p-8 sm:p-10">
      {isDemo ? (
        <>
          <h1 className="text-xl font-semibold text-ink">Pick a sample deck</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Each deck has ten concepts and three weeks of made-up review history, so the charts have something to show. Six
            cards are due right away.
          </p>
          <SampleDeckButtons actions={actions} className="mt-6 flex flex-wrap gap-2" />
          <p className="mt-6 text-xs text-ink-3">To study your own notes, exit the demo and sign in.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-ink">Add your first notes</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Paste lecture notes or import a file. They&apos;re split into single ideas, each with a question, and the first
            review is due straight away.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => actions.goTo("ingest")}>Add notes</Button>
            {!hasAiKey && (
              <Button variant="secondary" onClick={() => actions.goTo("settings")}>
                Add your AI key first
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
