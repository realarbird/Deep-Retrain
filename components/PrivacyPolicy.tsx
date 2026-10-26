"use client";

import { useEffect, useRef } from "react";

export const PRIVACY_POLICY_URL = "/privacy.html";

/**
 * The privacy policy, embedded from public/privacy.html. It's generated
 * markup with its own styles, so an iframe keeps it from leaking into the
 * app. The frame grows to fit, in-page links scroll this page, and other
 * links leave the frame.
 */
export function PrivacyPolicy() {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    let observer: ResizeObserver | null = null;

    function wire() {
      const doc = iframe?.contentDocument;
      if (!iframe || !doc?.body) return;
      const fit = () => (iframe.style.height = `${doc.documentElement.scrollHeight}px`);
      fit();
      observer?.disconnect();
      observer = new ResizeObserver(fit);
      observer.observe(doc.body);

      for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        if (!a.getAttribute("href")!.startsWith("#") && !a.target) a.target = "_top";
      }
      doc.addEventListener("click", (e) => {
        const link = (e.target as Element | null)?.closest?.("a[href^='#']");
        const target = link && doc.getElementById(link.getAttribute("href")!.slice(1));
        if (!target) return;
        e.preventDefault();
        window.scrollTo({ top: iframe.getBoundingClientRect().top + window.scrollY + target.getBoundingClientRect().top - 16 });
      });
    }

    if (iframe.contentDocument?.readyState === "complete" && iframe.contentDocument.body?.childElementCount) wire();
    iframe.addEventListener("load", wire);
    return () => {
      iframe.removeEventListener("load", wire);
      observer?.disconnect();
    };
  }, []);

  return (
    <section aria-labelledby="privacy-policy" className="mt-6 border-t border-line pt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="privacy-policy" className="font-serif text-2xl font-medium text-ink">
          Privacy policy
        </h2>
        <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener" className="text-xs text-accent-text underline underline-offset-2">
          Open in a new tab
        </a>
      </div>
      <iframe
        ref={frame}
        src={PRIVACY_POLICY_URL}
        title="Privacy policy"
        className="block h-[70vh] w-full overflow-hidden rounded-[6px] border border-line bg-white"
      />
    </section>
  );
}
