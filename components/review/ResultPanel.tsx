"use client";

import { ArrowRight, Check, Hourglass, Lightbulb, Lock, RotateCcw, Sparkles, TrendingUp, X } from "lucide-react";
import { Button, Card, Chip, cx } from "@/components/ui/primitives";
import { ENGINE_SHORT, LATENCY_THRESHOLD_S, TIER_LABEL, type ReviewResponse } from "@/lib/client";
import { SocraticBubble } from "./SocraticBubble";

const OUTCOME_STYLE = {
  promote: { ring: "ring-emerald-400/30", bg: "bg-emerald-500/10", text: "text-emerald-200", icon: TrendingUp },
  hesitation: { ring: "ring-amber-400/30", bg: "bg-amber-500/10", text: "text-amber-200", icon: Hourglass },
  reset: { ring: "ring-rose-400/30", bg: "bg-rose-500/10", text: "text-rose-200", icon: RotateCcw },
} as const;

function headline(r: ReviewResponse["result"]): { title: string; body: string } {
  const secs = (r.latencyMs / 1000).toFixed(1);
  const days = r.intervalDays === 1 ? "tomorrow" : `in ${r.intervalDays} days`;
  if (r.outcome === "promote") {
    return {
      title: r.newBox > r.boxBefore ? `Promoted to Box ${r.newBox}` : "Box 5 holds: mastered",
      body: `Fast (${secs}s) and accurate. Next review ${days} with a harder ${TIER_LABEL[r.difficultyTier].toLowerCase()} question.`,
    };
  }
  if (r.outcome === "hesitation") {
    return {
      title: `Hesitation detected: staying in Box ${r.newBox}`,
      body: `Accurate, but ${secs}s is past the ${LATENCY_THRESHOLD_S}s fluency line. Strengthen the link before moving on.`,
    };
  }
  return {
    title: r.boxBefore === 1 ? "Staying in Box 1" : `Reset from Box ${r.boxBefore} to Box 1`,
    body: `Below 80% accuracy. Here's a simpler way to see it. You'll get another try ${days}.`,
  };
}

export function ResultPanel({ response, onNext, nextLabel }: { response: ReviewResponse; onNext: () => void; nextLabel: string }) {
  const { result, reveal, retrieval } = response;
  const style = OUTCOME_STYLE[result.outcome];
  const { title, body } = headline(result);
  const Icon = style.icon;
  const latencyS = result.latencyMs / 1000;

  return (
    <div className="space-y-4 animate-rise">
      <div className={cx("flex items-start gap-3 rounded-2xl p-4 ring-1", style.bg, style.ring)} role="status">
        <Icon className={cx("mt-0.5 size-5 shrink-0", style.text)} aria-hidden />
        <div>
          <p className={cx("font-display text-lg font-semibold", style.text)}>{title}</p>
          <p className="mt-0.5 text-sm text-slate-300">{body}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Meter
          label="Accuracy"
          value={`${result.score}%`}
          pct={result.score}
          markerPct={80}
          markerLabel="80%"
          good={result.isAccurate}
        />
        <Meter
          label="Response time"
          value={`${latencyS.toFixed(1)}s`}
          pct={Math.min(100, (latencyS / (LATENCY_THRESHOLD_S * 2)) * 100)}
          markerPct={50}
          markerLabel="12s"
          good={result.isFast}
        />
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-800 ring-1 ring-slate-700" aria-hidden>
            <Sparkles className="size-4 text-slate-300" />
          </span>
          <p className="text-sm leading-relaxed text-slate-200">{result.feedback}</p>
        </div>

        {result.outcome === "hesitation" && result.followUpQuestion && (
          <SocraticBubble reviewLogId={response.reviewLogId} question={result.followUpQuestion} />
        )}

        {result.outcome === "reset" && result.analogy && (
          <div className="flex items-start gap-3 rounded-xl bg-amber-500/5 p-4 ring-1 ring-amber-400/20">
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-amber-300">Analogy to fix the misconception</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-50">{result.analogy}</p>
            </div>
          </div>
        )}

        {(result.coveredKeyPoints.length > 0 || result.missingKeyPoints.length > 0) && (
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {result.coveredKeyPoints.map((k) => (
              <li key={`c-${k}`} className="flex items-start gap-2 text-slate-300">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-label="Covered" />
                {k}
              </li>
            ))}
            {result.missingKeyPoints.map((k) => (
              <li key={`m-${k}`} className="flex items-start gap-2 text-slate-400">
                <X className="mt-0.5 size-4 shrink-0 text-rose-400" aria-label="Missed" />
                {k}
              </li>
            ))}
          </ul>
        )}

        <details className="group rounded-xl bg-slate-950/60 px-4 py-3 ring-1 ring-slate-800">
          <summary className="cursor-pointer text-sm font-medium text-slate-300 marker:text-slate-500">Show the core fact</summary>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{reveal.coreFact}</p>
        </details>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={result.engine === "heuristic" ? "amber" : "indigo"} icon={<Sparkles className="size-3" aria-hidden />}>
            {ENGINE_SHORT[result.engine]}
          </Chip>
          {retrieval.concepts.length > 0 && (
            <Chip
              tone="sky"
              icon={<Lock className="size-3" aria-hidden />}
              title={`Retrieved with ${retrieval.method === "atlas-vector-search" ? "Atlas Vector Search" : "in-app cosine similarity"}, filtered to your own ${retrieval.scopedTo === "demo" ? "demo session" : "Auth0 account"}.`}
            >
              Context from your deck only: {retrieval.concepts.map((c) => c.conceptTitle).join(", ")}
            </Chip>
          )}
        </div>
        <Button onClick={onNext} icon={<ArrowRight className="size-4" aria-hidden />}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

function Meter({ label, value, pct, markerPct, markerLabel, good }: { label: string; value: string; pct: number; markerPct: number; markerLabel: string; good: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <span className={cx("font-mono text-lg font-semibold", good ? "text-emerald-300" : "text-amber-300")}>{value}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-slate-800">
        <div className={cx("h-full rounded-full", good ? "bg-emerald-500" : "bg-amber-400")} style={{ width: `${Math.max(2, pct)}%` }} />
        <div className="absolute -top-1 h-4 w-px bg-slate-400" style={{ left: `${markerPct}%` }} aria-hidden />
      </div>
      <p className="mt-1.5 text-right text-[11px] text-slate-500">threshold {markerLabel}</p>
    </Card>
  );
}
