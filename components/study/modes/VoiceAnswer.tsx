"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button, cx, ErrorNote, inputClass } from "@/components/ui/primitives";
import { useRecognizer } from "../useSpeech";
import { ConfidencePicker } from "./ConfidencePicker";
import type { OpenSubmit } from "./OpenAnswer";

/**
 * Say it: answer out loud. The browser turns speech into text (in Chrome that
 * happens on Google's servers); you can fix the text, then Gemma grades it.
 */
export function VoiceAnswer({
  askConfidence,
  busy,
  onSubmit,
  onFirstKey,
}: {
  askConfidence: boolean;
  busy: boolean;
  onSubmit: (s: OpenSubmit) => void;
  onFirstKey: () => void;
}) {
  const { listening, text, setText, error, start, stop, supported } = useRecognizer();
  const [confidence, setConfidence] = useState<1 | 2 | 3 | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (text && !started.current) {
      started.current = true;
      onFirstKey();
    }
  }, [text, onFirstKey]);

  return (
    <div className="space-y-3">
      {supported ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={listening ? stop : start}
            disabled={busy}
            className={cx(
              "inline-flex size-14 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              listening ? "border-pen bg-pen text-paper" : "border-ink bg-paper text-ink hover:bg-sunken",
            )}
            aria-label={listening ? "Stop recording" : "Start recording"}
          >
            {listening ? <Square className="size-5" fill="currentColor" /> : <Mic className="size-6" />}
          </button>
          <p className="text-sm text-ink-2">
            {listening ? "Listening. Tap again when you're done." : text ? "Fix anything it misheard, then hand it in." : "Tap and answer out loud."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-2">This browser can&apos;t turn speech into text, so type your answer instead.</p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={3}
        disabled={busy}
        placeholder={supported ? "Your words show up here" : "In your own words"}
        aria-label="Your answer"
        className={cx(inputClass, "resize-y px-4 py-3 text-[15px] leading-relaxed")}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {askConfidence && <ConfidencePicker value={confidence} onChange={setConfidence} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" className="text-xs" disabled={busy} onClick={() => onSubmit({ answer: "", confidence })}>
          I don&apos;t know yet
        </Button>
        <Button
          onClick={() => {
            stop();
            onSubmit({ answer: text, confidence });
          }}
          loading={busy}
          disabled={!text.trim()}
        >
          {busy ? "Marking…" : "Hand it in"}
        </Button>
      </div>
      <p className="text-xs text-ink-3">Your browser turns speech into text (Chrome does this on Google&apos;s servers). Only the text you send is marked.</p>
    </div>
  );
}
