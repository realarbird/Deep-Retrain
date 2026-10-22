"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button, Card, ErrorNote, inputClass, SectionTitle, TextLink } from "@/components/ui/primitives";
import { api, GOOGLE_KEY_URL, type AiKeyStatus } from "@/lib/client";

export function AiKeySettings({ onChange }: { onChange: () => Promise<void> }) {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<AiKeyStatus>("/api/ai-key")
      .then((s) => !cancelled && setStatus(s))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const s = await api<AiKeyStatus>("/api/ai-key", { method: "PUT", json: { apiKey: draft } });
      setStatus(s);
      setDraft("");
      setNotice(s.verified ? "Key saved. Google accepted it." : "Key saved. Google couldn't be reached to check it, so it will be tested on your next review.");
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("Remove your AI key? Grading will fall back to the offline grader.")) return;
    setBusy("remove");
    setError(null);
    setNotice(null);
    try {
      setStatus(await api<AiKeyStatus>("/api/ai-key", { method: "DELETE" }));
      setNotice("Key removed from your account.");
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="p-5 sm:p-6">
        <SectionTitle
          title="AI key"
          subtitle={
            <>
              Reviews and note extraction run on Google&apos;s {status ? <span className="font-mono text-[13px]">{status.model}</span> : "Gemini Flash-Lite"},
              a fast model that&apos;s free to use with your own API key.
            </>
          }
        />

        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2 marker:text-ink-3">
          <li>
            Go to <TextLink href={GOOGLE_KEY_URL}>aistudio.google.com/api-keys</TextLink> and sign in with a Google account.
          </li>
          <li>
            Choose <span className="font-medium text-ink">Create API key</span>. The free tier doesn&apos;t need billing.
          </li>
          <li>Copy the key and paste it below.</li>
        </ol>

        <div className="mt-6 border-t border-line pt-5">
          {status === null && !error && <p className="text-sm text-ink-3">Checking your account…</p>}
          {status?.saved && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md bg-sunken px-3 py-2.5 text-sm">
              <span className="text-ink">
                Key saved <span className="text-ink-2">({status.hint})</span>
              </span>
              <Button variant="danger" className="px-2 py-1 text-xs" onClick={remove} loading={busy === "remove"}>
                Remove
              </Button>
            </div>
          )}

          {status && (
            <form onSubmit={save} className="space-y-3">
              <label htmlFor="ai-key" className="block text-sm font-medium text-ink">
                {status.saved ? "Replace key" : "API key"}
              </label>
              <input
                id="ai-key"
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste your Google AI Studio key"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} font-mono`}
              />
              <p className="flex items-start gap-1.5 text-xs text-ink-2">
                <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
                This key will be sent encrypted and stored encrypted in your Auth0 account.
              </p>
              <Button type="submit" loading={busy === "save"} disabled={draft.trim().length < 20}>
                Save key
              </Button>
            </form>
          )}

          <div className="mt-4 space-y-2">
            {notice && <p className="text-sm text-good-text" role="status">{notice}</p>}
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
        </div>
      </Card>

      <div className="space-y-6 text-sm leading-relaxed text-ink-2">
        <section>
          <h3 className="font-medium text-ink">How your key is handled</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-ink-3">
            <li>It travels from your browser to DeepRetain over HTTPS.</li>
            <li>
              DeepRetain encrypts it with AES-256-GCM before sending it to Auth0, so it is also encrypted on the way to Auth0
              and while it&apos;s stored there. Auth0 never sees the plain key.
            </li>
            <li>It&apos;s decrypted only on the server, to call Google when you add notes or answer a question.</li>
            <li>It&apos;s never shown again in full and never stored in DeepRetain&apos;s database. You can remove it at any time.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-medium text-ink">Good to know</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-ink-3">
            <li>Free keys have daily limits. If you reach one, grading switches to the offline grader until the limit resets.</li>
            <li>On the free tier, Google may use prompts to improve its products. Keep private information out of your notes.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
