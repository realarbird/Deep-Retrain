"use client";

import { useState } from "react";
import { Button, ErrorNote, Kicker } from "@/components/ui/primitives";
import { api } from "@/lib/client";

const CONFIRM_WORD = "DELETE";

/** Delete the account and everything in it, behind a typed confirmation. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginLeft, setLoginLeft] = useState(false);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const r = await api<{ loginDeleted: boolean }>("/api/account", { method: "DELETE" });
      if (r.loginDeleted) {
        // A full navigation: /auth/logout is handled by the Auth0 middleware, not a Next page.
        window.location.replace("/auth/logout");
        return;
      }
      setLoginLeft(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  if (loginLeft) {
    return (
      <section>
        <Kicker className="mb-2">Delete your account</Kicker>
        <p className="text-sm text-ink-2">
          Your decks, cards, answers and settings are deleted. Your sign-in couldn&apos;t be removed automatically, so email{" "}
          <a className="text-accent-text underline underline-offset-2" href="mailto:realarbird@gmail.com">
            realarbird@gmail.com
          </a>{" "}
          and we&apos;ll remove it.
        </p>
        <a href="/auth/logout" className="mt-3 inline-block text-sm text-accent-text underline underline-offset-2">
          Log out
        </a>
      </section>
    );
  }

  return (
    <section>
      <Kicker className="mb-2">Delete your account</Kicker>
      <p className="text-sm text-ink-2">
        Deletes your sign-in and everything in it: decks, cards, every answer, settings and your AI key. This can&apos;t be undone.
      </p>
      {open ? (
        <div className="mt-3 space-y-3 rounded-[4px] border border-critical/40 p-3">
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink">
              Type <span className="font-mono font-medium">{CONFIRM_WORD}</span> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full max-w-xs rounded-[4px] border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink focus:border-critical focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="danger" className="text-xs" onClick={remove} loading={deleting} disabled={typed.trim() !== CONFIRM_WORD}>
              Delete my account
            </Button>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      ) : (
        <Button variant="danger" className="mt-3 text-xs" onClick={() => setOpen(true)}>
          Delete account…
        </Button>
      )}
    </section>
  );
}
