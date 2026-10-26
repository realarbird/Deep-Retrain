"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RetentionCurveChart } from "@/components/charts/RetentionCurveChart";
import { IndexCard } from "@/components/notebook/IndexCard";
import { CircledScore, PenTick, Squiggle, Tortoise } from "@/components/notebook/Doodles";
import { RedPen } from "@/components/notebook/RedPen";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/client";
import { Button, buttonClass, Card, ErrorNote, Kicker, TextLink } from "@/components/ui/primitives";

const WAYS = [
  {
    when: "Tired? Tap.",
    modes: [
      ["Multiple choice", "pick one of four"],
      ["True or false", "one statement, two buttons"],
      ["Flip", "think of it, flip the card, say how it went"],
    ],
  },
  {
    when: "A word or a sentence",
    modes: [
      ["Fill the gap", "type the one missing word"],
      ["Write", "answer in your own words"],
      ["Say it", "answer out loud"],
    ],
  },
  {
    when: "Make it stick",
    modes: [["Teach it back", "explain it to someone who's never heard of it"]],
  },
  {
    when: "Hands-free",
    modes: [["Listen", "it reads the question, waits, then reads the answer"]],
  },
] as const;

const FAQ = [
  {
    q: "Why can't I do more than fifteen a day?",
    a: "Because the sixteenth review in one sitting is worth much less than the first review tomorrow. Spacing is the whole trick. You can lower the limit any time, or raise it to 25, but a raise only starts the next day.",
  },
  {
    q: "What does the AI actually do?",
    a: "Gemma 4, an open-weight model from Google (Apache 2.0), turns your notes into cards, writes the multiple-choice, fill-the-gap and true-or-false versions, marks written and spoken answers on meaning rather than wording, and explains a missed card another way when you ask. The quick modes are checked against an answer key, and Flip and Listen go by your own rating. Only answers Gemma has marked can move a card into the last box.",
  },
  {
    q: "Do I have to pay for anything?",
    a: "No. Gemma runs on Google AI Studio with your own free key, or on your own machine through Ollama. With neither, a simple offline grader keeps things going.",
  },
  {
    q: "Can I use it on my phone and my laptop?",
    a: "Yes. Your settings, the devices you use and a progress summary are kept in your Auth0 account, and your cards and history are stored under that same account. Sign in on any device and carry on. It can be installed to your home screen too.",
  },
  {
    q: "What happens to my notes?",
    a: "The text is pulled out of the file, you check it, and it becomes cards in your account. The file itself isn't kept. On Google's free tier, prompts may be used to improve their products, so keep private things out of your notes.",
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
        <section className="grid gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <Kicker>A study notebook that does the remembering</Kicker>
            <h1 className="mt-3 text-balance font-serif text-[2rem] font-medium leading-[1.12] text-ink min-[380px]:text-[2.4rem] sm:text-5xl">
              Study a few minutes a day.{" "}
              <span className="relative inline-block whitespace-nowrap">
                Still know it in June.
                <Squiggle className="absolute -bottom-2 left-0 h-3 w-full" />
              </span>
            </h1>
            <p className="mt-6 text-[17px] leading-relaxed text-ink-2">
              DeepRetain turns your notes into short questions and brings each one back just before you&apos;d forget it. Answer
              quickly and correctly and a card waits longer. Hesitate or miss, and it comes back sooner. There&apos;s a daily
              limit, so you can&apos;t cram even if you try.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {auth0Enabled && (
                <>
                  <a href="/auth/login" className={buttonClass("primary", "px-5")}>
                    Sign in
                  </a>
                  <a href="/auth/login?screen_hint=signup" className={buttonClass("secondary", "px-4")}>
                    Make an account
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
            {demoEnabled && <p className="mt-3 text-sm text-ink-3">The demo needs no account: two sample decks, three weeks of made-up history, an exam coming up.</p>}
            {error && (
              <div className="mt-4">
                <ErrorNote>{error}</ErrorNote>
              </div>
            )}
          </div>

          <div className="relative lg:pt-6">
            <IndexCard
              className="rotate-[0.6deg]"
              header={
                <>
                  <span>AP Biology</span>
                  <span>Box 2 · Application</span>
                </>
              }
            >
              <Kicker>Glycolysis</Kicker>
              <p className="font-serif text-xl leading-7 text-ink">Sprinting muscles run short of oxygen but still make some ATP. Which pathway keeps going, and why?</p>
              <p className="pen mt-7 text-[1.45rem] leading-7 text-ink-2" style={{ color: "var(--color-ink-2)" }}>
                Glycolysis, in the cytoplasm. It doesn&apos;t need oxygen, as long as NAD+ is recycled.
              </p>
            </IndexCard>
            <div className="mt-3 flex items-center justify-end gap-3 pr-2">
              <PenTick className="h-7 w-8" />
              <CircledScore value="94" />
              <RedPen rotate={-3}>6.2s, up to box 3</RedPen>
            </div>
            <span className="sr-only">Example: a correct answer in 6.2 seconds scores 94 and moves the card up to box 3.</span>
          </div>
        </section>

        <section className="border-t border-line py-14">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <h2 className="font-serif text-3xl font-medium text-ink">The hare crams. The tortoise reviews.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
                Two students learn the same idea. One crams the night before a class exam on day 28, then crams again the night before
                the AP Exam on day 41. The other learns it on day 0 and reviews it four times, each a little later than the last.
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
                By AP Exam morning the crammer remembers about a sixth of it. The tortoise still has most of it, after less total time.
              </p>
              <div className="mt-6 flex items-end gap-3">
                <Tortoise className="h-14 w-24" />
                <RedPen className="mb-2">slow and steady</RedPen>
              </div>
            </div>
            <Card className="p-5 sm:p-6">
              <RetentionCurveChart />
            </Card>
          </div>
        </section>

        <section className="border-t border-line py-14">
          <h2 className="font-serif text-3xl font-medium text-ink">Nine ways to study, depending on the day</h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
            Every one of them counts toward the same daily limit and moves cards the same way. Auto picks for you: quick taps while a card
            is new, typing once you know it.
          </p>
          <div className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {WAYS.map((group) => (
              <div key={group.when}>
                <Kicker className="mb-2">{group.when}</Kicker>
                <ul className="space-y-2">
                  {group.modes.map(([name, what]) => (
                    <li key={name} className="flex items-baseline gap-2 text-[15px]">
                      <span className="font-medium text-ink">{name}</span>
                      <span className="leader" aria-hidden />
                      <span className="text-right text-ink-2">{what}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-14">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="font-serif text-3xl font-medium text-ink">One account, every device</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
                Start a session on the bus, finish it at your desk. Your settings, the devices you study on and a summary of your
                progress live in your Auth0 account. Your cards and every answer are stored under that same account in MongoDB Atlas.
                Your AI key is encrypted before it ever reaches Auth0.
              </p>
            </div>
            <div className="space-y-4 text-[15px] leading-relaxed text-ink-2">
              <h2 className="font-serif text-3xl font-medium text-ink">Numbers worth looking at</h2>
              <p>
                A calendar of study days, how often you&apos;re right and how fast, what&apos;s coming up against your limit, how much
                you&apos;d remember right now, which cards keep slipping, and how many reviews the schedule saved you.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-line py-14">
          <h2 className="font-serif text-3xl font-medium text-ink">Questions people ask</h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer list-none text-[16px] font-medium text-ink marker:hidden">
                  <span className="mr-2 inline-block text-ink-3 transition-transform group-open:rotate-90">›</span>
                  {f.q}
                </summary>
                <p className="mt-2 max-w-3xl pl-5 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl space-y-1 px-4 py-6 text-xs text-ink-3 sm:px-6">
          <p>
            DeepRetain is open source under the MIT license. Built for the Hacktoberfest 2026 Open-Source AI Challenge, week three:
            Slow and Steady.
          </p>
          <p>
            Answers are marked by <TextLink href="https://ai.google.dev/gemma">Gemma 4</TextLink>, an open model. Sign-in by Auth0,
            data on MongoDB Atlas, hosted on Render.
          </p>
          <p>
            <TextLink href="/privacy.html">Privacy policy</TextLink>
          </p>
        </div>
      </footer>
    </div>
  );
}
