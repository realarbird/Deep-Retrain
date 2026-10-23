"use client";

import { VIZ } from "./chartTheme";

const PARTS = [
  { key: "new", label: "New", color: VIZ.empty },
  { key: "learning", label: "Learning", color: VIZ.seq[0] },
  { key: "young", label: "Taking hold", color: VIZ.seq[2] },
  { key: "mature", label: "Long-term", color: VIZ.seq[3] },
] as const;

/** Every card in one bar: new, learning (box 1–2), taking hold (3–4), long-term (5). */
export function MaturityBar({ maturity }: { maturity: { new: number; learning: number; young: number; mature: number; suspended: number } }) {
  const total = PARTS.reduce((s, p) => s + maturity[p.key], 0) || 1;
  return (
    <div>
      <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={PARTS.map((p) => `${p.label}: ${maturity[p.key]}`).join(", ")}>
        {PARTS.map((p) =>
          maturity[p.key] ? <div key={p.key} style={{ width: `${(maturity[p.key] / total) * 100}%`, background: p.color }} title={`${p.label}: ${maturity[p.key]}`} /> : null,
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-2 sm:grid-cols-4">
        {PARTS.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] border border-line" style={{ background: p.color }} aria-hidden />
            {p.label} <span className="tabular-nums text-ink">{maturity[p.key]}</span>
          </li>
        ))}
      </ul>
      {maturity.suspended > 0 && <p className="mt-2 text-xs text-ink-3">{maturity.suspended} suspended, not counted.</p>}
    </div>
  );
}
