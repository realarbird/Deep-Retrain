"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, SectionTitle } from "@/components/ui/primitives";
import type { DashboardData } from "@/lib/client";
import { AXIS_PROPS, TooltipBox, VIZ } from "./chartTheme";

const BOX_NOTES = ["New & reset", "Warming up", "Taking hold", "Durable", "Mastered"];

export function LeitnerBoxes({ boxes }: { boxes: DashboardData["boxes"] }) {
  const data = boxes.map((b) => ({
    ...b,
    label: `Box ${b.box}`,
    interval: b.intervalDays === 1 ? "every day" : `every ${b.intervalDays} days`,
  }));
  const total = boxes.reduce((s, b) => s + b.count, 0);

  return (
    <Card className="p-5">
      <SectionTitle title="Leitner boxes" subtitle={`${total} concepts · each box doubles the time a memory has to hold`} />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -20 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={VIZ.grid} />
            <XAxis dataKey="label" {...AXIS_PROPS} />
            <YAxis allowDecimals={false} {...AXIS_PROPS} axisLine={false} />
            <Tooltip
              cursor={{ fill: "rgb(148 163 184 / 0.08)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipBox
                    title={`${p.label} · ${BOX_NOTES[p.box - 1]}`}
                    rows={[
                      { label: "Concepts", value: p.count, swatch: VIZ.primary },
                      { label: "Review", value: p.interval },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="count" fill={VIZ.primary} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
              <LabelList dataKey="count" position="top" fill={VIZ.textPrimary} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1 text-center text-[11px] leading-tight text-slate-500">
        {data.map((b) => (
          <li key={b.box}>
            <span className="block text-slate-400">{b.intervalDays}d</span>
            {BOX_NOTES[b.box - 1]}
          </li>
        ))}
      </ol>
    </Card>
  );
}
