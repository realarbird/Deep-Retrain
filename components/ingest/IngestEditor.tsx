"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { AppActions } from "@/components/AppShell";
import { Button, Card, cx, ErrorNote, inputClass, SectionTitle, Tag } from "@/components/ui/primitives";
import { api, ApiError, engineName, formatRelative, type EngineId, type ReviewCard } from "@/lib/client";
import { MAX_IMPORT_BYTES, MAX_IMPORT_MB } from "@/lib/importLimits";

const MAX_CHARS = 20_000;
const ACCEPT = ".md,.markdown,.txt,.pdf,.docx";

const EXAMPLE_NOTES = `# The Science of Learning, Lecture 4

## The Spacing Effect
Information is retained far longer when study sessions are spread out over time rather than massed together.
Each retrieval after a gap forces the brain to reconstruct the memory, which strengthens it. Ebbinghaus first measured this in 1885.

## Retrieval Practice
Actively recalling information (self-testing) produces stronger long-term memory than re-reading the same material.
Retrieval works even when the learner fails, as long as feedback follows. This is also called the testing effect.

## Sleep and Memory Consolidation
During slow-wave sleep the hippocampus replays recent experiences and transfers them to the neocortex for long-term storage.
Sleep deprivation after learning reduces retention, even if the person later catches up on sleep.

## Desirable Difficulties
Learning conditions that feel harder in the moment, such as spacing, interleaving and generation, often improve long-term retention.
Fluency during study is a poor predictor of what will be remembered later.
`;

interface IngestResult {
  deck: { id: string; title: string; cardCount: number };
  cards: (ReviewCard & { coreFact: string; expectedKeyPoints: string[] })[];
  engine: EngineId;
  embeddingModel: string;
}

interface ImportResult {
  title: string;
  text: string;
  truncated: boolean;
}

interface Draft {
  title: string;
  text: string;
  updatedAt: string;
  deviceLabel: string;
}

const DRAFT_DELAY_MS = 1_500;

/**
 * The notes in the editor are saved to your account as you type, so you can
 * paste on a laptop and finish on a phone. If another device saved a newer
 * draft meanwhile, you choose which one to keep.
 */
