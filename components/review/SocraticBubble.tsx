"use client";

import { useState } from "react";
import { MessageCircleQuestion, Send, Sparkles } from "lucide-react";
import { Button, ErrorNote } from "@/components/ui/primitives";
import { api, ENGINE_SHORT, type EngineId } from "@/lib/client";

function GemmaBubble({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 ring-1 ring-indigo-400/30" aria-hidden>
        <Sparkles className="size-4 text-indigo-300" />
      </span>
      <div className="max-w-prose rounded-2xl rounded-tl-sm bg-indigo-500/10 px-4 py-3 text-sm leading-relaxed text-indigo-50 ring-1 ring-indigo-400/20">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-indigo-300">{label}</p>
        {children}
      </div>
    </div>
  );
}

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
    <section aria-label="Socratic follow-up" className="space-y-3">
      <GemmaBubble label="Socratic follow-up">
        <span className="inline-flex items-start gap-2">
          <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-indigo-300" aria-hidden />
          {question}
        </span>
      </GemmaBubble>

      {sent ? (
        <div className="flex justify-end">
          <p className="max-w-prose rounded-2xl rounded-tr-sm bg-slate-800 px-4 py-3 text-sm text-slate-100">{sent}</p>
        </div>
      ) : (
        <div className="ml-11 space-y-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            rows={2}
            placeholder="Reason it through in a sentence or two… (⌘/Ctrl + Enter)"
            aria-label="Your answer to the follow-up question"
            className="w-full resize-y rounded-xl bg-slate-950 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-800 placeholder:text-slate-600 focus:outline-none focus:ring-indigo-400"
          />
          <Button variant="secondary" onClick={send} loading={loading} disabled={!answer.trim()} icon={<Send className="size-3.5" aria-hidden />}>
            Reply to Gemma
          </Button>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      )}

      {reply && <GemmaBubble label={ENGINE_SHORT[reply.engine]}>{reply.text}</GemmaBubble>}
    </section>
  );
}
