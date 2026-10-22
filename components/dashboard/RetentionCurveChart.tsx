"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, SectionTitle } from "@/components/ui/primitives";
import type { DashboardData } from "@/lib/client";
import { AXIS_PROPS, LegendItem, TooltipBox, VIZ } from "./chartTheme";

export function RetentionCurveChart({ retention }: { retention: DashboardData["retention"] }) {
  const last = retention.points.at(-1);

  return (
    <Card className="p-5">
      <SectionTitle
        title="Cramming vs DeepRetain"
        subtitle="Modeled recall over 30 days after learning a concept"
        action={
          <div className="flex flex-wrap gap-4">
            <LegendItem color={VIZ.cram} label="Cram once" />
            <LegendItem color={VIZ.spaced} label="Spaced (DeepRetain)" />
            <LegendItem color={VIZ.spaced} label="Spaced review" dashed />
          </div>
        }
      />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={retention.points} margin={{ top: 12, right: 92, bottom: 4, left: -16 }}>
            <CartesianGrid vertical={false} stroke={VIZ.grid} />
            <XAxis dataKey="day" type="number" domain={[0, 30]} ticks={[0, 5, 10, 15, 20, 25, 30]} tickFormatter={(d) => `d${d}`} {...AXIS_PROPS} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} {...AXIS_PROPS} axisLine={false} />
            {retention.reviewDays.map((d) => (
              <ReferenceLine
                key={d}
                x={d}
                stroke={VIZ.spaced}
                strokeOpacity={0.35}
                strokeDasharray="3 4"
              />
            ))}
            <Tooltip
              cursor={{ stroke: VIZ.axis, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as DashboardData["retention"]["points"][number] | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipBox
                    title={`Day ${p.day}${retention.reviewDays.includes(p.day) ? " · spaced review" : ""}`}
                    rows={[
                      { label: "Cram once", value: `${p.cramming}%`, swatch: VIZ.cram },
                      { label: "DeepRetain", value: `${p.spaced}%`, swatch: VIZ.spaced },
                    ]}
                  />
                );
              }}
            />
            <Line type="monotone" dataKey="cramming" stroke={VIZ.cram} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }} isAnimationActive={false} />
            <Line type="linear" dataKey="spaced" stroke={VIZ.spaced} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }} isAnimationActive={false} />
            {last && (
              <>
                <ReferenceLine y={last.spaced} stroke="none" label={{ value: `DeepRetain ${Math.round(last.spaced)}%`, position: "right", fill: VIZ.textPrimary, fontSize: 11 }} />
                <ReferenceLine y={Math.max(last.cramming, 4)} stroke="none" label={{ value: `Cram ${Math.round(last.cramming)}%`, position: "right", fill: VIZ.textPrimary, fontSize: 11 }} />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Ebbinghaus decay R = e<sup>−t/S</sup>. Cramming leaves one memory with ~2 days of stability. Each spaced review at
        the Leitner cadence (days 1, 4, 11, 25) restores recall and multiplies stability ×2.5.
      </p>
    </Card>
  );
}
