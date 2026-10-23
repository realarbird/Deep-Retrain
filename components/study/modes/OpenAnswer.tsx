"use client";

import { useEffect, useRef, useState } from "react";
import { Button, cx, inputClass, Kbd } from "@/components/ui/primitives";
import { ConfidencePicker } from "./ConfidencePicker";

export interface OpenSubmit {
  answer: string;
  confidence: 1 | 2 | 3 | null;
}

/** Write and Teach it back: answer in your own words. Ctrl or Cmd + Enter sends. */
export function OpenAnswer({
  teach = false,
  askConfidence,
  busy,
  onSubmit,
  onFirstKey,
}: {
  teach?: boolean;
  askConfidence: boolean;
  busy: boolean;
  onSubmit: (s: OpenSubmit) => void;
  onFirstKey: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState<1 | 2 | 3 | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const typed = useRef(false);

  useEffect(() => ref.current?.focus(), []);

  const send = (text: string) => !busy && onSubmit({ answer: text, confidence });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        send(answer);
      }}
    >
      <textarea
        ref={ref}
        value={answer}
        onChange={(e) => {
          if (!typed.current) {
            typed.current = true;
            onFirstKey();
          }
          setAnswer(e.target.value.slice(0, 2000));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send(answer);
          }
        }}
        disabled={busy}
        rows={teach ? 7 : 4}
        placeholder={teach ? "Start simple. What is it, why does it matter, and how would you explain it with an example?" : "In your own words"}
        aria-label="Your answer"
        className={cx(inputClass, "resize-y px-4 py-3 text-[15px] leading-relaxed")}
      />
      {askConfidence && <ConfidencePicker value={confidence} onChange={setConfidence} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" className="text-xs" disabled={busy} onClick={() => send("")}>
          I don&apos;t know yet
        </Button>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-ink-3 sm:inline">
            <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>
          </span>
          <Button type="submit" loading={busy} disabled={!answer.trim()}>
            {busy ? "Marking…" : "Hand it in"}
          </Button>
        </div>
      </div>
    </form>
  );
}
