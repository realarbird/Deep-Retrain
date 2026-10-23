"use client";

import { useEffect, useState } from "react";
import { CalendarHeatmap } from "@/components/charts/CalendarHeatmap";
import { ChartFrame, DataTable } from "@/components/charts/ChartFrame";
import { LegendItem, LegendSwatch, VIZ } from "@/components/charts/chartTheme";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { MaturityBar } from "@/components/charts/MaturityBar";
import { OutcomeMixChart } from "@/components/charts/OutcomeMixChart";
import { PunchCard } from "@/components/charts/PunchCard";
import { SimpleBars } from "@/components/charts/SimpleBars";
import { TrendChart } from "@/components/charts/TrendChart";
import { Ledger } from "@/components/notebook/Ledger";
import { RedPen } from "@/components/notebook/RedPen";
import { Card, ErrorNote, Kicker, Segmented } from "@/components/ui/primitives";
import { api, countWords, formatDate, formatRelative, MODE_INFO, zoneQuery, type DeckSummary, type Stats } from "@/lib/client";
import { ACCURACY_THRESHOLD, LATENCY_THRESHOLD_MS } from "@/lib/leitner";

const RANGES = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "A year" },
] as const;
type Range = (typeof RANGES)[number]["value"];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pct = (v: number | null) => (v === null ? "–" : `${v}%`);
const secs = (v: number | null) => (v === null ? "–" : `${v}s`);

function hours(minutes: number): string {
  if (minutes < 90) return countWords(minutes, "minute");
  const h = Math.round(minutes / 6) / 10;
  return `${h} hours`;
}

