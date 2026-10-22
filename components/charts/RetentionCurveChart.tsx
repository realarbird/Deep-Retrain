"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildRetentionCurves, RETENTION_CHART_DAYS } from "@/lib/retention";
import { AXIS_PROPS, LegendItem, TooltipBox, VIZ } from "./chartTheme";

const curves = buildRetentionCurves();
const TICKS = Array.from({ length: RETENTION_CHART_DAYS / 7 + 1 }, (_, i) => i * 7);
const CRAM_DAYS = curves.cramSessions.map((s) => s.day);
const lastCram = curves.cramSessions[curves.cramSessions.length - 1];
const [firstExam, apExam] = curves.exams;
const COMPARE = [
  { day: firstExam.day, note: "exam" },
  { day: firstExam.day + 7, note: "+1 wk" },
  { day: apExam.day, note: apExam.label },
];

function pct(value: number | null): string {
  return value === null ? "–" : `${Math.round(value)}%`;
}

export function RetentionCurveChart() {
  const { points, reviewDays, exams } = curves;

  return (
    <figure>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendItem color={VIZ.cram} label={`Cram on days ${CRAM_DAYS.join(" and ")}`} />
        <LegendItem color={VIZ.spaced} label="DeepRetain" />
        <span className="inline-flex items-center gap-2 text-xs text-ink-2">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="4" fill={VIZ.spaced} />
          </svg>
          Review
        </span>
      </div>

      <div className="mt-3 h-64" role="img" aria-label={`Line chart of modeled recall over ${RETENTION_CHART_DAYS} days. See the table below for values.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke={VIZ.grid} />
            <XAxis
              dataKey="day"
              type="number"
              domain={[0, RETENTION_CHART_DAYS]}
              ticks={TICKS}
              tickFormatter={(d) => (d === 0 ? "Day 0" : String(d))}
              {...AXIS_PROPS}
            />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} {...AXIS_PROPS} axisLine={false} />
            {exams.map((exam, i) => (
              <ReferenceLine
                key={exam.day}
                x={exam.day}
                stroke={VIZ.threshold}
                strokeDasharray="3 3"
                // The last exam sits near the right edge, so its label goes on the left of the line, above the curves.
                label={{
                  value: exam.label,
                  position: i === exams.length - 1 ? "insideTopRight" : "insideBottomLeft",
                  fill: VIZ.textSecondary,
                  fontSize: 11,
                }}
              />
            ))}
            <Tooltip
              cursor={{ stroke: VIZ.axis }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!active || !p) return null;
                const events = [
                  reviewDays.includes(p.day) && "Review",
                  CRAM_DAYS.includes(p.day) && "Cram",
                  exams.find((e) => e.day === p.day)?.label,
                ].filter(Boolean);
                return (
                  <TooltipBox
                    title={[`Day ${p.day}`, ...events].join(" · ")}
                    rows={[
                      { label: "Cramming", value: p.cramming === null ? "not studied yet" : pct(p.cramming), swatch: VIZ.cram },
                      { label: "DeepRetain", value: pct(p.spaced), swatch: VIZ.spaced },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="cramming"
              stroke={VIZ.cram}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="spaced"
              stroke={VIZ.spaced}
              strokeWidth={2}
              dot={(props: { cx?: number; cy?: number; payload?: { day: number } }) =>
                props.payload && reviewDays.includes(props.payload.day) ? (
                  <circle key={props.payload.day} cx={props.cx} cy={props.cy} r={4} fill={VIZ.spaced} stroke={VIZ.surface} strokeWidth={2} />
                ) : (
                  <g key={props.payload?.day} />
                )
              }
              activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Modeled recall on exam day, a week later, and on AP Exam day</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th scope="col" className="py-1.5 font-normal">Recall</th>
            {COMPARE.map(({ day, note }) => (
              <th key={day} scope="col" className="py-1.5 text-right font-normal">
                Day {day}
                <span className="hidden sm:inline"> ({note})</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {(
            [
              ["Cramming", "cramming"],
              ["DeepRetain", "spaced"],
            ] as const
          ).map(([label, key]) => (
            <tr key={key} className="border-b border-line last:border-0">
              <th scope="row" className="py-1.5 text-left font-sans font-normal text-ink-2">
                {label}
              </th>
              {COMPARE.map(({ day }) => (
                <td key={day} className="py-1.5 text-right text-ink">
                  {pct(points[day][key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <figcaption className="mt-3 text-xs leading-relaxed text-ink-3">
        Modeled with exponential forgetting, R = e<sup>−t/S</sup>. A crammed memory starts with about two days of stability,
        and the day {lastCram.day} cram before the AP Exam only gets recall back to {lastCram.peak}%.
        Each spaced review at the Leitner cadence (days {reviewDays.join(", ")}) restores recall and makes the memory 2.5×
        more stable.
      </figcaption>
    </figure>
  );
}
