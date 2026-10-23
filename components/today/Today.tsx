"use client";

import type { AppActions } from "@/components/AppShell";
import { CardBoxes } from "@/components/notebook/CardBoxes";
import { Tortoise } from "@/components/notebook/Doodles";
import { Ledger } from "@/components/notebook/Ledger";
import { RedPen } from "@/components/notebook/RedPen";
import { SampleDeckButtons } from "@/components/SampleDeckButtons";
import { useSettings } from "@/components/SettingsProvider";
import { Button, Card, Kicker, SectionTitle } from "@/components/ui/primitives";
import { capitalize, countWords, formatDate, formatRelative, MODE_INFO, type DashboardData, type Outcome } from "@/lib/client";
import { WeekAhead } from "./WeekAhead";

const OUTCOME_STAMP: Record<Outcome, { label: string; className: string }> = {
  promote: { label: "up", className: "text-good-text" },
  hesitation: { label: "slow", className: "text-ink-2" },
  reset: { label: "again", className: "text-critical-text" },
};

/** A rough time for the reviews left today, from your own recent pace. */
function minutesFor(cards: number, avgSeconds: number | null): string {
  const seconds = cards * (avgSeconds ?? 12);
  if (seconds < 60) return "Under a minute";
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "About a minute" : `About ${countWords(minutes, "minute")}`;
}

function headline(data: DashboardData): { title: string; sub: string } {
  const { totals, cap, nextDue } = data;
  const doable = Math.min(totals.dueNow, cap.remaining);
  if (cap.reached) {
    return {
      title: `That's today's ${cap.limit}. Done.`,
      sub: "The rest wait until tomorrow, which is when they'll do the most good.",
    };
  }
  if (totals.dueNow === 0) {
    return {
      title: "Nothing due right now.",
      sub: nextDue ? `${nextDue.conceptTitle} comes back ${formatRelative(nextDue.at)}. The gap is the point.` : "Every card is waiting for its next interval.",
    };
  }
  return {
    title: `${capitalize(countWords(doable, "card"))} due. ${minutesFor(doable, totals.avgLatency7d)}.`,
    sub:
      totals.dueNow > cap.remaining
        ? `${totals.dueNow} are due, but today's limit leaves room for ${cap.remaining}. The others keep until tomorrow.`
        : `${cap.remaining} of today's ${cap.limit} reviews left.`,
  };
}

