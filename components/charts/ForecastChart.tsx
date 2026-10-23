"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastDay } from "@/lib/client";
import { AXIS_PROPS, TooltipBox, VIZ } from "./chartTheme";

function dayLabel(iso: string, i: number): string {
  if (i === 0) return "Today";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" });
}

/** The next two weeks: blue fits under your daily limit, orange spills to the next day. */
export function ForecastChart({ days, cap }: { days: ForecastDay[]; cap: number }) {
  const data = days.map((d, i) => ({ ...d, label: dayLabel(d.date, i) }));
  const top = Math.max(cap + 2, ...days.map((d) => d.scheduled + d.overflow));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={VIZ.grid} />
          <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={18} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} domain={[0, top]} {...AXIS_PROPS} axisLine={false} />
          <ReferenceLine y={cap} stroke={VIZ.threshold} strokeDasharray="4 4" label={{ value: `limit ${cap}`, position: "insideTopRight", fill: VIZ.textSecondary, fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: VIZ.grid, fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: "fit under the limit", value: p.scheduled, swatch: VIZ.primary },
                    { label: "roll to the next day", value: p.overflow, swatch: VIZ.overflow },
                    { label: "newly due", value: p.due },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="scheduled" stackId="a" fill={VIZ.primary} stroke={VIZ.surface} strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="overflow" stackId="a" fill={VIZ.overflow} stroke={VIZ.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
