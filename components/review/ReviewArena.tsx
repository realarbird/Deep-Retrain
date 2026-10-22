"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpenText, CheckCircle2, CornerDownLeft, HelpCircle, LayoutDashboard } from "lucide-react";
import type { AppActions } from "@/components/AppShell";
import { SampleDeckButtons } from "@/components/SampleDeckButtons";
import { Button, Card, Chip, ErrorNote } from "@/components/ui/primitives";
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

  if (!card && phase === "answering") return <CaughtUp data={data} actions={actions} />;

  const queueLeft = queue.length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <span>
          {queueLeft} due · {data.cap.remaining} of {data.cap.limit} micro-reviews left today
        </span>
        {card && <Stopwatch elapsedMs={frozenLatency ?? elapsed} frozen={phase !== "answering"} />}
      </div>

      {card && (
        <Card className="p-6 sm:p-8 animate-rise" key={card.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="indigo">Box {card.leitnerBox}</Chip>
            <Chip tone="sky">{TIER_LABEL[card.difficultyTier]}</Chip>
            {card.reviewCount > 0 && (
              <span className="text-xs text-slate-500">
                seen {card.reviewCount}×{card.lastLatencyMs ? ` · last ${formatSeconds(card.lastLatencyMs)}` : ""}
              </span>
            )}
          </div>
          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-500">{card.conceptTitle}</p>
          <h1 className="mt-1 font-display text-2xl leading-snug text-white sm:text-[1.7rem]">{card.question}</h1>

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
                placeholder="Explain it in your own words…"
                aria-label="Your answer"
                className="w-full resize-y rounded-xl bg-slate-950 px-4 py-3 text-[15px] leading-relaxed text-slate-100 ring-1 ring-slate-800 placeholder:text-slate-600 focus:outline-none focus:ring-indigo-400 disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  disabled={phase === "grading"}
                  onClick={() => void submit("")}
                  icon={<HelpCircle className="size-3.5" aria-hidden />}
                >
                  I don&apos;t know yet
                </Button>
                <Button type="submit" loading={phase === "grading"} disabled={!answer.trim()} icon={<CornerDownLeft className="size-4" aria-hidden />}>
                  {phase === "grading" ? "Gemma is grading…" : "Submit  ⌘↵"}
                </Button>
              </div>
              {error && <ErrorNote>{error}</ErrorNote>}
            </form>
          )}

          {phase === "result" && answer && (
            <blockquote className="mt-5 border-l-2 border-slate-700 pl-4 text-sm italic text-slate-400">{answer}</blockquote>
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

function CaughtUp({ data, actions }: { data: DashboardData; actions: AppActions }) {
  if (data.totals.cards === 0) {
    return (
      <Card className="mx-auto max-w-2xl p-10 text-center animate-rise">
        <BookOpenText className="mx-auto size-8 text-indigo-300" aria-hidden />
        <h1 className="mt-4 font-display text-2xl font-semibold text-white">Nothing to review yet</h1>
        <p className="mt-2 text-sm text-slate-400">Load a sample deck to try the arena in one click, or ingest your own notes.</p>
        <SampleDeckButtons actions={actions} className="mt-6 flex flex-wrap justify-center gap-2" />
      </Card>
    );
  }
  return (
    <Card className="mx-auto max-w-2xl p-10 text-center animate-rise">
      <CheckCircle2 className="mx-auto size-9 text-emerald-300" aria-hidden />
      <h1 className="mt-4 font-display text-2xl font-semibold text-white">All caught up</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
        {data.nextDue
          ? `Your next review, ${data.nextDue.conceptTitle}, unlocks ${formatRelative(data.nextDue.at)}. The gap is the point: forgetting a little makes the next recall stronger.`
          : "Every concept is resting until its next interval."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => actions.goTo("dashboard")} icon={<LayoutDashboard className="size-4" aria-hidden />}>
          View dashboard
        </Button>
        <Button variant="ghost" onClick={() => actions.goTo("ingest")} icon={<BookOpenText className="size-4" aria-hidden />}>
          Ingest more notes
        </Button>
      </div>
    </Card>
  );
}