export function Today({ data, actions, isDemo }: { data: DashboardData; actions: AppActions; isDemo: boolean }) {
  const { settings } = useSettings();
  if (data.totals.cards === 0) return <EmptyToday actions={actions} isDemo={isDemo} hasAiKey={data.aiKey.saved} />;

  const { title, sub } = headline(data);
  const { totals, cap, exam } = data;
  const canStudy = totals.dueNow > 0 && !cap.reached;
  const mode = MODE_INFO[settings.defaultMode];

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="space-y-8">
        <section>
          <Kicker>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Kicker>
          <h1 className="mt-2 font-serif text-[1.9rem] font-medium leading-tight text-ink sm:text-[2.3rem]">{title}</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">{sub}</p>
          {canStudy ? (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button className="px-5" onClick={() => actions.startStudy({ mode: settings.defaultMode })}>
                Start{settings.defaultMode !== "auto" ? `: ${mode.label}` : ""}
              </Button>
              {totals.dueNow > 5 && cap.remaining > 5 && (
                <Button variant="secondary" onClick={() => actions.startStudy({ mode: settings.defaultMode, size: 5 })}>
                  Just five
                </Button>
              )}
              <Button variant="ghost" onClick={() => actions.startStudy({ now: false })}>
                Pick a way to study
              </Button>
            </div>
          ) : cap.reached ? (
            <div className="mt-6 flex items-end gap-4">
              <Tortoise className="h-16 w-28" sleeping />
              <RedPen className="mb-2">slow and steady</RedPen>
            </div>
          ) : null}
        </section>

        {exam && (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <Kicker>{exam.examLabel || "Exam"}</Kicker>
              <p className="mt-1 font-serif text-lg text-ink">
                {exam.daysLeft === 0 ? "Today" : exam.daysLeft === 1 ? "Tomorrow" : `In ${exam.daysLeft} days`}
                <span className="text-ink-3"> · {formatDate(exam.examDate, { weekday: "short", month: "short", day: "numeric" })}</span>
              </p>
              <p className="mt-0.5 text-sm text-ink-2">{exam.title}</p>
            </div>
            {exam.readiness && (
              <dl className="flex gap-6 text-sm">
                <div>
                  <dt className="text-xs text-ink-3">If you keep up</dt>
                  <dd className="mt-0.5 text-2xl font-semibold text-ink">{Math.round(exam.readiness.keepUp * 100)}%</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">If you stop today</dt>
                  <dd className="mt-0.5 text-2xl font-semibold text-ink-2">{Math.round(exam.readiness.stopToday * 100)}%</dd>
                </div>
              </dl>
            )}
            <p className="w-full text-xs text-ink-3">
              Estimated recall on exam morning. Reviews that would land after the exam are moved into the last few days before it.
            </p>
          </Card>
        )}

        <Card className="p-5 sm:p-6">
          <SectionTitle title="Your card boxes" />
          <CardBoxes boxes={data.boxes} />
        </Card>
      </div>

      <aside className="space-y-8">
        <section>
          <Kicker className="mb-3">The tally</Kicker>
          <Ledger
            rows={[
              { label: "Due now", value: totals.dueNow },
              { label: "Done today", value: `${cap.used} of ${cap.limit}` },
              {
                label: "Streak",
                value: countWords(totals.streakDays, "day"),
                note: totals.longestStreak > totals.streakDays ? `Longest so far: ${totals.longestStreak} days.` : undefined,
              },
              {
                label: "Estimated recall",
                value: totals.recallNow === null ? "not yet" : `${totals.recallNow}%`,
                note: "How much you'd remember if tested right now, across reviewed cards.",
              },
              { label: "This week", value: totals.minutesThisWeek ? `about ${totals.minutesThisWeek} min` : "nothing yet" },
              { label: "In box 5", value: totals.mastered },
            ]}
          />
        </section>

        <section>
          <Kicker className="mb-3">The week ahead</Kicker>
          <WeekAhead forecast={data.forecast} cap={cap.limit} />
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <Kicker>Last few answers</Kicker>
            <button className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline" onClick={() => actions.goTo("stats")}>
              All stats
            </button>
          </div>
          {data.recentReviews.length ? (
            <ul className="divide-y divide-line text-sm">
              {data.recentReviews.map((r) => {
                const stamp = OUTCOME_STAMP[r.outcome];
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-ink">{r.conceptTitle}</span>
                    <span className="hidden text-xs text-ink-3 sm:inline">{MODE_INFO[r.mode]?.label ?? "Write"}</span>
                    <span className={`stamp ${stamp.className}`}>{stamp.label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Your answers will be listed here.</p>
          )}
          {data.hasSimulatedHistory && <p className="mt-3 text-xs text-ink-3">The sample deck comes with three weeks of made-up history so the charts have something to show.</p>}
        </section>
      </aside>
    </div>
  );
}

function EmptyToday({ actions, isDemo, hasAiKey }: { actions: AppActions; isDemo: boolean; hasAiKey: boolean }) {
  return (
    <div className="mx-auto grid max-w-3xl items-center gap-8 py-6 sm:grid-cols-[1fr_auto]">
      <div>
        {isDemo ? (
          <>
            <h1 className="font-serif text-3xl font-medium text-ink">Pick a sample deck</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              Each has ten concepts and three weeks of made-up history, so the stats have something to show. Six cards are due straight
              away, and the biology deck comes with an exam twelve days out.
            </p>
            <SampleDeckButtons actions={actions} className="mt-6 flex flex-wrap gap-2" />
            <p className="mt-6 text-xs text-ink-3">To study your own notes, exit the demo and sign in.</p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-3xl font-medium text-ink">An empty notebook</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              Paste some lecture notes or import a file. Gemma splits them into single ideas, each with a question, and the first review
              is due straight away.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={() => actions.goTo("add")}>Add notes</Button>
              {!hasAiKey && (
                <Button variant="secondary" onClick={() => actions.goTo("settings")}>
                  Add your free AI key first
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      <Tortoise className="mx-auto h-24 w-40 sm:mx-0" />
    </div>
  );
}
