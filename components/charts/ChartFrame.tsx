"use client";

import { useState, type ReactNode } from "react";
import { Card, Segmented, cx } from "@/components/ui/primitives";

/**
 * A titled chart on card stock with a Chart / Table switch, so every value is
 * readable without hovering or telling colors apart.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  chart,
  table,
  className,
  empty,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table?: ReactNode;
  className?: string;
  /** Shown instead of the chart when there's nothing to plot yet. */
  empty?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card className={cx("p-5", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[17px] font-medium leading-snug text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {table && !empty && (
          <Segmented
            label="Show as"
            value={view}
            onChange={setView}
            className="shrink-0 [&_button]:px-2 [&_button]:py-0.5 [&_button]:text-xs"
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        )}
      </div>
      {empty ? (
        <p className="flex h-32 items-center justify-center rounded-[4px] border border-dashed border-line px-4 text-center text-sm text-ink-3">{empty}</p>
      ) : view === "chart" ? (
        <>
          {legend && <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">{legend}</div>}
          {chart}
        </>
      ) : (
        <div className="max-h-80 overflow-auto">{table}</div>
      )}
    </Card>
  );
}

/** A plain table for a chart's table view. */
export function DataTable({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-surface">
        <tr className="border-b border-line text-left text-xs text-ink-3">
          {head.map((h, i) => (
            <th key={i} scope="col" className={cx("py-1.5 font-normal", i > 0 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            {r.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row" className="py-1.5 text-left font-normal text-ink-2">
                  {cell}
                </th>
              ) : (
                <td key={j} className="py-1.5 text-right text-ink">
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
