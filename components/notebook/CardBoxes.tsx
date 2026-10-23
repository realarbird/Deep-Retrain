"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/primitives";

const BOX_NAMES = ["New or reset", "Warming up", "Taking hold", "Durable", "Long-term"];
const HEIGHT = 142;

function every(days: number): string {
  return days === 1 ? "every day" : `every ${days} days`;
}

/**
 * The five Leitner boxes drawn as actual card boxes, with a stack of cards in
 * each. Stack heights share one scale; exact counts sit on top of each stack.
 * A table view gives the same numbers without the drawing.
 */
export function CardBoxes({ boxes }: { boxes: { box: number; intervalDays: number; count: number }[] }) {
  const [view, setView] = useState<"drawing" | "table">("drawing");
  const max = Math.max(1, ...boxes.map((b) => b.count));
  const total = boxes.reduce((s, b) => s + b.count, 0);
  const summary = boxes.map((b) => `box ${b.box}: ${b.count}`).join(", ");

  return (
    <figure>
      <div className="mb-3 flex items-center justify-between gap-3">
        <figcaption className="text-sm text-ink-2">
          {total} {total === 1 ? "card" : "cards"}. Each box waits longer before a card comes back.
        </figcaption>
        <Segmented
          label="Show as"
          value={view}
          onChange={setView}
          className="text-xs [&_button]:px-2 [&_button]:py-0.5 [&_button]:text-xs"
          options={[
            { value: "drawing", label: "Boxes" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {view === "drawing" ? (
        // The drawing scales with the screen; the numbers and labels are text on top of it, so they stay readable on a phone.
        <div role="img" aria-label={`Cards per Leitner box: ${summary}.`}>
          <div className="relative" aria-hidden>
            <svg viewBox={`0 0 500 ${HEIGHT}`} className="block w-full">
              {boxes.map((b, i) => {
                const x = 12 + i * 98;
                const stack = Math.round((b.count / max) * 74);
                const sheets = Math.min(b.count, 12);
                return (
                  <g key={b.box}>
                    {/* the stack of cards, peeking out of the box */}
                    {Array.from({ length: sheets }, (_, s) => {
                      const h = sheets ? (stack / sheets) * (s + 1) : 0;
                      return (
                        <rect
                          key={s}
                          x={x + 8 + (s % 2)}
                          y={104 - h}
                          width={62}
                          height={h + 6}
                          rx={2}
                          fill="var(--color-paper)"
                          stroke="var(--color-line-strong)"
                          strokeWidth={0.8}
                        />
                      );
                    })}
                    {b.count > 0 && <rect x={x + 8} y={104 - stack} width={62} height={3} fill="var(--color-accent)" opacity={0.85} />}
                    {/* the box front */}
                    <path
                      d={`M${x} 100 L${x + 78} 100 L${x + 76} 140 L${x + 2} 140 Z`}
                      fill="var(--color-sunken)"
                      stroke="var(--color-ink-3)"
                      strokeWidth={1.2}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}
            </svg>
            {boxes.map((b, i) => (
              <span
                key={b.box}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-sm font-semibold tabular-nums text-ink"
                style={{ left: `${((51 + i * 98) / 500) * 100}%`, top: `${(120 / HEIGHT) * 100}%` }}
              >
                {b.count}
              </span>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-5 text-center text-xs leading-tight text-ink-2" aria-hidden>
            {boxes.map((b) => (
              <span key={b.box}>
                Box {b.box}
                <span className="block text-ink-3 sm:inline sm:text-ink-2">
                  <span className="hidden sm:inline"> · </span>
                  {b.intervalDays}d
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th scope="col" className="py-1.5 font-normal">Box</th>
              <th scope="col" className="py-1.5 font-normal">Comes back</th>
              <th scope="col" className="py-1.5 text-right font-normal">Cards</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {boxes.map((b) => (
              <tr key={b.box} className="border-b border-line last:border-0">
                <th scope="row" className="py-1.5 text-left font-normal text-ink">
                  {b.box} <span className="text-ink-3">· {BOX_NAMES[b.box - 1]}</span>
                </th>
                <td className="py-1.5 text-ink-2">{every(b.intervalDays)}</td>
                <td className="py-1.5 text-right text-ink">{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
