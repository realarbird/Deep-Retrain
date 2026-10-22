"use client";

import { ArrowUp, Check, Clock, RotateCcw, X } from "lucide-react";
import { Button, Card, cx } from "@/components/ui/primitives";
import { engineName, LATENCY_THRESHOLD_S, TIER_LABEL, type ReviewResponse } from "@/lib/client";
import { SocraticBubble } from "./SocraticBubble";

const OUTCOME_STYLE = {
  promote: { icon: ArrowUp, color: "text-good" },
  hesitation: { icon: Clock, color: "text-warning" },
  reset: { icon: RotateCcw, color: "text-critical" },
} as const;

function headline(r: ReviewResponse["result"]): { title: string; body: string } {
  const secs = (r.latencyMs / 1000).toFixed(1);
  const when = r.intervalDays === 1 ? "tomorrow" : `in ${r.intervalDays} days`;
  if (r.outcome === "promote") {
    return {
      title: r.newBox > r.boxBefore ? `Moved up to box ${r.newBox}` : "Staying in box 5",
      body: `Correct, in ${secs}s. You'll see it ${when}, with a harder ${TIER_LABEL[r.difficultyTier].toLowerCase()} question.`,
    };
  }
  if (r.outcome === "hesitation") {
    return {
      title: `Correct but slow: staying in box ${r.newBox}`,
      body: `${secs}s is over the ${LATENCY_THRESHOLD_S}s mark, so the card stays where it is. Try the follow-up question below.`,
    };
  }
  return {
    title: r.boxBefore === 1 ? "Not quite: staying in box 1" : `Not quite: back to box 1 from box ${r.boxBefore}`,
    body: `The score was under 80%. Here's another way to look at it. You'll get another go ${when}.`,
  };
}

export function ResultPanel({ response, onNext, nextLabel }: { response: ReviewResponse; onNext: () => void; nextLabel: string }) {
  const { result, reveal, retrieval } = response;
  const style = OUTCOME_STYLE[result.outcome];
  const { title, body } = headline(result);
  const Icon = style.icon;
  const latencyS = result.latencyMs / 1000;

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3" role="status">
          <Icon className={cx("mt-0.5 size-5 shrink-0", style.color)} aria-hidden />
          <div>
            <p className="font-semibold text-ink">{title}</p>
            <p className="mt-0.5 text-sm text-ink-2">{body}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Meter label="Score" value={`${result.score}%`} pct={result.score} markerPct={80} markerLabel="80% needed" good={result.isAccurate} />
          <Meter
            label="Time"
            value={`${latencyS.toFixed(1)}s`}
            pct={Math.min(100, (latencyS / (LATENCY_THRESHOLD_S * 2)) * 100)}
            markerPct={50}
            markerLabel={`under ${LATENCY_THRESHOLD_S}s to move up`}
            good={result.isFast}
          />
        </div>

        <p className="mt-6 text-sm leading-relaxed text-ink">{result.feedback}</p>

        {result.outcome === "reset" && result.analogy && (
          <div className="mt-4 border-l-2 border-line-strong pl-4">
            <p className="text-xs text-ink-3">Another way to see it</p>
            <p className="mt-1 text-sm leading-relaxed text-ink">{result.analogy}</p>
          </div>
        )}

        {(result.coveredKeyPoints.length > 0 || result.missingKeyPoints.length > 0) && (
          <ul className="mt-5 grid gap-1.5 text-sm sm:grid-cols-2">
            {result.coveredKeyPoints.map((k) => (
              <li key={`c-${k}`} className="flex items-start gap-2 text-ink">
                <Check className="mt-0.5 size-4 shrink-0 text-good" aria-label="Covered" />
                {k}
              </li>
            ))}
            {result.missingKeyPoints.map((k) => (
              <li key={`m-${k}`} className="flex items-start gap-2 text-ink-2">
                <X className="mt-0.5 size-4 shrink-0 text-critical" aria-label="Missed" />
                {k}
              </li>
            ))}
          </ul>
        )}

        <details className="mt-5 border-t border-line pt-4">
          <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">Show the answer</summary>
          <p className="mt-2 text-sm leading-relaxed text-ink">{reveal.coreFact}</p>
        </details>
      </Card>

      {result.outcome === "hesitation" && result.followUpQuestion && (
        <SocraticBubble reviewLogId={response.reviewLogId} question={result.followUpQuestion} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">
          Graded by {engineName(result.engine)}
          {retrieval.concepts.length > 0 && (
            <span
              title={`Found with ${retrieval.method === "atlas-vector-search" ? "Atlas Vector Search" : "in-app similarity"}, limited to your own ${retrieval.scopedTo === "demo" ? "demo session" : "account"}.`}
            >
              {" "}
              · related cards from your decks: {retrieval.concepts.map((c) => c.conceptTitle).join(", ")}
            </span>
          )}
        </p>
        <Button onClick={onNext}>{nextLabel}</Button>
      </div>
    </div>
  );
}

function Meter({ label, value, pct, markerPct, markerLabel, good }: { label: string; value: string; pct: number; markerPct: number; markerLabel: string; good: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="font-mono tabular-nums text-ink">{value}</span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-line">
        <div className={cx("h-full rounded-full", good ? "bg-good" : "bg-warning")} style={{ width: `${Math.max(2, pct)}%` }} />
        <div className="absolute -top-1 h-3.5 w-px bg-ink-3" style={{ left: `${markerPct}%` }} aria-hidden />
      </div>
      <p className="mt-1 text-xs text-ink-3">{markerLabel}</p>
    </div>
  );
}
