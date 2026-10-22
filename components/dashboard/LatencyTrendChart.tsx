"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Chip, Card, SectionTitle } from "@/components/ui/primitives";
import { LATENCY_THRESHOLD_S, type DashboardData } from "@/lib/client";
import { AXIS_PROPS, LegendItem, TooltipBox, VIZ } from "./chartTheme";

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function LatencyTrendChart({ trend, simulated }: { trend: DashboardData["latencyTrend"]; simulated: boolean }) {
  const hasData = trend.some((p) => p.avgSeconds !== null);
  const maxY = Math.max(LATENCY_THRESHOLD_S + 4, ...trend.map((p) => p.avgSeconds ?? 0)) ;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Recall speed"
        subtitle="Average response latency per day. Lower means more fluent recall."
        action={
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2 text-xs text-slate-300">
              <svg width="10" height="10" aria-hidden>
                <circle cx="5" cy="5" r="4" fill={VIZ.primarySoft} />
              </svg>
              Daily average
            </span>
            <LegendItem color={VIZ.primary} label="7-day average" />
            <LegendItem color={VIZ.threshold} label="12s hesitation line" dashed />
          </div>
        }
      />
      {simulated && (
        <Chip tone="amber" className="mb-3">
          Includes simulated sample history
        </Chip>
      )}
      {hasData ? (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
              <CartesianGrid vertical={false} stroke={VIZ.grid} />
              <XAxis dataKey="date" tickFormatter={shortDate} interval="preserveStartEnd" minTickGap={28} {...AXIS_PROPS} />
              <YAxis domain={[0, Math.ceil(maxY / 4) * 4]} tickFormatter={(v) => `${v}s`} {...AXIS_PROPS} axisLine={false} />
              <ReferenceLine
                y={LATENCY_THRESHOLD_S}
                stroke={VIZ.threshold}
                strokeDasharray="4 4"
                label={{ value: "12s", position: "insideTopRight", fill: VIZ.textSecondary, fontSize: 11 }}
              />
              <Tooltip
                cursor={{ stroke: VIZ.axis, strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as DashboardData["latencyTrend"][number] | undefined;
                  if (!active || !p) return null;
                  return (
                    <TooltipBox
                      title={shortDate(p.date)}
                      rows={[
                        { label: "Daily average", value: p.avgSeconds !== null ? `${p.avgSeconds}s` : "—", swatch: VIZ.primarySoft },
                        { label: "7-day average", value: p.movingAvgSeconds !== null ? `${p.movingAvgSeconds}s` : "—", swatch: VIZ.primary },
                        { label: "Reviews", value: p.reviews },
                      ]}
                    />
                  );
                }}
              />
              <Scatter dataKey="avgSeconds" fill={VIZ.primarySoft} shape="circle" isAnimationActive={false} />
              <Line type="monotone" dataKey="movingAvgSeconds" stroke={VIZ.primary} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-800 text-sm text-slate-500">
          Your latency trend appears after your first reviews.
        </p>
      )}
    </Card>
  );
}
