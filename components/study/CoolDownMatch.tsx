"use client";

import { useMemo, useState } from "react";
import { Button, cx } from "@/components/ui/primitives";

export interface MatchPair {
  id: string;
  title: string;
  fact: string;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shortFact(fact: string, title: string): string {
  const first = fact.split(/(?<=[.!?])\s+/)[0] ?? fact;
  const words = title.split(/\s+/).filter((w) => w.length > 3);
  let masked = first.replace(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "it");
  for (const w of words) masked = masked.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "…");
  return masked.length > 140 ? `${masked.slice(0, 139)}…` : masked;
}

/**
 * A cool-down after a session: match five of today's cards to their facts.
 * Nothing is graded or logged, and it only uses cards you've already done.
 */
export function CoolDownMatch({ pairs, onClose }: { pairs: MatchPair[]; onClose: () => void }) {
  const picked = useMemo(() => shuffle(pairs).slice(0, 5), [pairs]);
  const facts = useMemo(() => shuffle(picked.map((p) => ({ id: p.id, text: shortFact(p.fact, p.title) }))), [picked]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [misses, setMisses] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);
  const done = matched.length === picked.length;

  function chooseFact(id: string) {
    if (!selected || matched.includes(id)) return;
    if (selected === id) {
      setMatched((m) => [...m, id]);
      setSelected(null);
    } else {
      setMisses((n) => n + 1);
      setWrong(id);
      window.setTimeout(() => setWrong(null), 500);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-medium text-ink">Cool-down</h2>
        <p className="mt-1 text-sm text-ink-2">Tap a card, then the fact that goes with it. Just for fun: nothing here is graded.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ul className="space-y-2">
          {picked.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={matched.includes(p.id)}
                onClick={() => setSelected(p.id)}
                className={cx(
                  "w-full rounded-[5px] border px-3 py-2 text-left text-sm transition-colors",
                  matched.includes(p.id)
                    ? "border-line text-ink-3 line-through decoration-pen"
                    : selected === p.id
                      ? "border-ink bg-ink text-on-ink"
                      : "border-line-strong bg-paper text-ink hover:border-ink",
                )}
              >
                {p.title}
              </button>
            </li>
          ))}
        </ul>
        <ul className="space-y-2">
          {facts.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={matched.includes(f.id)}
                onClick={() => chooseFact(f.id)}
                className={cx(
                  "w-full rounded-[5px] border px-3 py-2 text-left text-sm leading-snug transition-colors",
                  matched.includes(f.id) ? "border-line text-ink-3" : wrong === f.id ? "border-critical bg-critical/10 text-ink" : "border-line-strong bg-paper text-ink-2 hover:border-ink hover:text-ink",
                )}
              >
                {f.text}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">{done ? (misses === 0 ? "All five, no misses." : `All five, with ${misses} ${misses === 1 ? "miss" : "misses"}.`) : `${matched.length} of ${picked.length} matched`}</p>
        <Button variant={done ? "primary" : "ghost"} onClick={onClose}>
          {done ? "Done" : "Skip"}
        </Button>
      </div>
    </div>
  );
}
