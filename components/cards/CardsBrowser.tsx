"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppActions } from "@/components/AppShell";
import { Card, cx, ErrorNote, inputClass, Kicker, Segmented } from "@/components/ui/primitives";
import { api, formatDate, type CardRow, type DashboardData } from "@/lib/client";
import { CardRowItem } from "./CardRowItem";
import { DeckPanel } from "./DeckPanel";

type Filter = "all" | "due" | "suspended";

export function CardsBrowser({ data, actions, isDemo }: { data: DashboardData; actions: AppActions; isDemo: boolean }) {
  const [deckId, setDeckId] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debounced, setDebounced] = useState("");
  const deck = data.decks.find((d) => d.id === deckId) ?? null;
  const deckTitles = useMemo(() => new Map(data.decks.map((d) => [d.id, d.title])), [data.decks]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams();
    if (deckId) q.set("deck", deckId);
    if (filter !== "all") q.set("status", filter);
    if (debounced) q.set("q", debounced);
    api<{ cards: CardRow[] }>(`/api/cards?${q}`)
      .then((r) => !cancelled && (setCards(r.cards), setError(null)))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [deckId, filter, debounced]);

  if (!data.decks.length) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <h1 className="font-serif text-2xl font-medium text-ink">No cards yet</h1>
        <p className="mt-2 text-sm text-ink-2">{isDemo ? "Load a sample deck from Today." : "Add some notes and their cards show up here."}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
      <aside className="space-y-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Cards</h1>
        <nav aria-label="Decks">
          <Kicker className="mb-2">Decks</Kicker>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => setDeckId("")}
                aria-current={deckId === "" ? "true" : undefined}
                className={cx("flex w-full items-center justify-between rounded-[4px] px-2 py-1.5 text-left text-sm", deckId === "" ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:text-ink")}
              >
                All decks <span className="text-xs tabular-nums text-ink-3">{data.totals.cards}</span>
              </button>
            </li>
            {data.decks.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => setDeckId(d.id)}
                  aria-current={deckId === d.id ? "true" : undefined}
                  className={cx("flex w-full items-start justify-between gap-3 rounded-[4px] px-2 py-1.5 text-left text-sm", deckId === d.id ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:text-ink")}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{d.title}</span>
                    {d.examDate && <span className="block text-xs font-normal text-ink-3">{d.examLabel || "Exam"} {formatDate(d.examDate)}</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-3">{d.cardCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {deck && (
          <Card className="p-4">
            <DeckPanel
              key={deck.id}
              deck={deck}
              onChanged={actions.refresh}
              onDeleted={async () => {
                setDeckId("");
                await actions.refresh();
              }}
            />
          </Card>
        )}
      </aside>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards"
            aria-label="Search cards"
            className={cx(inputClass, "max-w-xs")}
          />
          <Segmented<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "due", label: "Due" },
              { value: "suspended", label: "Suspended" },
            ]}
          />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        {!cards ? (
          <p className="py-10 text-sm text-ink-3">Finding cards…</p>
        ) : cards.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {cards.map((c) => (
              <CardRowItem
                key={c.id}
                card={c}
                deckTitle={deckId ? undefined : deckTitles.get(c.deckId)}
                onChange={(next) => setCards((list) => list?.map((x) => (x.id === next.id ? next : x)) ?? null)}
                onDelete={(id) => {
                  setCards((list) => list?.filter((x) => x.id !== id) ?? null);
                  void actions.refresh();
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="py-10 text-sm text-ink-3">{debounced ? `Nothing matches “${debounced}”.` : filter === "suspended" ? "No suspended cards." : filter === "due" ? "Nothing due." : "No cards here."}</p>
        )}
        <p className="mt-3 text-xs text-ink-3">The percentage is how much of each card you&apos;d likely remember right now.</p>
      </section>
    </div>
  );
}