function useSyncedDraft(title: string, notes: string, load: (d: Draft) => void) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [conflict, setConflict] = useState<Draft | null>(null);
  const base = useRef<string | null>(null);
  const ready = useRef(false);
  /** Set when the editor is filled from a draft, so that fill isn't saved straight back. */
  const skipNext = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api<{ draft: Draft | null }>("/api/draft")
      .then(({ draft }) => {
        if (cancelled) return;
        base.current = draft?.updatedAt ?? null;
        if (draft) {
          skipNext.current = true;
          load(draft);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        ready.current = true;
      });
    return () => {
      cancelled = true;
    };
    // Load once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (force = false) => {
    setStatus("saving");
    try {
      const r = await api<{ draft: Draft | null }>("/api/draft", {
        method: "PUT",
        json: { title, text: notes, baseUpdatedAt: base.current, force },
      });
      base.current = r.draft?.updatedAt ?? null;
      setConflict(null);
      setStatus("saved");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(err.body.draft as Draft);
        setStatus("idle");
      } else {
        setStatus("error");
      }
    }
  }, [title, notes]);

  useEffect(() => {
    if (!ready.current || conflict) return;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const t = window.setTimeout(() => void save(), DRAFT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [title, notes, conflict, save]);

  return {
    status,
    conflict,
    keepMine: () => void save(true),
    takeTheirs: () => {
      if (!conflict) return;
      base.current = conflict.updatedAt;
      skipNext.current = true;
      load(conflict);
      setConflict(null);
    },
    cleared: () => {
      base.current = null;
      skipNext.current = true;
    },
  };
}

export function IngestEditor({ actions, hasAiKey }: { actions: AppActions; hasAiKey: boolean }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const draft = useSyncedDraft(title, notes, (d) => {
    setTitle(d.title);
    setNotes(d.text);
    setDraftNote(`Picked up your draft${d.deviceLabel ? ` from ${d.deviceLabel}` : ""}, saved ${formatRelative(d.updatedAt)}.`);
  });

  async function extract() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<IngestResult>("/api/ingest", {
        method: "POST",
        json: { deckTitle: title.trim() || "Untitled notes", rawText: notes },
      });
      setResult(r);
      // The server clears the draft once the notes are cards.
      draft.cleared();
      setTitle("");
      setNotes("");
      setDraftNote(null);
      await actions.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function importFile(file: File) {
    // Clear the picker so choosing the same file again still fires onChange.
    if (fileInput.current) fileInput.current.value = "";
    setError(null);
    setImportNote(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`That file is over ${MAX_IMPORT_MB} MB. Split it or paste the part you need.`);
      return;
    }
    if (notes.trim() && !window.confirm(`Replace the notes in the editor with ${file.name}?`)) return;

    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form, cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as Partial<ImportResult> & { error?: string };
      if (!res.ok) throw new ApiError(body.error || `Import failed (${res.status})`, res.status, body);
      const r = body as ImportResult;
      setNotes(r.text);
      if (!title.trim()) setTitle(r.title);
      setImportNote(
        `Imported ${file.name}${r.truncated ? `. Only the first ${MAX_CHARS.toLocaleString()} characters fit; import the rest as a second deck.` : "."} Check the text, then create the cards.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function fillExample() {
    setTitle("The Science of Learning");
    setNotes(EXAMPLE_NOTES);
    setImportNote(null);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <SectionTitle
            title="Add notes"
            subtitle="Paste or import lecture notes. Each idea becomes a card that starts in box 1. Your draft is kept in your account until you make the cards."
            action={
              <div className="flex gap-1">
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={fillExample}>
                  Use example
                </Button>
                <Button
                  variant="secondary"
                  className="px-2.5 py-1 text-xs"
                  onClick={() => fileInput.current?.click()}
                  loading={importing}
                  icon={<Upload className="size-3.5" aria-hidden />}
                >
                  Import file
                </Button>
              </div>
            }
          />
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
            }}
          />

          <label className="block text-sm font-medium text-ink" htmlFor="deck-title">
            Deck title
          </label>
          <input
            id="deck-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Organic Chemistry, week 3"
            maxLength={120}
            className={cx(inputClass, "mt-1.5")}
          />

          <label className="mt-4 block text-sm font-medium text-ink" htmlFor="notes">
            Notes
          </label>
          <div
            className="relative mt-1.5"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void importFile(file);
            }}
          >
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, MAX_CHARS))}
              placeholder={"# Topic\n\n## Concept\nA few sentences explaining the idea…\n\nOr drop a .md, .txt, .pdf or .docx file here."}
              rows={16}
              spellCheck={false}
              className={cx(inputClass, "resize-y font-mono text-[13px] leading-relaxed")}
            />
            {dragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-surface/90 text-sm text-ink">
                Drop to import
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs tabular-nums text-ink-3">
              {notes.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              {draft.status === "saving" && " · saving draft…"}
              {draft.status === "saved" && notes && " · draft saved to your account"}
              {draft.status === "error" && " · draft not saved"}
            </span>
            <Button onClick={extract} loading={loading} disabled={notes.trim().length < 80 || importing}>
              {loading ? "Reading your notes…" : "Create cards"}
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {loading && (
              <p className="text-xs text-ink-3">
                {hasAiKey
                  ? "This usually takes a few seconds."
                  : "No AI key saved, so the offline extractor will split your notes by heading."}
              </p>
            )}
            {draftNote && !importNote && <p className="text-sm text-ink-2">{draftNote}</p>}
            {draft.conflict && (
              <div className="flex flex-wrap items-center gap-2 rounded-[4px] bg-sunken px-3 py-2 text-sm text-ink-2">
                <span>
                  A newer draft was saved{draft.conflict.deviceLabel ? ` from ${draft.conflict.deviceLabel}` : ""} {formatRelative(draft.conflict.updatedAt)}.
                </span>
                <Button variant="secondary" className="px-2 py-1 text-xs" onClick={draft.takeTheirs}>
                  Load that one
                </Button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={draft.keepMine}>
                  Keep mine
                </Button>
              </div>
            )}
            {importNote && <p className="text-sm text-ink-2">{importNote}</p>}
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
        </Card>

        <div className="space-y-6 text-sm leading-relaxed text-ink-2">
          <section>
            <h3 className="font-serif text-[17px] font-medium text-ink">What works well</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-ink-3">
              <li>One heading per idea helps find where each concept starts and ends.</li>
              <li>Full sentences work better than short fragments.</li>
              <li>Up to 12 cards are made per deck, so reviews stay short.</li>
              <li>After the cards are made, Gemma writes quiz versions of each one (multiple choice, fill the gap, true or false) in the background.</li>
            </ul>
          </section>
          <section>
            <h3 className="font-serif text-[17px] font-medium text-ink">Importing files</h3>
            <p className="mt-2">
              Markdown, plain text, PDF and Word (.docx) files up to {MAX_IMPORT_MB} MB. The text is pulled out so you can
              check it before making cards; the file itself isn&apos;t kept. Scanned PDFs have no text layer and need OCR
              first.
            </p>
          </section>
          {!hasAiKey && (
            <section>
              <h3 className="font-serif text-[17px] font-medium text-ink">No AI key yet</h3>
              <p className="mt-2">
                Without a key, cards are made by a simple offline extractor.{" "}
                <button className="text-accent-text underline underline-offset-2" onClick={() => actions.goTo("settings")}>
                  Add your free key
                </button>{" "}
                for better questions.
              </p>
            </section>
          )}
        </div>
      </div>

      {result && (
        <Card className="p-5 sm:p-6">
          <SectionTitle
            title={`${result.cards.length} cards added to “${result.deck.title}”`}
            subtitle={`Made by ${engineName(result.engine)}.`}
            action={<Button onClick={() => actions.startStudy({})}>Study them now</Button>}
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.cards.map((c) => (
              <div key={c.id} className="rounded-md border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-ink">{c.conceptTitle}</h4>
                  <Tag>Box 1</Tag>
                </div>
                <p className="mt-2 text-sm text-ink-2">{c.coreFact}</p>
                <p className="mt-3 text-xs text-ink-3">First question</p>
                <p className="mt-0.5 text-sm text-ink">{c.question}</p>
                <ul className="mt-3 list-disc space-y-0.5 pl-4 text-xs text-ink-2 marker:text-ink-3">
                  {c.expectedKeyPoints.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
