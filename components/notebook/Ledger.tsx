import type { ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

export interface LedgerRow {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
}

/** Label, dotted leader, value: the way you'd tally things at the back of a notebook. */
export function Ledger({ rows, className }: { rows: LedgerRow[]; className?: string }) {
  return (
    <dl className={cx("space-y-2.5 text-sm", className)}>
      {rows.map((row, i) => (
        <div key={i}>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-2">{row.label}</dt>
            <span className="leader" aria-hidden />
            <dd className="font-medium text-ink">{row.value}</dd>
          </div>
          {row.note && <p className="mt-0.5 text-xs text-ink-3">{row.note}</p>}
        </div>
      ))}
    </dl>
  );
}
