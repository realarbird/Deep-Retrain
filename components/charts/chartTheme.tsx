"use client";

import type { ReactNode } from "react";

/**
 * Chart roles, read from the theme tokens in globals.css so light and dark
 * each get their own validated steps. Series colors pass the colorblind-safety
 * checks against both chart surfaces.
 */
export const VIZ = {
  surface: "var(--color-surface)",
  grid: "var(--color-line)",
  axis: "var(--color-line-strong)",
  textPrimary: "var(--color-ink)",
  textSecondary: "var(--color-ink-3)",
  primary: "var(--color-accent)",
  primarySoft: "var(--color-accent-soft)",
  spaced: "var(--color-accent)",
  cram: "var(--color-cram)",
  threshold: "var(--color-ink-3)",
} as const;

export const AXIS_PROPS = {
  stroke: VIZ.axis,
  tick: { fill: VIZ.textSecondary, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: VIZ.axis },
} as const;

export function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; swatch?: string }[] }) {
  return (
    <div className="min-w-40 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.swatch && <span className="size-2 rounded-full" style={{ background: r.swatch }} aria-hidden />}
          <span className="text-ink-2">{r.label}</span>
          <span className="ml-auto pl-3 font-mono tabular-nums text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-2">
      <svg width="18" height="8" aria-hidden>
        <line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? "3 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
