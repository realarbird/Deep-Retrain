"use client";

import { useState } from "react";
import { Button, cx, ErrorNote, inputClass, Tag } from "@/components/ui/primitives";
import { api, formatRelative, TIER_LABEL, type CardRow, type Tier } from "@/lib/client";

/** One card in the list. Opens to show the whole card, edit it, suspend it, start it over or delete it. */
export function CardRowItem({ card, deckTitle, onChange, onDelete }: { card: CardRow; deckTitle?: string; onChange: (c: CardRow) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ conceptTitle: card.conceptTitle, question: card.question, coreFact: card.coreFact, keyPoints: card.expectedKeyPoints.join("\n") });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const due = card.due;

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    try {
      const r = await api<{ card: CardRow }>(`/api/cards/${card.id}`, { method: "PATCH", json: body });
      onChange(r.card);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    const keyPoints = draft.keyPoints.split("\n").map((k) => k.trim()).filter(Boolean);
    const ok = await patch(
      { conceptTitle: draft.conceptTitle.trim(), question: draft.question.trim(), coreFact: draft.coreFact.trim(), expectedKeyPoints: keyPoints },
      "save",
    );
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!window.confirm(`Delete “${card.conceptTitle}” and its ${card.reviewCount} answers? This can't be undone.`)) return;
    setBusy("delete");
    try {
      await api(`/api/cards/${card.id}`, { method: "DELETE" });
      onDelete(card.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <li className="py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-[4px] px-2 py-2 text-left hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate text-sm", card.suspended ? "text-ink-3 line-through" : "text-ink")}>{card.conceptTitle}</span>
          {deckTitle && <span className="block truncate text-xs text-ink-3">{deckTitle}</span>}
        </span>
        <span className="hidden text-xs text-ink-3 sm:inline">{card.suspended ? "suspended" : due ? "due now" : `back ${formatRelative(card.nextReviewDate)}`}</span>
        <Tag>Box {card.box}</Tag>
        <span className="w-10 text-right text-xs tabular-nums text-ink-2" title="Estimated recall right now">
          {card.recall === null ? "new" : `${card.recall}%`}
        </span>
      </button>

      {open && (
        <div className="mx-2 mb-3 mt-1 rounded-[6px] border border-line bg-paper p-4 text-sm">
          {editing ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-ink-3">Concept</span>
                <input value={draft.conceptTitle} onChange={(e) => setDraft({ ...draft, conceptTitle: e.target.value })} maxLength={120} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-3">Question</span>
                <textarea value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} rows={2} maxLength={400} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-3">The fact</span>
                <textarea value={draft.coreFact} onChange={(e) => setDraft({ ...draft, coreFact: e.target.value })} rows={3} maxLength={600} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-3">Key points, one per line</span>
                <textarea value={draft.keyPoints} onChange={(e) => setDraft({ ...draft, keyPoints: e.target.value })} rows={4} className={inputClass} />
              </label>
              <p className="text-xs text-ink-3">Changing the fact or key points rebuilds this card&apos;s quiz questions; its box and history stay.</p>
              <div className="flex gap-2">
                <Button onClick={saveEdit} loading={busy === "save"}>
                  Save card
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-ink-3">
                {TIER_LABEL[(card.tier as Tier) ?? "recall"] ?? "Recall"} question
              </p>
              <p className="mt-0.5 font-serif text-[15px] text-ink">{card.question}</p>
              <p className="mt-3 text-xs text-ink-3">The fact</p>
              <p className="mt-0.5 leading-relaxed text-ink">{card.coreFact}</p>
              {card.expectedKeyPoints.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-ink-2 marker:text-ink-3">
                  {card.expectedKeyPoints.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-ink-3">
                {card.reviewCount} {card.reviewCount === 1 ? "answer" : "answers"}
                {card.lapses ? ` · missed ${card.lapses}×` : ""}
                {card.lastScore !== null ? ` · last score ${card.lastScore}%` : ""}
                {card.lastReviewedAt ? ` · last seen ${formatRelative(card.lastReviewedAt)}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" className="py-1 text-xs" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button variant="secondary" className="py-1 text-xs" onClick={() => patch({ suspended: !card.suspended }, "suspend")} loading={busy === "suspend"}>
                  {card.suspended ? "Bring it back" : "Suspend"}
                </Button>
                <Button
                  variant="ghost"
                  className="py-1 text-xs"
                  loading={busy === "reset"}
                  onClick={() => window.confirm("Start this card over in box 1, due now? Its history stays.") && void patch({ resetProgress: true }, "reset")}
                >
                  Start over
                </Button>
                <Button variant="danger" className="ml-auto py-1 text-xs" onClick={remove} loading={busy === "delete"}>
                  Delete
                </Button>
              </div>
            </>
          )}
          {error && (
            <div className="mt-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
