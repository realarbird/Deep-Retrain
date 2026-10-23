"use client";

import { useEffect, useState } from "react";
import { CircledScore, PenCross, PenTick } from "@/components/notebook/Doodles";
import { RedPen } from "@/components/notebook/RedPen";
import { SocraticBubble } from "@/components/review/SocraticBubble";
import { Button, Card, cx, ErrorNote, Kbd } from "@/components/ui/primitives";
import { api, engineName, formatDate, MODE_INFO, modeTopBox, type ReviewResponse } from "@/lib/client";

const RATING_WORDS = { again: "forgot", hard: "hard", good: "got it", easy: "easy" } as const;

function when(days: number): string {
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

function headline(r: ReviewResponse["result"]): { title: string; body: string } {
  const label = MODE_INFO[r.mode]?.label ?? "This mode";
  const secs = (r.latencyMs / 1000).toFixed(1);
  if (r.outcome === "promote") {
    if (r.boxCapped) {
      return {
        title: `Right. Staying in box ${r.newBox}.`,
        body: `${label} can carry a card up to box ${modeTopBox(r.mode)}. Answer it in Write or Say it to move it further. Back ${when(r.intervalDays)}.`,
      };
    }
    if (r.newBox > r.boxBefore) return { title: `Up to box ${r.newBox}.`, body: `Back ${when(r.intervalDays)}${r.newBox > 1 ? ", with a harder question" : ""}.` };
    return { title: "Still in box 5.", body: `You know this one. Back ${when(r.intervalDays)}.` };
  }
  if (r.outcome === "hesitation") {
    if (r.selfRating === "hard") return { title: `Marked hard. Staying in box ${r.newBox}.`, body: `Back ${when(r.intervalDays)}.` };
    const limit = r.latencyThresholdMs ? Math.round(r.latencyThresholdMs / 1000) : null;
    return {
      title: `Right, but slow. Staying in box ${r.newBox}.`,
      body: limit ? `${secs}s is over the ${limit}s mark for ${label.toLowerCase()}. Quick recall is what moves a card up. Back ${when(r.intervalDays)}.` : `Back ${when(r.intervalDays)}.`,
    };
  }
  return {
    title: r.boxBefore === 1 ? "Not yet. Staying in box 1." : `Back to box 1 from box ${r.boxBefore}.`,
    body: "You'll see it again tomorrow. Missing it now is what makes it stick later.",
  };
}

/**
 * The marked card: a pen tick or cross, the score circled, what moved, and
 * whatever helps next time (the answer, the missed points, an analogy, a
 * follow-up question). Enter goes to the next card.
 */
export function GradedCard({ response, onNext, nextLabel }: { response: ReviewResponse; onNext: () => void; nextLabel: string }) {
  const { result, reveal, retrieval } = response;
  const { title, body } = headline(result);
  const pass = result.outcome !== "reset";
  const modelGraded = result.mode === "write" || result.mode === "voice" || result.mode === "teach";
  const keyGraded = result.mode === "choice" || result.mode === "truefalse" || result.mode === "cloze";
  const [analogy, setAnalogy] = useState<string | null>(result.analogy);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Enter on a focused button or link does that control's job, not "next card".
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || target?.closest("textarea, input, select, button, a, summary")) return;
      e.preventDefault();
      onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext]);

  async function explain() {
    setExplaining(true);
    setExplainError(null);
    try {
      const r = await api<{ analogy: string }>("/api/review", { method: "POST", json: { mode: "explain", reviewLogId: response.reviewLogId } });
      setAnalogy(r.analogy);
    } catch (err) {
      setExplainError((err as Error).message);
    } finally {
      setExplaining(false);
    }
  }

  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex shrink-0 flex-col items-center gap-1">
            {pass ? <PenTick className="h-8 w-9" /> : <PenCross className="h-8 w-8" />}
            {result.selfRating ? (
              <RedPen className="text-lg">{RATING_WORDS[result.selfRating]}</RedPen>
            ) : (
              <CircledScore value={String(result.score)} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-xl font-medium text-ink">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
            {result.examAdjusted && (
              <p className="mt-1 text-sm text-accent-text">
                Moved up to {formatDate(result.nextReviewDate.slice(0, 10), { weekday: "short", month: "short", day: "numeric" })} so it comes up before your exam.
              </p>
            )}
            <span className="sr-only">Score {result.score} out of 100.</span>
          </div>
        </div>

        <p className="mt-5 text-[15px] leading-relaxed text-ink">{result.feedback}</p>

        {keyGraded && result.correctAnswer && result.mode !== "truefalse" && !pass && !result.feedback.includes(result.correctAnswer) && (
          <p className="mt-3 text-sm text-ink-2">
            Answer: <span className="font-medium text-ink">{result.correctAnswer}</span>
          </p>
        )}

        {modelGraded && (result.coveredKeyPoints.length > 0 || result.missingKeyPoints.length > 0) && (
          <ul className="mt-5 grid gap-1.5 text-sm sm:grid-cols-2">
            {result.coveredKeyPoints.map((k) => (
              <li key={`c-${k}`} className="flex items-start gap-2 text-ink">
                <PenTick className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="sr-only">Covered: </span>
                  {k}
                </span>
              </li>
            ))}
            {result.missingKeyPoints.map((k) => (
              <li key={`m-${k}`} className="flex items-start gap-2 text-ink-2">
                <PenCross className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="sr-only">Missed: </span>
                  {k}
                </span>
              </li>
            ))}
          </ul>
        )}

        {analogy && (
          <div className="mt-5 border-l-2 border-pen/50 pl-4">
            <p className="text-xs text-ink-3">Another way to see it</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">{analogy}</p>
          </div>
        )}

        {!modelGraded && result.mode !== "flip" && result.mode !== "listen" && (
          <p className="mt-5 border-t border-line pt-4 text-sm leading-relaxed text-ink-2">
            <span className="text-ink-3">On the card: </span>
            {reveal.coreFact}
          </p>
        )}
        {modelGraded && (
          <details className="mt-5 border-t border-line pt-4">
            <summary className="cursor-pointer text-sm text-ink-2 hover:text-ink">Show the card</summary>
            <p className="mt-2 text-sm leading-relaxed text-ink">{reveal.coreFact}</p>
          </details>
        )}

        {!modelGraded && !pass && !analogy && (
          <div className="mt-4">
            <Button variant="secondary" className="text-xs" onClick={explain} loading={explaining}>
              Explain it differently
            </Button>
            {explainError && (
              <div className="mt-2">
                <ErrorNote>{explainError}</ErrorNote>
              </div>
            )}
          </div>
        )}
      </Card>

      {result.outcome === "hesitation" && result.followUpQuestion && <SocraticBubble reviewLogId={response.reviewLogId} question={result.followUpQuestion} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cx("text-xs text-ink-3")}>
          Marked by {engineName(result.engine)}
          {retrieval.concepts.length > 0 && (
            <span
              title={`Found with ${retrieval.method === "atlas-vector-search" ? "Atlas Vector Search" : "in-app similarity"}, only among your own ${retrieval.scopedTo === "demo" ? "demo cards" : "cards"}.`}
            >
              {" "}
              · linked to {retrieval.concepts.map((c) => c.conceptTitle).join(", ")}
            </span>
          )}
        </p>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-ink-3 sm:inline">
            <Kbd>Enter</Kbd>
          </span>
          <Button onClick={onNext}>{nextLabel}</Button>
        </div>
      </div>
    </div>
  );
}