export function StatsView({ decks }: { decks: DeckSummary[] }) {
  const [range, setRange] = useState<Range>(30);
  const [deck, setDeck] = useState("");
  const key = `${range}|${deck}`;
  const [result, setResult] = useState<{ key: string; stats: Stats | null; error: string | null }>({ key: "", stats: null, error: null });
  // While a new range loads, the previous numbers stay up, dimmed.
  const loading = result.key !== key;
  const stats = result.stats;
  const error = result.key === key ? result.error : null;

  useEffect(() => {
    let cancelled = false;
    api<Stats>(`/api/stats?range=${range}${deck ? `&deck=${deck}` : ""}&${zoneQuery()}`)
      .then((s) => !cancelled && setResult({ key: `${range}|${deck}`, stats: s, error: null }))
      .catch((err: Error) => !cancelled && setResult((r) => ({ key: `${range}|${deck}`, stats: r.stats, error: err.message })));
    return () => {
      cancelled = true;
    };
  }, [range, deck]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium text-ink">Stats</h1>
          <p className="mt-1 text-sm text-ink-2">
            {stats ? `${formatDate(stats.range.from)} to ${formatDate(stats.range.to)}` : "Your study, in numbers."}
            {stats?.summary.includesSimulated && " Includes the sample deck's made-up history."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Range> label="Range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
          {decks.length > 1 && (
            <select
              value={deck}
              onChange={(e) => setDeck(e.target.value)}
              aria-label="Deck"
              className="rounded-[4px] border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="">All decks</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!stats ? (
        <p className="py-20 text-center text-sm text-ink-3">{loading ? "Adding things up…" : ""}</p>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <StatsBody stats={stats} />
        </div>
      )}
    </div>
  );
}

/** "12d · 40%": days to the exam and the recall you'd have on the day if you keep up. */
function deckExam(d: Stats["decks"][number]): string {
  if (d.daysLeft === null || d.daysLeft < 0) return "–";
  return `${d.daysLeft === 0 ? "today" : `${d.daysLeft}d`}${d.readiness ? ` · ${Math.round(d.readiness.keepUp * 100)}%` : ""}`;
}

function StatsBody({ stats }: { stats: Stats }) {
  const s = stats.summary;
  const L = stats.ledger;
  const none = s.reviews === 0 ? "Nothing in this range yet. Answer a few cards and this fills in." : undefined;
  const maxMode = Math.max(1, ...stats.byMode.map((m) => m.reviews));
  const busiestHours = [...stats.byHour].filter((h) => h.reviews).sort((a, b) => b.reviews - a.reviews).slice(0, 6);
  // Every card has its own time, so the line to beat is the average your cards allowed.
  const allowed = s.avgAllowedSeconds ?? LATENCY_THRESHOLD_MS / 1000;
  const latencyTop = Math.max(allowed + 4, ...stats.latencyTrend.map((p) => p.avg ?? 0));

  return (
    <div className="space-y-6">
      {/* The short version */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="p-5 sm:p-6">
          <Kicker className="mb-3">The short version</Kicker>
          <Ledger
            rows={[
              { label: "Answers", value: s.reviews },
              { label: "Right (80% or more)", value: pct(s.accuracy) },
              { label: "Average answer time", value: secs(s.avgSeconds) },
              {
                label: "Answered in time",
                value: pct(s.inTime),
                note: s.avgAllowedSeconds === null ? undefined : `Your cards allowed ${secs(s.avgAllowedSeconds)} on average.`,
              },
              { label: "Days you studied", value: s.studyDays },
              { label: "Streak", value: countWords(s.streak, "day"), note: `Longest: ${countWords(s.longestStreak, "day")}.` },
              { label: "Time spent answering", value: `about ${hours(s.minutes)}` },
              {
                label: "Sessions",
                value: s.sessions,
                note: s.avgSessionMinutes === null ? undefined : s.avgSessionMinutes < 1 ? "Under a minute each, on average." : `About ${Math.round(s.avgSessionMinutes)} min each.`,
              },
              { label: "Days you hit the limit", value: s.capHitDays },
            ]}
          />
        </Card>
        <Card className="flex flex-col justify-between p-5 sm:p-6">
          <div>
            <Kicker className="mb-3">The laziness ledger</Kicker>
            {L.reviewsDone ? (
              <p className="font-serif text-2xl leading-snug text-ink">
                You answered {L.reviewsDone.toLocaleString()} {L.reviewsDone === 1 ? "card" : "cards"}. Re-reading every card every day would have been{" "}
                {L.rereadReviews.toLocaleString()}.
              </p>
            ) : (
              <p className="font-serif text-2xl leading-snug text-ink">Once you start, this counts the reviews the schedule saves you.</p>
            )}
            {L.reviewsSkipped > 0 && (
              <p className="mt-3 text-[15px] text-ink-2">
                That&apos;s {L.reviewsSkipped.toLocaleString()} reviews you didn&apos;t have to do
                {L.minutesSaved > 0 ? `, about ${hours(L.minutesSaved)} at your pace` : ""}. The cards you skipped weren&apos;t due because you already knew them.
              </p>
            )}
          </div>
          {L.reviewsSkipped > 0 && <RedPen className="mt-4 self-end">time well not spent</RedPen>}
        </Card>
      </div>

      <ChartFrame
        title="Study calendar"
        subtitle="The last six months. Darker days used more of your daily limit."
        empty={stats.calendar.every((d) => d.count === 0) ? "No study days yet." : undefined}
        chart={<CalendarHeatmap days={stats.calendar} />}
        table={
          <DataTable
            head={["Day", "Answers"]}
            rows={stats.calendar
              .filter((d) => d.count)
              .reverse()
              .map((d) => [formatDate(d.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }), d.count])}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title="How often you're right"
          subtitle="Average score by day."
          empty={none}
          legend={
            <>
              <LegendSwatch color={VIZ.primarySoft} label="That day" />
              <LegendItem color={VIZ.primary} label="7-day average" />
              <LegendItem color={VIZ.threshold} label={`${ACCURACY_THRESHOLD}% to pass`} dashed />
            </>
          }
          chart={<TrendChart points={stats.accuracyTrend} unit="%" threshold={ACCURACY_THRESHOLD} thresholdLabel="80%" domain={[0, 100]} />}
          table={
            <DataTable
              head={["Day", "Average", "7-day", "Answers"]}
              rows={stats.accuracyTrend.filter((p) => p.count).map((p) => [formatDate(p.date), pct(Math.round(p.avg ?? 0)), pct(p.movingAvg === null ? null : Math.round(p.movingAvg)), p.count])}
            />
          }
        />
        <ChartFrame
          title="How quickly you answer"
          subtitle="Average seconds per answer, by day."
          empty={none}
          legend={
            <>
              <LegendSwatch color={VIZ.primarySoft} label="That day" />
              <LegendItem color={VIZ.primary} label="7-day average" />
              <LegendItem color={VIZ.threshold} label="Time allowed, on average" dashed />
            </>
          }
          chart={<TrendChart points={stats.latencyTrend} unit="s" threshold={allowed} thresholdLabel={`${Math.round(allowed)}s`} domain={[0, Math.ceil(latencyTop / 4) * 4]} />}
          table={
            <DataTable
              head={["Day", "Average", "7-day", "Answers"]}
              rows={stats.latencyTrend.filter((p) => p.count).map((p) => [formatDate(p.date), secs(p.avg === null ? null : Math.round(p.avg * 10) / 10), secs(p.movingAvg === null ? null : Math.round(p.movingAvg * 10) / 10), p.count])}
            />
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title="Coming up"
          subtitle="Cards due over the next two weeks, against your daily limit."
          legend={
            <>
              <LegendSwatch color={VIZ.primary} label="Fits under the limit" />
              <LegendSwatch color={VIZ.overflow} label="Waits a day" />
            </>
          }
          chart={<ForecastChart days={stats.forecast} cap={stats.forecast[1]?.capacity ?? stats.forecast[0]?.capacity ?? 15} />}
          table={
            <DataTable
              head={["Day", "Due", "Fits", "Waits"]}
              rows={stats.forecast.map((d, i) => [i === 0 ? "Today" : formatDate(d.date, { weekday: "short", month: "short", day: "numeric" }), d.due, d.scheduled, d.overflow])}
            />
          }
        />
        <ChartFrame
          title="What each week's answers did"
          subtitle="Moved a card up, kept it where it was, or sent it back to box 1."
          empty={none}
          legend={
            <>
              <LegendSwatch color={VIZ.good} label="Moved up" />
              <LegendSwatch color={VIZ.warning} label="Slow, stayed" />
              <LegendSwatch color={VIZ.critical} label="Back to box 1" />
            </>
          }
          chart={<OutcomeMixChart weeks={stats.outcomesByWeek} />}
          table={<DataTable head={["Week of", "Up", "Stayed", "Back"]} rows={stats.outcomesByWeek.map((w) => [formatDate(w.week), w.promote, w.hesitation, w.reset])} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title="How much you'd remember right now"
          subtitle={
            stats.recall.average === null
              ? "An estimate for each reviewed card, from how long it's been and which box it's in."
              : `About ${stats.recall.average}% on average. ${stats.recall.strong} strong, ${stats.recall.fading} fading, ${stats.recall.weak} weak${stats.recall.unseen ? `, ${stats.recall.unseen} not reviewed yet` : ""}.`
          }
          empty={stats.recall.average === null ? "Review a few cards first." : undefined}
          chart={
            <div className="space-y-6">
              <SimpleBars
                data={stats.recall.histogram.map((b) => ({ label: `${b.from}`, value: b.count, note: `${b.from}–${b.to}% recall` }))}
                valueLabel="cards"
                height={180}
              />
              <div>
                <p className="mb-2 text-xs text-ink-3">Where the cards are</p>
                <MaturityBar maturity={stats.maturity} />
              </div>
            </div>
          }
          table={
            <DataTable
              head={["Estimated recall", "Cards"]}
              rows={[...stats.recall.histogram].reverse().map((b) => [`${b.from}–${b.to}%`, b.count])}
            />
          }
        />
        <ChartFrame
          title="Does the schedule hold?"
          subtitle="How often answers pass, by the box the card was in. Around 80% or more means the gaps are about right."
          empty={none}
          chart={
            <SimpleBars
              data={stats.passByBox.map((b) => ({ label: `Box ${b.box}`, value: b.passRate, note: `${b.reviews} answers` }))}
              valueLabel="passed"
              unit="%"
              domain={[0, 100]}
              reference={{ y: ACCURACY_THRESHOLD, label: "80%" }}
            />
          }
          table={<DataTable head={["Box", "Answers", "Passed"]} rows={stats.passByBox.map((b) => [`Box ${b.box}`, b.reviews, pct(b.passRate)])} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title="How you study"
          subtitle="Each way of studying, side by side."
          empty={stats.byMode.length ? undefined : "Nothing yet."}
          chart={
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th scope="col" className="py-1.5 font-normal">Mode</th>
                  <th scope="col" className="py-1.5 font-normal">Answers</th>
                  <th scope="col" className="py-1.5 text-right font-normal">Right</th>
                  <th scope="col" className="py-1.5 text-right font-normal">Time</th>
                  <th scope="col" className="py-1.5 text-right font-normal">In time</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {stats.byMode.map((m) => (
                  <tr key={m.mode} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2 text-left font-normal text-ink">
                      {MODE_INFO[m.mode].label}
                    </th>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 rounded-r-[3px] bg-accent" style={{ width: `${Math.max(4, (m.reviews / maxMode) * 96)}px` }} aria-hidden />
                        <span className="text-ink-2">{m.reviews}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right text-ink">{pct(m.accuracy)}</td>
                    <td className="py-2 text-right text-ink-2">{secs(m.avgSeconds)}</td>
                    <td className="py-2 text-right text-ink-2">{pct(m.inTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
        <ChartFrame
          title="Do you know what you know?"
          subtitle="When you said how sure you were, how often you were right."
          empty={stats.calibration.every((c) => !c.reviews) ? "Turn on “Ask how sure I am” in Settings to fill this in." : undefined}
          chart={
            <div>
              <SimpleBars
                data={stats.calibration.map((c) => ({ label: ["Guessing", "Unsure", "Sure"][c.confidence - 1], value: c.accuracy, note: `${c.reviews} answers` }))}
                valueLabel="right"
                unit="%"
                domain={[0, 100]}
                height={180}
              />
              {stats.thinking && (
                <p className="mt-3 text-sm text-ink-2">
                  On written answers you spend about {stats.thinking.thinkSeconds}s thinking before the first key and {stats.thinking.typeSeconds}s typing.
                </p>
              )}
            </div>
          }
          table={
            <DataTable
              head={["You said", "Answers", "Right"]}
              rows={stats.calibration.map((c) => [["Guessing", "Unsure", "Sure"][c.confidence - 1], c.reviews, pct(c.accuracy)])}
            />
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title="When you study"
          subtitle="Weekday by hour. Darker means more answers."
          empty={none}
          chart={<PunchCard cells={stats.punchCard} />}
          table={
            <DataTable
              head={["Hour", "Answers", "Average score"]}
              rows={busiestHours.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, h.reviews, pct(h.avgScore)])}
            />
          }
        />
        <Card className="p-5">
          <h3 className="font-serif text-[17px] font-medium text-ink">Where you study</h3>
          <p className="mt-0.5 text-sm text-ink-2">Answers by device. Your account keeps them in step.</p>
          {stats.byDevice.length ? (
            <ul className="mt-4 divide-y divide-line text-sm">
              {stats.byDevice.map((d) => (
                <li key={d.label} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-ink">{d.label}</span>
                  <span className="tabular-nums text-ink-2">{d.reviews}</span>
                  <span className="hidden w-28 text-right text-xs text-ink-3 sm:inline">{formatRelative(d.lastAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-3">Nothing yet.</p>
          )}
          <div className="mt-6">
            <p className="mb-2 text-xs text-ink-3">By weekday</p>
            <ul className="grid grid-cols-7 gap-1 text-center text-xs">
              {stats.byWeekday.map((w) => (
                <li key={w.weekday}>
                  <span className="block text-ink-3">{DAYS[w.weekday]}</span>
                  <span className="block tabular-nums text-ink">{w.reviews}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-serif text-[17px] font-medium text-ink">Cards that keep slipping</h3>
          <p className="mt-0.5 text-sm text-ink-2">Sent back to box 1 at least twice. Worth rewording, or splitting in two.</p>
          {stats.leeches.length ? (
            <ul className="mt-4 divide-y divide-line text-sm">
              {stats.leeches.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{c.title}</span>
                    <span className="block truncate text-xs text-ink-3">{c.deckTitle}</span>
                  </span>
                  <span className="text-xs text-ink-2">missed {countWords(c.lapses, "time")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-3">None. Nothing keeps slipping.</p>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-serif text-[17px] font-medium text-ink">Getting quicker</h3>
          <p className="mt-0.5 text-sm text-ink-2">Answer time, first answers against the latest.</p>
          {stats.improved.length ? (
            <ul className="mt-4 divide-y divide-line text-sm">
              {stats.improved.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-ink">{c.title}</span>
                  <span className="tabular-nums text-ink-2">
                    {c.fromSeconds}s → <span className="text-ink">{c.toSeconds}s</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-3">Shows up once cards have a few answers each.</p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-serif text-[17px] font-medium text-ink">Decks</h3>
        {/* Phones get one block per deck; wider screens get the table. */}
        <ul className="mt-3 divide-y divide-line sm:hidden">
          {stats.decks.map((d) => (
            <li key={d.id} className="py-3">
              <p className="text-ink">{d.title}</p>
              <p className="text-xs text-ink-3">{d.lastStudied ? `Last studied ${formatRelative(d.lastStudied)}` : "Not studied in this range"}</p>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-sm tabular-nums">
                {[
                  ["Cards", d.cards],
                  ["Due", d.due],
                  ["Box 5", d.mastered],
                  ["Score", pct(d.avgScore)],
                  ["Recall now", pct(d.recall)],
                  ["Exam", deckExam(d)],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt className="text-xs text-ink-3">{k}</dt>
                    <dd className="text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="mt-4 w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th scope="col" className="py-1.5 font-normal">Deck</th>
                <th scope="col" className="py-1.5 text-right font-normal">Cards</th>
                <th scope="col" className="py-1.5 text-right font-normal">Due</th>
                <th scope="col" className="py-1.5 text-right font-normal">Box 5</th>
                <th scope="col" className="py-1.5 text-right font-normal">Score</th>
                <th scope="col" className="py-1.5 text-right font-normal">Recall now</th>
                <th scope="col" className="py-1.5 text-right font-normal">Exam</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {stats.decks.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 text-left font-normal">
                    <span className="block text-ink">{d.title}</span>
                    <span className="block text-xs text-ink-3">{d.lastStudied ? `Last studied ${formatRelative(d.lastStudied)}` : "Not studied in this range"}</span>
                  </th>
                  <td className="py-2 text-right text-ink">{d.cards}</td>
                  <td className="py-2 text-right text-ink">{d.due}</td>
                  <td className="py-2 text-right text-ink">{d.mastered}</td>
                  <td className="py-2 text-right text-ink-2">{pct(d.avgScore)}</td>
                  <td className="py-2 text-right text-ink">{pct(d.recall)}</td>
                  <td className="py-2 text-right text-ink-2">
                    <span title={d.readiness ? `If you keep up: ${Math.round(d.readiness.keepUp * 100)}%. If you stop today: ${Math.round(d.readiness.stopToday * 100)}%.` : undefined}>
                      {deckExam(d)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Recall is estimated with the same forgetting curve as the chart on the front page: R = e<sup>−t/S</sup>, where a card&apos;s stability S grows with each box.
        </p>
      </Card>
    </div>
  );
}
