"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppActions, StudyRequest } from "@/components/AppShell";
import { RestScreen } from "@/components/review/RestScreen";
import { SampleDeckButtons } from "@/components/SampleDeckButtons";
import { useSettings } from "@/components/SettingsProvider";
import { Tortoise } from "@/components/notebook/Doodles";
import { Button, ErrorNote } from "@/components/ui/primitives";
import { api, attemptId, formatRelative, zoneQuery, type CapStatus, type DashboardData, type ReviewResponse, type StudyItem, type StudyResponse } from "@/lib/client";
import type { DefaultMode, SessionSize } from "@/lib/settingsSchema";
import { SessionSetup } from "./SessionSetup";
import { SessionSummary, type GradedEntry } from "./SessionSummary";
import { StudyCard } from "./StudyCard";
import { speechRecognitionSupported } from "./useSpeech";

interface Session {
  id: string;
  items: StudyItem[];
  index: number;
  entries: GradedEntry[];
  skipped: number;
  startedAt: number;
  endedAt: number | null;
  options: { mode: DefaultMode; size: SessionSize; deckId?: string };
  askConfidence: boolean;
}

export function StudyView({
  data,
  actions,
  isDemo,
  request,
  onRequestUsed,
}: {
  data: DashboardData;
  actions: AppActions;
  isDemo: boolean;
  request: StudyRequest | null;
  onRequestUsed: () => void;
}) {
  const { settings, update } = useSettings();
  const [stage, setStage] = useState<"setup" | "loading" | "session" | "summary">("setup");
  const [session, setSession] = useState<Session | null>(null);
  const [cap, setCapState] = useState<CapStatus>(data.cap);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef<StudyRequest | null>(null);

  const start = useCallback(
    async (options: { mode: DefaultMode; size: SessionSize; deckId?: string }) => {
      setStage("loading");
      setError(null);
      setNotice(null);
      // The choice follows you to your other devices.
      if (options.mode !== settings.defaultMode || options.size !== settings.sessionSize) {
        update({ defaultMode: options.mode, sessionSize: options.size });
      }
      try {
        const q = new URLSearchParams({ mode: options.mode, size: String(options.size), speech: speechRecognitionSupported() ? "1" : "0" });
        if (options.deckId) q.set("deck", options.deckId);
        const r = await api<StudyResponse>(`/api/study?${q}&${zoneQuery()}`);
        setCapState(r.cap);
        actions.setCap(r.cap);
        if (!r.items.length) {
          setNotice(r.cap.reached ? null : "Nothing is due in that deck right now.");
          setStage("setup");
          return;
        }
        setSession({
          id: attemptId(),
          items: r.items,
          index: 0,
          entries: [],
          skipped: 0,
          startedAt: Date.now(),
          endedAt: null,
          options,
          askConfidence: r.settings.askConfidence,
        });
        setStage("session");
      } catch (err) {
        setError((err as Error).message);
        setStage("setup");
      }
    },
    [actions, settings.defaultMode, settings.sessionSize, update],
  );

  // Arriving from Today's Start button: go straight in.
  useEffect(() => {
    if (!request || handled.current === request) return;
    handled.current = request;
    const r = request;
    // After this render, not during it.
    window.setTimeout(() => {
      onRequestUsed();
      if (r.now !== false) void start({ mode: r.mode ?? settings.defaultMode, size: r.size ?? settings.sessionSize, deckId: r.deckId });
    }, 0);
  }, [request, onRequestUsed, start, settings.defaultMode, settings.sessionSize]);

  const finish = useCallback(() => {
    setSession((s) => (s ? { ...s, endedAt: Date.now() } : s));
    setStage("summary");
    void actions.refresh();
  }, [actions]);

  const next = useCallback(() => {
    setSession((s) => {
      if (!s) return s;
      if (s.index + 1 >= s.items.length) {
        window.setTimeout(finish, 0);
        return s;
      }
      return { ...s, index: s.index + 1 };
    });
    window.scrollTo({ top: 0 });
  }, [finish]);

  const onGraded = useCallback(
    (response: ReviewResponse, item: StudyItem) => {
      setCapState(response.cap);
      actions.setCap(response.cap);
      setSession((s) => (s ? { ...s, entries: [...s.entries, { item, response }] } : s));
    },
    [actions],
  );

  const onSkip = useCallback(
    (reason: string) => {
      setNotice(reason);
      setSession((s) => (s ? { ...s, skipped: s.skipped + 1 } : s));
      next();
    },
    [next],
  );

  const onCapReached = useCallback(
    (c: CapStatus) => {
      setCapState(c);
      actions.setCap(c);
      finish();
    },
    [actions, finish],
  );

  if (data.totals.cards === 0) {
    return (
      <div className="mx-auto max-w-xl py-6 text-center">
        <Tortoise className="mx-auto h-20 w-36" />
        <h1 className="mt-4 font-serif text-2xl font-medium text-ink">Nothing to study yet</h1>
        {isDemo ? (
          <>
            <p className="mt-2 text-sm text-ink-2">Load a sample deck to start.</p>
            <SampleDeckButtons actions={actions} className="mt-6 flex flex-wrap justify-center gap-2" />
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-2">Add some notes and their cards will show up here.</p>
            <Button className="mt-6" onClick={() => actions.goTo("add")}>
              Add notes
            </Button>
          </>
        )}
      </div>
    );
  }

  if (stage === "summary" && session) {
    return (
      <SessionSummary
        entries={session.entries}
        skipped={session.skipped}
        startedAt={session.startedAt}
        endedAt={session.endedAt ?? session.startedAt}
        cap={cap}
        moreDue={data.totals.dueNow > 0}
        actions={actions}
        onAgain={() => void start(session.options)}
      />
    );
  }

  if (stage !== "session" && cap.reached) return <RestScreen cap={cap} actions={actions} isDemo={isDemo} />;

  if (stage === "loading") return <p className="py-20 text-center text-sm text-ink-3">Shuffling the deck…</p>;

  if (stage === "session" && session) {
    const item = session.items[session.index];
    return (
      <div className="mx-auto max-w-3xl">
        {notice && <p className="mb-4 rounded-[4px] bg-sunken px-3 py-2 text-sm text-ink-2">{notice}</p>}
        <StudyCard
          key={item.id}
          item={item}
          index={session.index}
          total={session.items.length}
          sessionId={session.id}
          askConfidence={session.askConfidence}
          speech={settings.speech}
          onGraded={onGraded}
          onNext={() => {
            setNotice(null);
            next();
          }}
          onSkip={onSkip}
          onCapReached={onCapReached}
          onEnd={finish}
        />
      </div>
    );
  }

  if (data.totals.dueNow === 0) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <Tortoise className="h-20 w-36" />
        <h1 className="mt-4 font-serif text-2xl font-medium text-ink">All caught up</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {data.nextDue
            ? `Your next card, ${data.nextDue.conceptTitle}, is due ${formatRelative(data.nextDue.at)}. The gap is on purpose: recalling something you've half forgotten is what makes it stick.`
            : "Every card is waiting for its next interval."}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => actions.goTo("today")}>
            Back to today
          </Button>
          {!isDemo && (
            <Button variant="ghost" onClick={() => actions.goTo("add")}>
              Add more notes
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mx-auto mb-6 max-w-3xl">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <SessionSetup
        decks={data.decks}
        initialMode={settings.defaultMode}
        initialSize={settings.sessionSize}
        remaining={cap.remaining}
        dueTotal={data.totals.dueNow}
        notice={notice}
        offlineGrader={data.engine.id === "heuristic"}
        onStart={(opts) => void start(opts)}
      />
    </>
  );
}
