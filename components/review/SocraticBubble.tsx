"use client";

import { useState } from "react";
import { Button, Card, cx, ErrorNote, inputClass } from "@/components/ui/primitives";
import { api, ENGINE_SHORT, type EngineId } from "@/lib/client";

export function SocraticBubble({ reviewLogId, question }: { reviewLogId: string; question: string }) {
  const [answer, setAnswer] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [reply, setReply] = useState<{ text: string; engine: EngineId } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!answer.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ reply: string; engine: EngineId }>("/api/review", {
        method: "POST",
        json: { mode: "followup", reviewLogId, answer },
      });
      setSent(answer);
      setReply({ text: r.reply, engine: r.engine });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6" aria-label="Follow-up question">
      <p className="text-xs text-ink-3">Follow-up question</p>
      <p className="mt-1 font-medium leading-snug text-ink">{question}</p>

      {sent ? (
        <blockquote className="mt-4 border-l-2 border-line-strong pl-4 text-sm text-ink-2">{sent}</blockquote>
      ) : (
        <div className="mt-4 space-y-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            rows={2}
            placeholder="Reason it through in a sentence or two"
            aria-label="Your answer to the follow-up question"
            className={cx(inputClass, "resize-y")}
          />
          <Button variant="secondary" onClick={send} loading={loading} disabled={!answer.trim()}>
            Send
          </Button>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      )}

      {reply && (
        <div className="mt-4 rounded-md bg-sunken px-4 py-3">
          <p className="text-xs text-ink-3">{ENGINE_SHORT[reply.engine]}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{reply.text}</p>
        </div>
      )}
    </Card>
  );
}
