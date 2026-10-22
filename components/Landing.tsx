"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RetentionCurveChart } from "@/components/charts/RetentionCurveChart";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/client";
import { Button, buttonClass, Card, ErrorNote, TextLink } from "@/components/ui/primitives";

const STEPS = [
  {
    title: "Add your notes",
    body: "Paste them or import a Markdown, text, PDF or Word file. The AI splits them into single ideas, each with a question and the points a good answer should cover.",
  },
  {
    title: "Answer one question at a time",
    body: "Your answer is graded on meaning, not wording, and the app notes how long you took. Quick and correct moves the card to a longer interval.",
  },
  {
    title: "Get help where you hesitate",
    body: "A correct but slow answer gets a follow-up question. A wrong one gets a short analogy and goes back to tomorrow's pile.",
  },
  {
    title: "Stop after 15",
    body: "There's a daily limit, so you can't cram. Each card comes back after 1, 3, 7, 14 and then 30 days.",
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
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Wordmark />
          {auth0Enabled && (
            <a href="/auth/login" className="text-sm font-medium text-ink-2 hover:text-ink">
              Sign in
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <section className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              Study a few minutes a day. Still know it next month.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-ink-2">
              DeepRetain turns your notes into short questions and brings each one back just before you&apos;d forget it.
              How quickly you answer counts as much as whether you&apos;re right, so ideas you only half-remember come back
              sooner.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {auth0Enabled && (
                <>
                  <a href="/auth/login" className={buttonClass("primary", "px-4")}>
                    Sign in
                  </a>
                  <a href="/auth/login?screen_hint=signup" className={buttonClass("secondary", "px-4")}>
                    Create an account
                  </a>
                </>
              )}
              {demoEnabled && (
                <Button variant={auth0Enabled ? "ghost" : "primary"} onClick={enterDemo} loading={loading}>
                  Try the demo
                </Button>
              )}
            </div>
            {!auth0Enabled && <p className="mt-3 text-sm text-ink-3">Sign-in isn&apos;t set up on this deployment yet.</p>}
            {error && (
              <div className="mt-4">
                <ErrorNote>{error}</ErrorNote>
              </div>
            )}

            <dl className="mt-8 space-y-3 border-t border-line pt-6 text-sm">
              <div>
                <dt className="font-medium text-ink">Signed in</dt>
                <dd className="mt-0.5 text-ink-2">
                  Add your own notes, by pasting or importing a file. Grading uses Gemini Flash-Lite with your own free key
                  from <TextLink href="https://aistudio.google.com/api-keys">Google AI Studio</TextLink>. The key is
                  encrypted before it&apos;s sent to Auth0.
                </dd>
              </div>
              {demoEnabled && (
                <div>
                  <dt className="font-medium text-ink">Demo</dt>
                  <dd className="mt-0.5 text-ink-2">
                    No account needed. You get two sample decks, AP Biology and Computer Science, graded by a simple offline
                    grader.
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <Card className="p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold text-ink">Cramming vs DeepRetain</h2>
            <p className="mb-4 mt-1 text-sm text-ink-2">
              How much of one concept you&apos;d recall over six weeks. One student crams the night before the exam on day
              28. The other learns it on day 0 and reviews it four times.
            </p>
            <RetentionCurveChart />
          </Card>
        </section>

        <section className="border-t border-line py-12">
          <h2 className="text-xl font-semibold text-ink">How it works</h2>
          <ol className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {STEPS.map(({ title, body }, i) => (
              <li key={title} className="grid grid-cols-[2rem_1fr]">
                <span className="font-mono text-sm text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-medium text-ink">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-5xl px-4 py-6 text-xs text-ink-3 sm:px-6">
          DeepRetain is open source under the MIT license. Built with Next.js, MongoDB Atlas, Auth0 and Google AI Studio.
        </p>
      </footer>
    </div>
  );
}
