"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Card, SectionTitle } from "@/components/ui/primitives";
import { LATENCY_THRESHOLD_S, type DashboardData } from "@/lib/client";
import { AXIS_PROPS, LegendItem, TooltipBox, VIZ } from "@/components/charts/chartTheme";

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function LatencyTrendChart({ trend, simulated }: { trend: DashboardData["latencyTrend"]; simulated: boolean }) {
  const hasData = trend.some((p) => p.avgSeconds !== null);
  const maxY = Math.max(LATENCY_THRESHOLD_S + 4, ...trend.map((p) => p.avgSeconds ?? 0));

  return (
    <Card className="p-5">
      <SectionTitle
        title="Answer time"
        subtitle={`Average seconds per answer, by day.${simulated ? " Includes the sample deck's made-up history." : ""}`}
      />
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-2 text-xs text-ink-2">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="4" fill={VIZ.primarySoft} />
          </svg>
          Daily average
        </span>
        <LegendItem color={VIZ.primary} label="7-day average" />
        <LegendItem color={VIZ.threshold} label={`${LATENCY_THRESHOLD_S}s mark`} dashed />
      </div>
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
                cursor={{ stroke: VIZ.axis }}
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
        <p className="flex h-40 items-center justify-center rounded-md border border-dashed border-line text-sm text-ink-3">
          This fills in after your first reviews.
        </p>
      )}
    </Card>
  );
}
