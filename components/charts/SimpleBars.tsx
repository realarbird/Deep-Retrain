"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_PROPS, TooltipBox, VIZ } from "./chartTheme";

/** One series of columns with values on the caps, optional dashed reference line. */
export function SimpleBars({
  data,
  valueLabel,
  unit = "",
  reference,
  domain,
  height = 200,
}: {
  data: { label: string; value: number | null; note?: string }[];
  valueLabel: string;
  unit?: string;
  reference?: { y: number; label: string };
  domain?: [number, number];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 12, bottom: 4, left: -18 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={VIZ.grid} />
          <XAxis dataKey="label" interval={0} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} domain={domain} tickFormatter={(v) => `${v}${unit}`} {...AXIS_PROPS} axisLine={false} />
          {reference && (
            <ReferenceLine y={reference.y} stroke={VIZ.threshold} strokeDasharray="4 4" label={{ value: reference.label, position: "insideTopRight", fill: VIZ.textSecondary, fontSize: 11 }} />
          )}
          <Tooltip
            cursor={{ fill: VIZ.grid, fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { label: string; value: number | null; note?: string } | undefined;
              if (!active || !p) return null;
              return <TooltipBox title={p.label} rows={[{ label: valueLabel, value: p.value === null ? "–" : `${p.value}${unit}`, swatch: VIZ.primary }, ...(p.note ? [{ label: p.note, value: "" }] : [])]} />;
            }}
          />
          <Bar dataKey="value" fill={VIZ.primary} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            <LabelList dataKey="value" position="top" fill={VIZ.textPrimary} fontSize={11} formatter={(v: unknown) => (v === null || v === undefined ? "" : `${v}${unit}`)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
