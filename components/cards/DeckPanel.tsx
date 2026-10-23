"use client";

import { useState } from "react";
import { Button, cx, ErrorNote, inputClass } from "@/components/ui/primitives";
import { api, formatDate, tzName, tzOffset, type DeckSummary } from "@/lib/client";

/** Rename a deck, set its exam date, or delete it. */
export function DeckPanel({ deck, onChanged, onDeleted }: { deck: DeckSummary; onChanged: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const [title, setTitle] = useState(deck.title);
  const [examDate, setExamDate] = useState(deck.examDate ?? "");
  const [examLabel, setExamLabel] = useState(deck.examLabel);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = title.trim() !== deck.title || (examDate || null) !== deck.examDate || examLabel.trim() !== deck.examLabel;

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ pulled: number }>(`/api/decks/${deck.id}`, {
        method: "PATCH",
        json: { title: title.trim(), examDate: examDate || null, examLabel: examLabel.trim(), tzOffsetMinutes: tzOffset(), tzName: tzName() || undefined },
      });
      setNotice(r.pulled ? `Saved. ${r.pulled} ${r.pulled === 1 ? "review was" : "reviews were"} moved up to land before the exam.` : "Saved.");
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${deck.title}” with its ${deck.cardCount} cards and all their answers? This can't be undone.`)) return;
    setBusy("delete");
    try {
      await api(`/api/decks/${deck.id}`, { method: "DELETE" });
      await onDeleted();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs text-ink-3">Deck name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-3">Exam date</span>
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className={cx(inputClass, "py-1.5")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-3">Called</span>
          <input value={examLabel} onChange={(e) => setExamLabel(e.target.value)} maxLength={60} placeholder="e.g. Midterm" className={inputClass} />
        </label>
      </div>
      <p className="text-xs leading-relaxed text-ink-3">
        With an exam date, reviews that would land after it are moved into the last few days before it, and Today shows how ready you are.
        {deck.examDate && ` Currently ${formatDate(deck.examDate, { weekday: "short", month: "short", day: "numeric" })}.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} loading={busy === "save"} disabled={!dirty || !title.trim()}>
          Save deck
        </Button>
        {deck.examDate && (
          <Button variant="ghost" onClick={() => setExamDate("")}>
            Clear exam
          </Button>
        )}
        <Button variant="danger" className="ml-auto" onClick={remove} loading={busy === "delete"}>
          Delete deck
        </Button>
      </div>
      {notice && <p className="text-good-text">{notice}</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
