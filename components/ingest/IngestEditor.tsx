"use client";

import { useState } from "react";
import { ArrowRight, ClipboardPaste, FileText, Sparkles } from "lucide-react";
import type { AppActions } from "@/components/AppShell";
import { SampleDeckButtons } from "@/components/SampleDeckButtons";
import { Button, Card, Chip, ErrorNote, SectionTitle } from "@/components/ui/primitives";
import { api, ENGINE_SHORT, type EngineId, type ReviewCard } from "@/lib/client";

const MAX_CHARS = 20_000;

const EXAMPLE_NOTES = `# The Science of Learning — Lecture 4

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

export function IngestEditor({ actions }: { actions: AppActions }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

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
      await actions.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function fillExample() {
    setTitle("The Science of Learning");
    setNotes(EXAMPLE_NOTES);
  }

  return (
    <div className="grid gap-6 animate-rise lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <SectionTitle
          title="Ingest notes"
          subtitle="Paste Markdown lecture notes or documentation. Gemma splits them into atomic concepts that start in Box 1."
          action={
            <Button variant="ghost" className="text-xs" onClick={fillExample} icon={<ClipboardPaste className="size-3.5" aria-hidden />}>
              Use example notes
            </Button>
          }
        />
        <label className="block text-xs font-medium text-slate-400" htmlFor="deck-title">
          Deck title
        </label>
        <input
          id="deck-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Organic Chemistry · Week 3"
          maxLength={120}
          className="mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-800 placeholder:text-slate-600 focus:outline-none focus:ring-indigo-400"
        />
        <label className="mt-4 block text-xs font-medium text-slate-400" htmlFor="notes">
          Notes (Markdown)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, MAX_CHARS))}
          placeholder={"# Topic\n\n## Concept\nA few sentences explaining the idea…"}
          rows={16}
          spellCheck={false}
          className="mt-1 w-full resize-y rounded-lg bg-slate-950 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-slate-200 ring-1 ring-slate-800 placeholder:text-slate-600 focus:outline-none focus:ring-indigo-400"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-xs text-slate-500">
            {notes.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars
          </span>
          <Button onClick={extract} loading={loading} disabled={notes.trim().length < 80} icon={<Sparkles className="size-4" aria-hidden />}>
            {loading ? "Gemma is reading your notes…" : "Extract concepts"}
          </Button>
        </div>
        {loading && (
          <p className="mt-3 text-xs text-slate-500">
            Local Gemma 2 can take 30–90 seconds on a laptop. The concepts are embedded and saved to your deck as soon as it finishes.
          </p>
        )}
        {error && (
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Card>

      <div className="space-y-6">
        <Card className="p-5">
          <SectionTitle title="No notes handy?" subtitle="Load a curated deck with three weeks of sample history." />
          <SampleDeckButtons actions={actions} className="flex flex-col gap-2" />
        </Card>
        <Card className="p-5 text-sm leading-relaxed text-slate-400">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-slate-100">
            <FileText className="size-4 text-indigo-300" aria-hidden /> What makes good input
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>One heading per idea helps Gemma find concept boundaries.</li>
            <li>Full sentences beat terse fragments.</li>
            <li>Dense is fine: up to 12 concepts per ingest keeps reviews micro.</li>
          </ul>
        </Card>
      </div>

      {result && (
        <Card className="p-5 animate-rise lg:col-span-3">
          <SectionTitle
            title={`${result.cards.length} concepts added to “${result.deck.title}”`}
            subtitle={
              <span className="inline-flex flex-wrap items-center gap-2">
                Extracted by <Chip tone={result.engine === "heuristic" ? "amber" : "emerald"}>{ENGINE_SHORT[result.engine]}</Chip>
                Embedded with <Chip tone="sky">{result.embeddingModel}</Chip>
              </span>
            }
            action={
              <Button onClick={() => actions.goTo("review")} icon={<ArrowRight className="size-4" aria-hidden />}>
                Review now
              </Button>
            }
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.cards.map((c) => (
              <div key={c.id} className="rounded-xl bg-slate-950/70 p-4 ring-1 ring-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-display font-semibold text-slate-100">{c.conceptTitle}</h4>
                  <Chip tone="indigo">Box 1</Chip>
                </div>
                <p className="mt-2 text-sm text-slate-300">{c.coreFact}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">First question</p>
                <p className="mt-1 text-sm text-indigo-200">{c.question}</p>
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  {c.expectedKeyPoints.map((k) => (
                    <li key={k}>• {k}</li>
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
