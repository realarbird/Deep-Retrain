"use client";

import { useState } from "react";
import type { AppActions } from "@/components/AppShell";
import { Ledger } from "@/components/notebook/Ledger";
import { RedPen } from "@/components/notebook/RedPen";
import { Button } from "@/components/ui/primitives";
import { countWords, type CapStatus, type ReviewResponse, type StudyItem } from "@/lib/client";
import { CoolDownMatch } from "./CoolDownMatch";

export interface GradedEntry {
  item: StudyItem;
  response: ReviewResponse;
}

export function SessionSummary({
  entries,
  skipped,
  startedAt,
  endedAt,
  cap,
  moreDue,
  actions,
  onAgain,
}: {
  entries: GradedEntry[];
  skipped: number;
  startedAt: number;
  endedAt: number;
  cap: CapStatus;
  moreDue: boolean;
  actions: AppActions;
  onAgain: () => void;
}) {
  const [coolDown, setCoolDown] = useState(false);
  const up = entries.filter((e) => e.response.result.outcome === "promote" && e.response.result.newBox > e.response.result.boxBefore).length;
  const again = entries.filter((e) => e.response.result.outcome === "reset").length;
  const stayed = entries.length - up - again;
  const answeringMs = entries.reduce((s, e) => s + e.response.result.latencyMs, 0);
  const minutes = Math.max(1, Math.round((endedAt - startedAt) / 60_000));

  if (coolDown) {
    return (
      <div className="mx-auto max-w-3xl">
        <CoolDownMatch
          pairs={entries.map((e) => ({ id: e.item.id, title: e.item.conceptTitle, fact: e.response.reveal.coreFact }))}
          onClose={() => setCoolDown(false)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <RedPen rotate={-3}>{entries.length ? "nice work" : "nothing marked"}</RedPen>
        <h1 className="mt-2 font-serif text-3xl font-medium text-ink">
          {entries.length ? `${countWords(entries.length, "card")[0].toUpperCase()}${countWords(entries.length, "card").slice(1)} in about ${countWords(minutes, "minute")}.` : "Session over."}
        </h1>
        {entries.length > 0 && (
          <p className="mt-2 text-[15px] text-ink-2">
            You spent about {Math.max(1, Math.round(answeringMs / 1000))} seconds actually answering. The schedule handles the rest.
          </p>
        )}
      </div>

      {entries.length > 0 && (
        <Ledger
          rows={[
            { label: "Moved up a box", value: up },
            { label: "Stayed where they were", value: stayed },
            { label: "Start over tomorrow", value: again },
            ...(skipped ? [{ label: "Skipped (changed or reviewed elsewhere)", value: skipped }] : []),
            { label: "Reviews left today", value: `${cap.remaining} of ${cap.limit}` },
          ]}
        />
      )}

      {entries.length > 0 && (
        <ul className="divide-y divide-line border-y border-line text-sm">
          {entries.map(({ item, response }) => {
            const r = response.result;
            const label = r.outcome === "reset" ? "again" : r.newBox > r.boxBefore ? `box ${r.newBox}` : r.outcome === "hesitation" ? "slow" : `box ${r.newBox}`;
            const tone = r.outcome === "reset" ? "text-critical-text" : r.newBox > r.boxBefore ? "text-good-text" : "text-ink-2";
            return (
              <li key={item.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-ink">{item.conceptTitle}</span>
                <span className={`stamp ${tone}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {moreDue && !cap.reached ? (
          <Button onClick={onAgain}>Keep going</Button>
        ) : (
          <Button onClick={() => actions.goTo("today")}>Back to today</Button>
        )}
        {entries.length >= 5 && (
          <Button variant="secondary" onClick={() => setCoolDown(true)}>
            Cool-down: match five
          </Button>
        )}
        {moreDue && !cap.reached && (
          <Button variant="ghost" onClick={() => actions.goTo("today")}>
            That&apos;s enough for now
          </Button>
        )}
      </div>
    </div>
  );
}
