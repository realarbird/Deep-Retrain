/** The DeepRetain mark: a forgetting curve that each review lifts back up, drawn like a pen sketch. */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 22 20" className="size-5" aria-hidden>
        <path
          d="M2 4.5 Q4 9.5 6.2 9.8 L6 4.2 Q8.6 11.2 11.2 11.6 L11 4.4 Q14.2 12.4 19.5 13.2"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M2 17.2 C 8 16.6, 14 17.6, 20 17" fill="none" stroke="var(--color-margin)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="font-serif text-[17px] font-semibold tracking-tight text-ink">DeepRetain</span>
    </span>
  );
}
