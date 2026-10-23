"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { IndexCard } from "@/components/notebook/IndexCard";
import { Stopwatch, useStopwatch } from "@/components/review/Stopwatch";
import { Button, ErrorNote, Kbd, Kicker } from "@/components/ui/primitives";
import {
  api,
  ApiError,
  attemptId as newAttemptId,
  MODE_INFO,
  TIER_LABEL,
  tzName,
  tzOffset,
  type CapStatus,
  type ReviewResponse,
  type SelfRating,
  type StudyItem,
} from "@/lib/client";
import { MODE_RULES } from "@/lib/leitner";
import { GradedCard } from "./GradedCard";
import { ChoiceAnswer } from "./modes/ChoiceAnswer";
import { ClozeActions, ClozeMarked, ClozeSentence } from "./modes/ClozeAnswer";
import { OpenAnswer, type OpenSubmit } from "./modes/OpenAnswer";
import { RatingBar } from "./modes/RatingBar";
import { TrueFalseAnswer } from "./modes/TrueFalseAnswer";
import { VoiceAnswer } from "./modes/VoiceAnswer";
import { speak, speechSynthesisSupported, stopSpeaking } from "./useSpeech";

type Phase = "answer" | "revealing" | "revealed" | "grading" | "done";

interface Props {
  item: StudyItem;
  index: number;
  total: number;
  sessionId: string;
  askConfidence: boolean;
  speech: { rate: number; pauseSec: number };
  onGraded: (response: ReviewResponse, item: StudyItem) => void;
  onNext: () => void;
  onSkip: (reason: string) => void;
  onCapReached: (cap: CapStatus) => void;
  onEnd: () => void;
}

