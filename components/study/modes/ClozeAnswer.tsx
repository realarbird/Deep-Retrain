"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/primitives";

const BLANK = "____";

/**
 * Fill the gap: the sentence is printed on the card's rules with a writable
 * blank in it. Enter hands it in; small typos and plurals are fine. The
 * buttons live under the card (`ClozeActions`) and submit the same form.
 */
export function ClozeSentence({
  formId,
  text,
  value,
  busy,
  onChange,
  onSubmit,
  onFirstKey,
}: {
  formId: string;
  text: string;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFirstKey: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const typed = useRef(false);
  const [before, ...rest] = text.split(BLANK);
  const after = rest.join(BLANK);

  useEffect(() => ref.current?.focus(), []);

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && value.trim()) onSubmit();
      }}
    >
      <p className="font-serif text-xl leading-7 text-ink sm:text-[1.35rem] sm:leading-7">
        {before}
        <input
          ref={ref}
          value={value}
          onChange={(e) => {
            if (!typed.current) {
              typed.current = true;
              onFirstKey();
            }
            onChange(e.target.value.slice(0, 120));
          }}
          disabled={busy}
          aria-label="The missing word"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="mx-1 inline-block h-6 border-0 border-b-2 border-dashed border-ink-3 bg-transparent px-1 py-0 text-center align-baseline font-sans text-base leading-6 text-accent-text focus:border-solid focus:border-accent focus:outline-none"
          style={{ width: `${Math.max(8, value.length + 2)}ch` }}
        />
        {after}
      </p>
    </form>
  );
}

export function ClozeActions({ formId, busy, canSubmit, onGiveUp }: { formId: string; busy: boolean; canSubmit: boolean; onGiveUp: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="ghost" className="text-xs" disabled={busy} onClick={onGiveUp}>
        No idea
      </Button>
      <Button type="submit" form={formId} loading={busy} disabled={!canSubmit}>
        {busy ? "Checking…" : "Check"}
      </Button>
    </div>
  );
}

/** The sentence after marking: a right answer underlined, a wrong one crossed out next to the right one. */
export function ClozeMarked({ text, given, correct, right }: { text: string; given: string; correct: string | null; right: boolean }) {
  const [before, ...rest] = text.split(BLANK);
  const after = rest.join(BLANK);
  return (
    <p className="font-serif text-xl leading-7 text-ink sm:text-[1.35rem] sm:leading-7">
      {before}
      {right ? (
        <span className="underline decoration-pen decoration-2 underline-offset-4">{correct ?? given}</span>
      ) : (
        <>
          {given && (
            <>
              <s className="text-ink-3 decoration-pen decoration-2">{given}</s>{" "}
            </>
          )}
          <span className="pen text-[1.5rem]">{correct ?? "…"}</span>
        </>
      )}
      {after}
    </p>
  );
}
