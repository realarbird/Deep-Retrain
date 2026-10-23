"use client";

import { VIZ } from "./chartTheme";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = ["12a", "6a", "12p", "6p"];

/** When you study: weekday by hour, darker where you answer more. */
export function PunchCard({ cells }: { cells: { weekday: number; hour: number; count: number }[] }) {
  const max = Math.max(1, ...cells.map((c) => c.count));
  const level = (n: number) => (n === 0 ? -1 : Math.min(3, Math.floor((n / max) * 4 - 0.0001)));
  const W = 30 + 24 * 15;
  const H = 14 + 7 * 15;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Reviews by weekday and hour. The table view lists the busiest hours.">
      {HOURS.map((h, i) => (
        <text key={h} x={30 + i * 6 * 15} y={9} fontSize={9} fill={VIZ.textSecondary}>
          {h}
        </text>
      ))}
      {DAYS.map((d, i) => (
        <text key={d} x={0} y={14 + i * 15 + 10} fontSize={9} fill={VIZ.textSecondary}>
          {d}
        </text>
      ))}
      {cells.map((c) => {
        const l = level(c.count);
        return (
          <rect
            key={`${c.weekday}-${c.hour}`}
            x={30 + c.hour * 15}
            y={14 + c.weekday * 15}
            width={12}
            height={12}
            rx={2}
            fill={l < 0 ? VIZ.empty : VIZ.seq[l]}
          >
            <title>{`${DAYS[c.weekday]} ${String(c.hour).padStart(2, "0")}:00 · ${c.count} ${c.count === 1 ? "review" : "reviews"}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
