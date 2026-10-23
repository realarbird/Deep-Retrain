"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_PROPS, TooltipBox, VIZ } from "./chartTheme";

export interface OutcomeWeek {
  week: string;
  promote: number;
  hesitation: number;
  reset: number;
}

function weekLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Week by week: answers that moved a card up, kept it, or sent it back to box 1. */
export function OutcomeMixChart({ weeks }: { weeks: OutcomeWeek[] }) {
  const data = weeks.map((w) => ({ ...w, label: weekLabel(w.week) }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={VIZ.grid} />
          <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={18} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} axisLine={false} />
          <Tooltip
            cursor={{ fill: VIZ.grid, fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <TooltipBox
                  title={`Week of ${p.label}`}
                  rows={[
                    { label: "moved up", value: p.promote, swatch: VIZ.good },
                    { label: "slow, stayed", value: p.hesitation, swatch: VIZ.warning },
                    { label: "back to box 1", value: p.reset, swatch: VIZ.critical },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="reset" stackId="o" fill={VIZ.critical} stroke={VIZ.surface} strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="hesitation" stackId="o" fill={VIZ.warning} stroke={VIZ.surface} strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="promote" stackId="o" fill={VIZ.good} stroke={VIZ.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