export function StudyCard({ item, index, total, sessionId, askConfidence, speech, onGraded, onNext, onSkip, onCapReached, onEnd }: Props) {
  const [phase, setPhase] = useState<Phase>("answer");
  const [response, setResponse] = useState<ReviewResponse | null>(null);
  const [reveal, setReveal] = useState<{ coreFact: string; expectedKeyPoints: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listenStep, setListenStep] = useState<"question" | "pause" | "answer" | "paused">("question");
  const [pauseLeft, setPauseLeft] = useState(speech.pauseSec);
  const [cloze, setCloze] = useState("");
  const [clozeGiven, setClozeGiven] = useState("");
  // One attempt id per card, kept across retries, so a resent answer can't move the card twice.
  const attempt = useMemo(() => newAttemptId(), []);
  const thinkMs = useRef<number | null>(null);
  const [revealedMs, setRevealedMs] = useState<number | null>(null);
  const { elapsed, read } = useStopwatch(item.id, phase === "answer");
  const threshold = MODE_RULES[item.mode].latencyMs;
  const isFlip = item.mode === "flip" || item.mode === "listen";

  const post = useCallback(
    async (body: Record<string, unknown>, back: Phase) => {
      setPhase("grading");
      setError(null);
      try {
        const r = await api<ReviewResponse>("/api/review", {
          method: "POST",
          json: { ...body, cardId: item.id, tzOffsetMinutes: tzOffset(), tzName: tzName() || undefined, attemptId: attempt, sessionId },
        });
        setResponse(r);
        setPhase("done");
        onGraded(r, item);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.body.capReached) return onCapReached(err.body.cap as CapStatus);
          if (err.body.reviewedElsewhere || err.body.stale || err.body.revealed || err.body.needsReveal) return onSkip(err.message);
        }
        setError((err as Error).message);
        setPhase(back);
      }
    },
    [attempt, item, onCapReached, onGraded, onSkip, sessionId],
  );

  const firstKey = useCallback(() => {
    if (thinkMs.current === null) thinkMs.current = read();
  }, [read]);

  const showAnswer = useCallback(async () => {
    if (phase !== "answer") return;
    setRevealedMs(read());
    setPhase("revealing");
    try {
      const r = await api<{ coreFact: string; expectedKeyPoints: string[] }>("/api/review", {
        method: "POST",
        json: { mode: "reveal", cardId: item.id, tzOffsetMinutes: tzOffset() },
      });
      setReveal(r);
      setPhase("revealed");
      return r;
    } catch (err) {
      if (err instanceof ApiError && err.body.capReached) {
        onCapReached(err.body.cap as CapStatus);
        return;
      }
      setError((err as Error).message);
      setPhase("answer");
    }
  }, [item.id, onCapReached, phase, read]);

  const rate = useCallback(
    (rating: SelfRating) => post({ mode: item.mode, rating, latencyMs: revealedMs ?? read() }, "revealed"),
    [item.mode, post, read, revealedMs],
  );

  // Flip: Space shows the answer.
  useEffect(() => {
    if (item.mode !== "flip" || phase !== "answer") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " && !(e.target as HTMLElement | null)?.closest("textarea, input, button")) {
        e.preventDefault();
        void showAnswer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item.mode, phase, showAnswer]);

  // Listen: read the question, wait, show and read the answer. Rating is optional.
  useEffect(() => {
    if (item.mode !== "listen" || phase !== "answer" || listenStep === "paused") return;
    let cancelled = false;
    let timer: number | null = null;
    (async () => {
      setListenStep("question");
      await speak(`${item.conceptTitle}. ${item.prompt.kind === "flip" || item.prompt.kind === "open" ? item.prompt.question : ""}`, { rate: speech.rate });
      if (cancelled) return;
      setListenStep("pause");
      let left = speech.pauseSec;
      setPauseLeft(left);
      await new Promise<void>((resolve) => {
        timer = window.setInterval(() => {
          left -= 1;
          setPauseLeft(left);
          if (left <= 0 || cancelled) {
            if (timer) window.clearInterval(timer);
            resolve();
          }
        }, 1000);
      });
      if (cancelled) return;
      setListenStep("answer");
      const shown = await showAnswer();
      if (!cancelled && shown) await speak(shown.coreFact, { rate: speech.rate });
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stopSpeaking();
    };
    // Only restart when the card or the paused state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, listenStep === "paused"]);

  useEffect(() => () => stopSpeaking(), []);

  const prompt = item.prompt;
  const showTitle = prompt.kind !== "choice";
  const busy = phase === "grading" || phase === "revealing";
  const last = index + 1 >= total;
  const clozeForm = `cloze-${item.id}`;
  const sendCloze = (answer: string) => {
    setClozeGiven(answer.trim());
    void post({ mode: "cloze", answer, practiceVersion: item.practiceVersion, latencyMs: read() }, "answer");
  };

  const front = (
    <>
      {/* Every line is one rule (28px) tall, so text stays on the card's lines. */}
      {showTitle && <Kicker>{item.conceptTitle}</Kicker>}
      {prompt.kind === "cloze" ? (
        <>
          <p className="text-sm leading-7 text-ink-3">Fill in the missing word.</p>
          {phase === "done" && response ? (
            <ClozeMarked text={prompt.text} given={clozeGiven} correct={response.result.correctAnswer} right={response.result.isAccurate} />
          ) : (
            <ClozeSentence
              formId={clozeForm}
              text={prompt.text}
              value={cloze}
              busy={busy}
              onChange={setCloze}
              onFirstKey={firstKey}
              onSubmit={() => sendCloze(cloze)}
            />
          )}
        </>
      ) : prompt.kind === "truefalse" ? (
        <>
          <p className="text-sm leading-7 text-ink-3">True or false?</p>
          <p className="font-serif text-xl leading-7 text-ink sm:text-[1.35rem] sm:leading-[1.75rem]">“{prompt.statement}”</p>
        </>
      ) : prompt.kind === "choice" ? (
        <p className="whitespace-pre-line font-serif text-xl leading-7 text-ink sm:text-[1.35rem] sm:leading-[1.75rem]">{prompt.question}</p>
      ) : (
        <p className="font-serif text-xl leading-7 text-ink sm:text-[1.35rem] sm:leading-[1.75rem]">{prompt.question}</p>
      )}
    </>
  );

  const back = reveal && (
    <>
      <Kicker>The answer</Kicker>
      <p className="font-serif text-lg leading-7 text-ink">{reveal.coreFact}</p>
      {reveal.expectedKeyPoints.length > 0 && (
        <ul className="list-disc pl-5 text-[15px] leading-7 text-ink-2 marker:text-ink-3">
          {reveal.expectedKeyPoints.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
        <span>
          Card {index + 1} of {total} · {MODE_INFO[item.mode].label}
        </span>
        <div className="flex items-center gap-3">
          <Stopwatch elapsedMs={phase === "answer" ? elapsed : (revealedMs ?? elapsed)} frozen={phase !== "answer"} thresholdMs={threshold} />
          <button className="underline-offset-2 hover:text-ink hover:underline" onClick={onEnd}>
            End session
          </button>
        </div>
      </div>

      <IndexCard
        header={
          <>
            <span className="truncate">{item.deckTitle}</span>
            <span className="shrink-0">
              Box {item.box} · {TIER_LABEL[item.tier]}
            </span>
          </>
        }
        back={isFlip ? (back ?? <span />) : undefined}
        flipped={isFlip && Boolean(reveal)}
      >
        {front}
      </IndexCard>

      {phase !== "done" && (
        <div>
          {(item.mode === "write" || item.mode === "teach") && (
            <OpenAnswer
              teach={item.mode === "teach"}
              askConfidence={askConfidence}
              busy={busy}
              onFirstKey={firstKey}
              onSubmit={({ answer, confidence }: OpenSubmit) =>
                post({ mode: item.mode, answer, latencyMs: read(), thinkMs: thinkMs.current ?? undefined, confidence: confidence ?? undefined }, "answer")
              }
            />
          )}
          {item.mode === "voice" && (
            <VoiceAnswer
              askConfidence={askConfidence}
              busy={busy}
              onFirstKey={firstKey}
              onSubmit={({ answer, confidence }) => post({ mode: "voice", answer, latencyMs: read(), confidence: confidence ?? undefined }, "answer")}
            />
          )}
          {prompt.kind === "cloze" && <ClozeActions formId={clozeForm} busy={busy} canSubmit={Boolean(cloze.trim())} onGiveUp={() => sendCloze("")} />}
          {prompt.kind === "choice" && item.mode === "choice" && (
            <ChoiceAnswer options={prompt.options} busy={busy} onSubmit={(choice) => post({ mode: "choice", choice, practiceVersion: item.practiceVersion, latencyMs: read() }, "answer")} />
          )}
          {prompt.kind === "truefalse" && (
            <TrueFalseAnswer
              busy={busy}
              onSubmit={(answer) => post({ mode: "truefalse", statementId: prompt.statementId, answer, practiceVersion: item.practiceVersion, latencyMs: read() }, "answer")}
            />
          )}
          {item.mode === "flip" && (phase === "answer" || phase === "revealing") && (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void showAnswer()} loading={phase === "revealing"}>
                Show the answer
              </Button>
              <span className="text-xs text-ink-3">
                Say it in your head first. <Kbd>Space</Kbd>
              </span>
            </div>
          )}
          {item.mode === "listen" && (phase === "answer" || phase === "revealing") && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
              <Volume2 className="size-4 text-ink-3" aria-hidden />
              {!speechSynthesisSupported() ? (
                <>
                  This browser can&apos;t read aloud.{" "}
                  <Button variant="secondary" onClick={() => void showAnswer()}>
                    Show the answer
                  </Button>
                </>
              ) : listenStep === "paused" ? (
                <>
                  Paused.
                  <Button variant="secondary" className="py-1" onClick={() => setListenStep("question")} icon={<Play className="size-3.5" />}>
                    Read it again
                  </Button>
                </>
              ) : (
                <>
                  {listenStep === "question" && "Reading the question…"}
                  {listenStep === "pause" && `Answer out loud. The answer comes in ${pauseLeft}s.`}
                  {listenStep === "answer" && "Reading the answer…"}
                  <Button
                    variant="ghost"
                    className="py-1"
                    onClick={() => {
                      stopSpeaking();
                      setListenStep("paused");
                    }}
                    icon={<Pause className="size-3.5" />}
                  >
                    Pause
                  </Button>
                </>
              )}
            </div>
          )}
          {isFlip && (phase === "revealed" || (phase === "grading" && reveal)) && (
            <div className="space-y-3">
              <RatingBar busy={phase === "grading"} onRate={rate} />
              {item.mode === "listen" && (
                <button className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline" onClick={onNext}>
                  Next card without rating (it will come back to be rated)
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="mt-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
        </div>
      )}

      {phase === "done" && response && (
        <GradedCard response={response} onNext={onNext} nextLabel={response.cap.reached ? "Finish for today" : last ? "Finish" : "Next card"} />
      )}
    </div>
  );
}
