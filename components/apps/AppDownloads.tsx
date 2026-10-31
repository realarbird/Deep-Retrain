"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Download, ExternalLink, Laptop, Monitor, Smartphone, X, type LucideIcon } from "lucide-react";
import { RedPen } from "@/components/notebook/RedPen";
import { buttonClass, cx, Kicker, TextLink } from "@/components/ui/primitives";
import {
  formatReleaseDate,
  formatSize,
  PLAY_STORE_URL,
  releaseNoteBlocks,
  RELEASES_URL,
  TESTERS_GROUP,
  TESTERS_GROUP_URL,
  type MacRelease,
} from "@/lib/appDownloads";

const badgeButton = "rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Download buttons for the native apps. `mac` is the latest Mac build on GitHub Releases;
 * without it (GitHub didn't answer) the Mac button opens the releases page instead.
 */
export function AppDownloads({ mac }: { mac: MacRelease | null }) {
  const [open, setOpen] = useState<"android" | "mac" | null>(null);
  const [macStarted, setMacStarted] = useState(false);
  const [windowsAsked, setWindowsAsked] = useState(false);

  function showMacNotes(started: boolean) {
    setMacStarted(started);
    setOpen("mac");
  }

  return (
    <div className="@container">
      <div className="grid gap-3 @xl:grid-cols-3">
        <Platform icon={Smartphone} name="Android" detail="Phones and tablets. In testing on Google Play, so there's one extra step.">
          <button type="button" aria-haspopup="dialog" onClick={() => setOpen("android")} className={badgeButton}>
            <Image src="/badges/google-play.png" alt="Get it on Google Play" width={564} height={168} unoptimized className="h-11 w-auto" />
          </button>
        </Platform>

        <Platform
          icon={Laptop}
          name="Mac"
          detail={mac ? `Version ${mac.version}${mac.publishedAt ? `, released ${formatReleaseDate(mac.publishedAt)}` : ""}.` : "The latest version, from GitHub."}
        >
          {mac ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <a href={mac.downloadUrl} onClick={() => showMacNotes(true)} className={buttonClass("primary", "h-11 px-4")}>
                <Download className="size-4" aria-hidden />
                Download for Mac
              </a>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => showMacNotes(false)}
                className="text-sm text-accent-text underline decoration-accent-text/30 underline-offset-2 hover:decoration-accent-text"
              >
                Release notes
              </button>
            </div>
          ) : (
            <a href={`${RELEASES_URL}/latest`} target="_blank" rel="noreferrer" className={buttonClass("primary", "h-11 px-4")}>
              <Download className="size-4" aria-hidden />
              Download for Mac
            </a>
          )}
        </Platform>

        <Platform icon={Monitor} name="Windows" detail="Windows PCs, through the Microsoft Store.">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              aria-disabled="true"
              title="Coming soon"
              onClick={() => setWindowsAsked(true)}
              // The outline keeps the faded badge visible on a dark page.
              className={cx(badgeButton, "cursor-not-allowed ring-1 ring-line-strong")}
            >
              <Image
                src="/badges/microsoft-store.svg"
                alt="Download from the Microsoft Store (coming soon)"
                width={161}
                height={44}
                unoptimized
                className="h-11 w-auto opacity-50 grayscale"
              />
            </button>
            <span role="status">{windowsAsked && <RedPen className="text-[1.25rem]">Coming soon</RedPen>}</span>
          </div>
        </Platform>
      </div>

      <Dialog open={open === "android"} onClose={() => setOpen(null)} title="DeepRetain for Android">
        <p className="text-sm leading-relaxed text-ink-2">
          The Android app is in testing on Google Play. Google only shows it to people on the testers list, so join that first.
        </p>
        <ol className="mt-5 space-y-5">
          <Step n={1} title="Join the testers group">
            <p>
              Join <span className="font-mono text-[13px] text-ink">{TESTERS_GROUP}</span> with the same Google account you use on Google
              Play.
            </p>
            <a href={TESTERS_GROUP_URL} target="_blank" rel="noreferrer" className={buttonClass("secondary", "mt-3")}>
              Join the group
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Step>
          <Step n={2} title="Then get it from Google Play">
            <p>Once you&apos;ve joined, install DeepRetain from Google Play. If it says the app isn&apos;t available, wait a few minutes and try again.</p>
            <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className={cx(badgeButton, "mt-3 inline-block")}>
              <Image src="/badges/google-play.png" alt="Get it on Google Play" width={564} height={168} unoptimized className="h-12 w-auto" />
            </a>
          </Step>
        </ol>
        <p className="mt-6 text-xs text-ink-3">Google Play and the Google Play logo are trademarks of Google LLC.</p>
      </Dialog>

      {mac && (
        <Dialog
          open={open === "mac"}
          onClose={() => setOpen(null)}
          title={mac.name}
          subtitle={`Version ${mac.version}${mac.publishedAt ? ` · ${formatReleaseDate(mac.publishedAt)}` : ""}`}
        >
          {macStarted && (
            <p role="status" className="mb-5 border-l-2 border-accent py-1 pl-3 text-sm text-ink-2">
              Your download should start on its own. If it doesn&apos;t,{" "}
              <TextLink href={mac.downloadUrl}>download {mac.fileName}</TextLink>.
            </p>
          )}
          <Kicker className="mb-2">Release notes</Kicker>
          <ReleaseNotes markdown={mac.notes} />
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            {!macStarted && (
              <span className="flex items-center gap-3">
                <a href={mac.downloadUrl} onClick={() => setMacStarted(true)} className={buttonClass("primary", "px-4")}>
                  <Download className="size-4" aria-hidden />
                  Download for Mac
                </a>
                <span className="text-xs text-ink-3">
                  {mac.fileName}, {formatSize(mac.size)}
                </span>
              </span>
            )}
            <TextLink href={RELEASES_URL} className="text-sm">
              All versions on GitHub
            </TextLink>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Platform({ icon: Icon, name, detail, children }: { icon: LucideIcon; name: string; detail: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-[6px] border border-line bg-surface p-4 shadow-paper sm:p-5">
      <div>
        <h3 className="flex items-center gap-2 font-serif text-lg font-medium text-ink">
          <Icon className="size-4 text-ink-3" aria-hidden />
          {name}
        </h3>
        <p className="mt-1 text-sm leading-snug text-ink-2">{detail}</p>
      </div>
      <div className="mt-auto">{children}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-serif text-sm text-ink-2" aria-hidden>
        {n}
      </span>
      <div className="min-w-0 text-sm leading-relaxed text-ink-2">
        <h3 className="font-medium text-ink">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function ReleaseNotes({ markdown }: { markdown: string }) {
  const blocks = releaseNoteBlocks(markdown);
  if (!blocks.length) return <p className="text-sm text-ink-3">No notes for this release.</p>;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-2">
      {blocks.map((block, i) =>
        block.kind === "heading" ? (
          <h3 key={i} className="pt-1 font-medium text-ink">
            {block.text}
          </h3>
        ) : block.kind === "list" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-ink-3">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}

/** A modal on the native <dialog>, so focus, Escape and the backdrop behave like the platform's. */
function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the dialog element itself, not its content, is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-[6px] border border-line bg-surface text-ink shadow-paper backdrop:bg-black/45"
    >
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-serif text-xl font-medium leading-snug text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1 rounded-[4px] p-1.5 text-ink-3 hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
