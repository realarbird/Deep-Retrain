"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Brain, Hourglass, LogIn, MessageCircleQuestion, Moon, Sprout } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, ErrorNote } from "@/components/ui/primitives";

const STEPS = [
  {
    icon: Brain,
    title: "Paste dense notes",
    body: "Gemma breaks lecture notes into atomic concepts with key points to recall.",
  },
  {
    icon: Hourglass,
    title: "Answer, against the clock",
    body: "A quiet stopwatch measures how fluently you recall. Fast and right climbs a Leitner box.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Hesitate? Gemma asks why",
    body: "Slow but correct gets a Socratic follow-up. Wrong gets a two-sentence analogy and a reset.",
  },
  {
    icon: Moon,
    title: "Stop at 15",
    body: "A daily cognitive cap blocks cramming. Spacing does the work while you sleep.",
  },
];

export function Landing({ auth0Enabled, demoEnabled }: { auth0Enabled: boolean; demoEnabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enterDemo() {
    setLoading(true);
    setError(null);
    try {
      await api("/api/demo", { method: "POST" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-16 sm:px-6">
      <div className="animate-rise">
        <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/30">
          <Sprout className="size-3.5" aria-hidden /> Slow and steady beats cramming
        </p>
        <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          DeepRetain
          <span className="block text-2xl font-normal text-slate-400 sm:text-3xl">The forgetting-curve knowledge engine</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
          Study less, remember more. DeepRetain turns your notes into a few micro-reviews a day, then uses your
          <em className="text-slate-100"> response time</em> as well as your accuracy to decide when you&apos;ll see each idea again.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {demoEnabled && (
            <Button onClick={enterDemo} loading={loading} icon={<ArrowRight className="size-4" aria-hidden />} className="px-5 py-2.5 text-base">
              Try Demo Mode (no account)
            </Button>
          )}
          {auth0Enabled ? (
            <>
              <a
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-base font-medium text-slate-100 ring-1 ring-slate-700 transition-colors hover:bg-slate-700"
              >
                <LogIn className="size-4" aria-hidden /> Sign in with Auth0
              </a>
              <a href="/auth/login?screen_hint=signup" className="text-sm text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline">
                Create an account
              </a>
            </>
          ) : (
            <p className="text-sm text-slate-500">Auth0 sign-in isn&apos;t configured on this deployment.</p>
          )}
        </div>
        {error && (
          <div className="mt-4 max-w-md">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <Card key={title} className="animate-rise p-5" style={{ animationDelay: `${120 + i * 70}ms` }}>
            <Icon className="size-5 text-indigo-300" aria-hidden />
            <h2 className="mt-3 font-display text-base font-semibold text-slate-100">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
          </Card>
        ))}
      </div>

      <p className="mt-10 text-xs text-slate-500">
        Powered by Gemma (open-weight) via Ollama · MongoDB Atlas Vector Search · Auth0 · Render
      </p>
    </main>
  );
}
