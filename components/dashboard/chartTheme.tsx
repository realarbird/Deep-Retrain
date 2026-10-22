"use client";

import type { ReactNode } from "react";

/** Chart roles, validated (dataviz validator) against the slate-900 card surface. */
export const VIZ = {
  surface: "#0f172a",
  grid: "#1e293b",
  axis: "#64748b",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  primary: "#6366f1",
  primarySoft: "#a5b4fc",
  spaced: "#059669",
  cram: "#d95926",
  threshold: "#94a3b8",
} as const;

export const AXIS_PROPS = {
  stroke: VIZ.axis,
  tick: { fill: VIZ.textSecondary, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: VIZ.grid },
} as const;

export function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; swatch?: string }[] }) {
  return (
    <div className="rounded-lg bg-slate-950/95 px-3 py-2 text-xs shadow-xl ring-1 ring-slate-700">
      <p className="mb-1 font-medium text-slate-100">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-slate-300">
          {r.swatch && <span className="size-2 rounded-full" style={{ background: r.swatch }} aria-hidden />}
          <span className="text-slate-400">{r.label}</span>
          <span className="ml-auto font-mono text-slate-100">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-300">
      <svg width="18" height="8" aria-hidden>
        <line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? "3 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
