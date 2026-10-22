"use client";

import type { ReactNode } from "react";
import { LATENCY_THRESHOLD_S, type DashboardData } from "@/lib/client";

function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="bg-surface p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-ink-2">{detail}</p>}
    </div>
  );
}

export function StatTiles({ data }: { data: DashboardData }) {
  const { totals, cap } = data;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
      <Stat label="Due now" value={totals.dueNow} detail={`of ${totals.cards} concepts`} />
      <Stat
        label="Reviewed today"
        value={
          <>
            {cap.used}
            <span className="text-base font-normal text-ink-3"> / {cap.limit}</span>
          </>
        }
        detail={cap.reached ? "Done for today" : `${cap.remaining} left`}
      />
      <Stat
        label="In box 5"
        value={totals.mastered}
        detail={totals.avgScore7d !== null ? `${totals.avgScore7d}% average score, last 7 days` : "Reviewed every 30 days"}
      />
      <Stat
        label="Average answer time"
        value={totals.avgLatency7d !== null ? `${totals.avgLatency7d}s` : "–"}
        detail={
          totals.avgLatency7d !== null
            ? `${totals.avgLatency7d < LATENCY_THRESHOLD_S ? "Under" : "Over"} the ${LATENCY_THRESHOLD_S}s mark · ${totals.streakDays}-day streak`
            : `${totals.streakDays}-day streak`
        }
      />
    </div>
  );
}
