"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_PROPS, TooltipBox, VIZ } from "./chartTheme";

export interface TrendPoint {
  date: string;
  avg: number | null;
  movingAvg: number | null;
  count: number;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Daily averages as dots, a 7-day average as the line, and a dashed mark for the threshold that matters. */
export function TrendChart({
  points,
  unit,
  threshold,
  thresholdLabel,
  domain,
}: {
  points: TrendPoint[];
  unit: "%" | "s";
  threshold: number;
  thresholdLabel: string;
  domain: [number, number];
}) {
  const fmt = (v: number | null) => (v === null ? "–" : unit === "%" ? `${Math.round(v)}%` : `${v.toFixed(1)}s`);
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid vertical={false} stroke={VIZ.grid} />
          <XAxis dataKey="date" tickFormatter={shortDate} interval="preserveStartEnd" minTickGap={32} {...AXIS_PROPS} />
          <YAxis domain={domain} tickFormatter={(v) => (unit === "%" ? `${v}%` : `${v}s`)} {...AXIS_PROPS} axisLine={false} />
          <ReferenceLine
            y={threshold}
            stroke={VIZ.threshold}
            strokeDasharray="4 4"
            label={{ value: thresholdLabel, position: "insideTopRight", fill: VIZ.textSecondary, fontSize: 11 }}
          />
          <Tooltip
            cursor={{ stroke: VIZ.axis }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as TrendPoint | undefined;
              if (!active || !p) return null;
              return (
                <TooltipBox
                  title={shortDate(p.date)}
                  rows={[
                    { label: "that day", value: fmt(p.avg), swatch: VIZ.primarySoft },
                    { label: "7-day average", value: fmt(p.movingAvg), swatch: VIZ.primary },
                    { label: "answers", value: p.count },
                  ]}
                />
              );
            }}
          />
          <Scatter dataKey="avg" fill={VIZ.primarySoft} shape="circle" isAnimationActive={false} />
          <Line type="monotone" dataKey="movingAvg" stroke={VIZ.primary} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
