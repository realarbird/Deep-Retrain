/** The DeepRetain mark: a forgetting curve that each review lifts back up. */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
        <path
          d="M2 4 Q4 9 6 9.5 L6 4 Q8.5 11 11 11.5 L11 4 Q14 12 18 13"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M2 17 H18" stroke="var(--color-line-strong)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-ink">DeepRetain</span>
    </span>
  );
}
