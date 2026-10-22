"use client";

import { useEffect, useRef, useState } from "react";
import type { AppActions } from "@/components/AppShell";
import { SampleDeckButtons } from "@/components/SampleDeckButtons";
import { Button, Card, cx, ErrorNote, inputClass, Tag } from "@/components/ui/primitives";
import { api, ApiError, formatRelative, formatSeconds, TIER_LABEL, tzOffset, type CapStatus, type DashboardData, type ReviewCard, type ReviewResponse } from "@/lib/client";
import { ResultPanel } from "./ResultPanel";
import { RestScreen } from "./RestScreen";
import { Stopwatch, useStopwatch } from "./Stopwatch";

type Phase = "answering" | "grading" | "result";

export function ReviewArena({ data, actions, isDemo }: { data: DashboardData; actions: AppActions; isDemo: boolean }) {
  const [pinned, setPinned] = useState<ReviewCard | null>(null);
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("answering");
  const [answer, setAnswer] = useState("");
  const [response, setResponse] = useState<ReviewResponse | null>(null);
  const [frozenLatency, setFrozenLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The card under review is pinned while grading/showing a result; otherwise it's the next due card.
  const queue = data.dueCards.filter((c) => !reviewedIds.includes(c.id));
  const card = pinned ?? queue[0] ?? null;

  const { elapsed, read } = useStopwatch(card?.id ?? "none", Boolean(card) && phase === "answering" && !data.cap.reached);

  useEffect(() => {
    if (card && phase === "answering") inputRef.current?.focus();
  }, [card, phase]);

  async function submit(text: string) {
    if (!card || phase !== "answering") return;
    const latencyMs = read();
    setPinned(card);
    setFrozenLatency(latencyMs);
    setPhase("grading");
    setError(null);
    try {
      const r = await api<ReviewResponse>("/api/review", {
        method: "POST",
        json: { mode: "answer", cardId: card.id, answer: text, latencyMs, tzOffsetMinutes: tzOffset() },
      });
      setReviewedIds((ids) => [...ids, card.id]);
      setResponse(r);
      actions.setCap(r.cap);
      setPhase("result");
    } catch (err) {
      if (err instanceof ApiError && err.body.capReached) {
        actions.setCap(err.body.cap as CapStatus);
        setPinned(null);
        setPhase("answering");
        return;
      }
      setError((err as Error).message);
      setPinned(null);
      setPhase("answering");
    }
  }

  async function next() {
    setAdvancing(true);
    await actions.refresh();
    setAdvancing(false);
    setPinned(null);
    setAnswer("");
    setResponse(null);
    setFrozenLatency(null);
    setPhase("answering");
  }

  // The result panel stays up even if this review used the last slot of the day.
  if (phase !== "result" && data.cap.reached) return <RestScreen cap={data.cap} actions={actions} isDemo={isDemo} />;

  if (!card && phase === "answering") return <CaughtUp data={data} actions={actions} isDemo={isDemo} />;

  const queueLeft = queue.length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
        <span>
          {queueLeft} due · {data.cap.remaining} of {data.cap.limit} reviews left today
        </span>
        {card && <Stopwatch elapsedMs={frozenLatency ?? elapsed} frozen={phase !== "answering"} />}
      </div>

      {card && (
        <Card className="p-6 sm:p-8" key={card.id}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <Tag>Box {card.leitnerBox}</Tag>
            <Tag>{TIER_LABEL[card.difficultyTier]}</Tag>
            {card.reviewCount > 0 && (
              <span>
                Seen {card.reviewCount}×{card.lastLatencyMs ? `, last in ${formatSeconds(card.lastLatencyMs)}` : ""}
              </span>
            )}
          </div>
          <p className="mt-6 text-sm text-ink-2">{card.conceptTitle}</p>
          <h1 className="mt-1 text-xl font-medium leading-snug text-ink sm:text-2xl">{card.question}</h1>

          {phase !== "result" && (
            <form
              className="mt-6 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(answer);
              }}
            >
              <textarea
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit(answer);
                  }
                }}
                disabled={phase === "grading"}
                rows={5}
                placeholder="Explain it in your own words"
                aria-label="Your answer"
                className={cx(inputClass, "resize-y px-4 py-3 text-[15px] leading-relaxed")}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="ghost" className="text-xs" disabled={phase === "grading"} onClick={() => void submit("")}>
                  I don&apos;t know yet
                </Button>
                <div className="flex items-center gap-3">
                  <span className="hidden text-xs text-ink-3 sm:inline">Ctrl + Enter</span>
                  <Button type="submit" loading={phase === "grading"} disabled={!answer.trim()}>
                    {phase === "grading" ? "Grading…" : "Submit"}
                  </Button>
                </div>
              </div>
              {error && <ErrorNote>{error}</ErrorNote>}
            </form>
          )}

          {phase === "result" && answer && (
            <blockquote className="mt-5 border-l-2 border-line-strong pl-4 text-sm text-ink-2">{answer}</blockquote>
          )}
        </Card>
      )}

      {phase === "result" && response && (
        <ResultPanel
          response={response}
          onNext={next}
          nextLabel={advancing ? "Loading…" : response.cap.reached ? "Finish for today" : queueLeft > 0 ? "Next concept" : "Done"}
        />
      )}
    </div>
  );
}

function CaughtUp({ data, actions, isDemo }: { data: DashboardData; actions: AppActions; isDemo: boolean }) {
  if (data.totals.cards === 0) {
    return (
      <Card className="mx-auto max-w-xl p-8 sm:p-10">
        <h1 className="text-xl font-semibold text-ink">Nothing to review yet</h1>
        {isDemo ? (
          <>
            <p className="mt-2 text-sm text-ink-2">Load a sample deck to start.</p>
            <SampleDeckButtons actions={actions} className="mt-6 flex flex-wrap gap-2" />
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-2">Add some notes and their cards will show up here.</p>
            <Button className="mt-6" onClick={() => actions.goTo("ingest")}>
              Add notes
            </Button>
          </>
        )}
      </Card>
    );
  }
  return (
    <Card className="mx-auto max-w-xl p-8 sm:p-10">
      <h1 className="text-xl font-semibold text-ink">All caught up</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        {data.nextDue
          ? `Your next review, ${data.nextDue.conceptTitle}, is due ${formatRelative(data.nextDue.at)}. The gap is on purpose: recalling something you've half forgotten is what makes it stick.`
          : "Every card is waiting for its next interval."}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => actions.goTo("dashboard")}>
          Back to overview
        </Button>
        {!isDemo && (
          <Button variant="ghost" onClick={() => actions.goTo("ingest")}>
            Add more notes
          </Button>
        )}
      </div>
    </Card>
  );
}
