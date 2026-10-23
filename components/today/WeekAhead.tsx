import { cx } from "@/components/ui/primitives";
import { formatDate, type ForecastDay } from "@/lib/client";

/**
 * The next seven days as a strip of small columns: blue for what fits under
 * your daily limit, orange for what spills over to the next day.
 */
export function WeekAhead({ forecast, cap }: { forecast: ForecastDay[]; cap: number }) {
  const max = Math.max(cap, ...forecast.map((d) => d.scheduled + d.overflow), 1);
  const spill = forecast.reduce((s, d) => s + d.overflow, 0) > 0;
  return (
    <figure>
      <div className="flex h-24 items-end gap-1.5" role="img" aria-label={forecast.map((d) => `${formatDate(d.date, { weekday: "short" })}: ${d.scheduled + d.overflow} due`).join(", ")}>
        {forecast.map((d, i) => {
          const total = d.scheduled + d.overflow;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px] tabular-nums text-ink-2">{total || ""}</span>
              <div className="flex w-full max-w-6 flex-col justify-end gap-[2px]" style={{ height: 56 }}>
                {d.overflow > 0 && <div className="w-full rounded-t-[3px] bg-cram" style={{ height: (d.overflow / max) * 56 }} />}
                {d.scheduled > 0 && (
                  <div className={cx("w-full bg-accent", d.overflow ? "" : "rounded-t-[3px]")} style={{ height: Math.max(2, (d.scheduled / max) * 56) }} />
                )}
                {total === 0 && <div className="h-[2px] w-full rounded bg-line-strong" />}
              </div>
              <span className={cx("text-[11px]", i === 0 ? "font-medium text-ink" : "text-ink-3")}>
                {i === 0 ? "Today" : formatDate(d.date, { weekday: "short" })}
              </span>
            </div>
          );
        })}
      </div>
      {spill && (
        <figcaption className="mt-2 text-xs text-ink-2">
          <span className="mr-1 inline-block size-2 rounded-[2px] bg-cram align-middle" aria-hidden />
          More than your daily limit is due, so some cards will wait a day. That&apos;s fine.
        </figcaption>
      )}
    </figure>
  );
}
