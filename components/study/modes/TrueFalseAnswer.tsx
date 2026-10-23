"use client";

import { useEffect } from "react";
import { Button, Kbd } from "@/components/ui/primitives";

/** True or false. Keys T and F work too. */
export function TrueFalseAnswer({ busy, onSubmit }: { busy: boolean; onSubmit: (answer: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "t" || e.key === "T") onSubmit(true);
      if (e.key === "f" || e.key === "F") onSubmit(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onSubmit]);

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" className="min-w-36 justify-between py-3 text-base" disabled={busy} onClick={() => onSubmit(true)}>
        True <Kbd>T</Kbd>
      </Button>
      <Button variant="secondary" className="min-w-36 justify-between py-3 text-base" disabled={busy} onClick={() => onSubmit(false)}>
        False <Kbd>F</Kbd>
      </Button>
    </div>
  );
}
