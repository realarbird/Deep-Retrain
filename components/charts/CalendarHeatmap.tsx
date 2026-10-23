"use client";

import { useEffect, useRef, useState } from "react";
import { VIZ } from "./chartTheme";

export interface CalendarCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

const CELL = 15;
const GAP = 4;
const LEFT = 30;
const TOP = 18;

function label(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function describe(d: CalendarCell): string {
  return `${label(d.date)}: ${d.count} ${d.count === 1 ? "answer" : "answers"}`;
}

/**
 * Six months of study days, a column per week, shaded by how much of the daily
 * limit you used. Drawn at its own size; on a narrow screen it scrolls, starting
 * at this week.
 */
export function CalendarHeatmap({ days }: { days: CalendarCell[] }) {
  const [hover, setHover] = useState<CalendarCell | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const weeks = Math.ceil(days.length / 7);
  const width = LEFT + weeks * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);
  const months: { x: number; text: string }[] = [];
  days.forEach((d, i) => {
    if (d.date.endsWith("-01") || i === 0) {
      const col = Math.floor(i / 7);
      if (!months.length || col - Math.floor((months.at(-1)!.x - LEFT) / (CELL + GAP)) > 2) {
        months.push({ x: LEFT + col * (CELL + GAP), text: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) });
      }
    }
  });
  const studied = days.filter((d) => d.count > 0);
  const best = studied.reduce<CalendarCell | null>((top, d) => (!top || d.count > top.count ? d : top), null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days.length]);

  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
      <div className="min-w-0 max-w-full">
        <div ref={scroller} className="overflow-x-auto">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-none" role="img" aria-label="Calendar of study days. The table view lists each day.">
            {months.map((m) => (
              <text key={m.x} x={m.x} y={11} fontSize={11} fill={VIZ.textSecondary}>
                {m.text}
              </text>
            ))}
            {["Mon", "Wed", "Fri"].map((d, i) => (
              <text key={d} x={0} y={TOP + (1 + i * 2) * (CELL + GAP) + CELL - 3} fontSize={11} fill={VIZ.textSecondary}>
                {d}
              </text>
            ))}
            {days.map((d, i) => (
              <rect
                key={d.date}
                x={LEFT + Math.floor(i / 7) * (CELL + GAP)}
                y={TOP + (i % 7) * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2.5}
                fill={d.level === 0 ? VIZ.empty : VIZ.seq[d.level - 1]}
                stroke={hover?.date === d.date ? VIZ.textPrimary : "none"}
                strokeWidth={1.5}
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{describe(d)}</title>
              </rect>
            ))}
          </svg>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-ink-3">
          <span className="min-h-4 text-ink-2">{hover ? describe(hover) : "Point at a day for its count."}</span>
          <span className="flex items-center gap-1">
            None
            {[VIZ.empty, ...VIZ.seq].map((c, i) => (
              <span key={i} className="inline-block size-2.5 rounded-[2px]" style={{ background: c }} aria-hidden />
            ))}
            Hit the limit
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 pb-7 text-sm sm:grid-cols-1">
        <div>
          <dt className="text-xs text-ink-3">Days you studied</dt>
          <dd className="text-ink">
            <span className="text-lg font-medium tabular-nums">{studied.length}</span> of {days.length}
          </dd>
        </div>
        {best && (
          <div>
            <dt className="text-xs text-ink-3">Busiest day</dt>
            <dd className="text-ink">
              {label(best.date)}, <span className="tabular-nums">{best.count}</span> {best.count === 1 ? "answer" : "answers"}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
