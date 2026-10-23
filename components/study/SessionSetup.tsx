"use client";

import { useState } from "react";
import { Button, Card, cx, Kicker, Segmented } from "@/components/ui/primitives";
import { MODE_INFO, type DeckSummary } from "@/lib/client";
import type { DefaultMode, SessionSize } from "@/lib/settingsSchema";
import { speechRecognitionSupported, speechSynthesisSupported } from "./useSpeech";

const GROUPS: { title: string; note: string; modes: DefaultMode[] }[] = [
  { title: "Let it choose", note: "Recommended", modes: ["auto"] },
  { title: "Tired? Tap.", note: "Quick, and good for new cards", modes: ["choice", "truefalse", "flip"] },
  { title: "A word or a sentence", note: "Recall it, don't just recognize it", modes: ["cloze", "write", "voice"] },
  { title: "Make it stick", note: "Slower, deeper", modes: ["teach"] },
  { title: "Hands-free", note: "Walking, cooking, on the bus", modes: ["listen"] },
];

export function SessionSetup({
  decks,
  initialMode,
  initialSize,
  remaining,
  dueTotal,
  notice,
  offlineGrader = false,
  onStart,
}: {
  decks: DeckSummary[];
  initialMode: DefaultMode;
  initialSize: SessionSize;
  remaining: number;
  dueTotal: number;
  notice?: string | null;
  /** No AI key and no Ollama: written answers fall back to the offline grader. */
  offlineGrader?: boolean;
  onStart: (opts: { mode: DefaultMode; size: SessionSize; deckId?: string }) => void;
}) {
  const [mode, setMode] = useState<DefaultMode>(initialMode);
  const [size, setSize] = useState<SessionSize>(initialSize);
  const [deckId, setDeckId] = useState<string>("");
  const canHear = speechRecognitionSupported();
  const canSpeak = speechSynthesisSupported();

  const disabled = (m: DefaultMode) => (m === "voice" && !canHear) || (m === "listen" && !canSpeak);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-medium text-ink">How do you want to study?</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          {dueTotal > 0
            ? `${dueTotal} due, room for ${remaining} more today. Every way below counts the same toward your daily limit.`
            : "Nothing is due right now."}
        </p>
        {notice && <p className="mt-2 text-sm text-ink-2">{notice}</p>}
      </div>

      <div className="space-y-6">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <div className="mb-2 flex items-baseline gap-3">
              <Kicker>{group.title}</Kicker>
              <span className="text-xs text-ink-3">{group.note}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {group.modes.map((m) => {
                const info = MODE_INFO[m];
                const off = disabled(m);
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    disabled={off}
                    onClick={() => setMode(m)}
                    className={cx(
                      "flex flex-col items-start rounded-[6px] border bg-paper px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
                      m === "auto" && "sm:col-span-3",
                      mode === m ? "border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]" : "border-line-strong hover:border-ink-3",
                    )}
                  >
                    <span className="font-medium text-ink">{info.label}</span>
                    <span className="mt-0.5 text-sm leading-snug text-ink-2">{info.blurb}</span>
                    <span className="mt-2 text-xs text-ink-3">
                      {off
                        ? m === "voice"
                          ? "Your browser can't turn speech into text."
                          : "Your browser can't read aloud."
                        : m === "auto"
                          ? "Box 1: multiple choice · box 2: fill the gap · box 3 and up: write"
                          : `${info.pace} · marked by ${info.grader === "Gemma" && offlineGrader ? "the offline grader" : info.grader}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Card className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div className="flex min-w-0 max-w-full flex-wrap items-end gap-5">
          <div>
            <p className="mb-1.5 text-xs text-ink-3">How many</p>
            <Segmented<string>
              label="Session length"
              value={String(size)}
              onChange={(v) => setSize(v === "all" ? "all" : (Number(v) as 5 | 10 | 15))}
              options={[
                { value: "5", label: "5" },
                { value: "10", label: "10" },
                { value: "15", label: "15" },
                { value: "all", label: "All I can" },
              ]}
            />
          </div>
          {decks.length > 1 && (
            <label className="min-w-0 max-w-full text-xs text-ink-3">
              <span className="mb-1.5 block">From</span>
              <select
                value={deckId}
                onChange={(e) => setDeckId(e.target.value)}
                className="w-full max-w-full rounded-[4px] border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none sm:w-auto"
              >
                <option value="">All decks</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.dueNow} due)
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <Button className="px-5" disabled={dueTotal === 0 || remaining === 0} onClick={() => onStart({ mode, size, deckId: deckId || undefined })}>
          Start
        </Button>
      </Card>
    </div>
  );
}
