"use client";

import type { ReactNode } from "react";
import { Flame, GaugeCircle, Layers, Trophy } from "lucide-react";
import { Card, ProgressBar } from "@/components/ui/primitives";
import { LATENCY_THRESHOLD_S, type DashboardData } from "@/lib/client";

function Tile({ icon, label, value, detail, children }: { icon: ReactNode; label: string; value: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold text-white">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
      {children}
    </Card>
  );
}

export function StatTiles({ data }: { data: DashboardData }) {
  const { totals, cap } = data;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile icon={<Layers className="size-3.5" aria-hidden />} label="Due now" value={totals.dueNow} detail={`of ${totals.cards} concepts`} />
      <Tile
        icon={<GaugeCircle className="size-3.5" aria-hidden />}
        label="Today"
        value={
          <>
            {cap.used}
            <span className="text-lg text-slate-500">/{cap.limit}</span>
          </>
        }
        detail={cap.reached ? "Cap reached: consolidating" : `${cap.remaining} micro-reviews left`}
      >
        <div className="mt-3">
          <ProgressBar value={cap.used} max={cap.limit} tone={cap.reached ? "amber" : "indigo"} label="Daily cognitive cap" />
        </div>
      </Tile>
      <Tile
        icon={<Trophy className="size-3.5" aria-hidden />}
        label="Mastered"
        value={totals.mastered}
        detail={totals.avgScore7d !== null ? `Avg accuracy ${totals.avgScore7d}% (7d)` : "Box 5 · 30-day interval"}
      />
      <Tile
        icon={<Flame className="size-3.5" aria-hidden />}
        label="Recall speed"
        value={totals.avgLatency7d !== null ? `${totals.avgLatency7d}s` : "—"}
        detail={
          totals.avgLatency7d !== null
            ? `${totals.avgLatency7d < LATENCY_THRESHOLD_S ? "Under" : "Over"} the 12s line · ${totals.streakDays}-day streak`
            : `${totals.streakDays}-day streak`
        }
      />
    </div>
  );
}
