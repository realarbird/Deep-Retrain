/**
 * Hand-drawn marks. Paths are drawn slightly off-true on purpose, so they read
 * as pen strokes rather than icons. All decorative (aria-hidden).
 */
import { cx } from "@/components/ui/primitives";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** The tortoise, for rest days and empty states. Slow and steady. */
export function Tortoise({ className, sleeping = false }: { className?: string; sleeping?: boolean }) {
  return (
    <svg viewBox="0 0 132 78" className={cx("text-ink-2", className)} aria-hidden>
      <g {...stroke} strokeWidth={1.7}>
        <path d="M21 52 C 23 27, 49 15, 66 17 C 82 19, 93 31, 94 49" />
        <path d="M15 52.5 C 38 57, 71 57.5, 99 51" />
        <path d="M33 51 C 34 41, 41 32, 52 30.5 C 63 29.5, 72 36, 75 50" />
        <path d="M50 31 C 51 38, 52 45, 53 54" />
        <path d="M36 42 C 47 41, 62 41, 73 43" />
        <path d="M93 47 C 98 40, 109 39, 114 44 C 117 48, 112 53, 103 53 C 99 53, 96 52, 94 51" />
        <path d="M31 55 C 30 59, 29 62, 27.5 65" />
        <path d="M43 56.5 C 43 60, 43.5 63, 43 66" />
        <path d="M70 56.5 C 71 60, 71.5 63, 72.5 66" />
        <path d="M84 54.5 C 86 58, 87 61, 89 64" />
        <path d="M19 51 C 15 51.5, 12 53, 9 55.5 C 13 55.5, 16 55, 19.5 54" />
        <path d="M4 68 C 34 69.5, 86 67, 128 68.5" strokeWidth={1.2} opacity={0.5} />
      </g>
      {sleeping ? (
        <g {...stroke} strokeWidth={1.4}>
          <path d="M104.5 45.5 C 106 46.5, 107.5 46.5, 109 45.5" />
          <path d="M112 30 L 118 30 L 112 36 L 118 36" />
          <path d="M121 18 L 125 18 L 121 22 L 125 22" />
        </g>
      ) : (
        <circle cx="107" cy="44.5" r="1.4" fill="currentColor" />
      )}
    </svg>
  );
}

/** A loose pen underline for a word or two. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 12" preserveAspectRatio="none" className={cx("text-pen", className)} aria-hidden>
      <path {...stroke} strokeWidth={2.2} d="M2 8 C 30 3, 52 10, 80 6 S 132 3, 158 7 S 190 6, 198 4" />
    </svg>
  );
}

/** A pen arrow, for pointing at something on a chart. */
export function PenArrow({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg viewBox="0 0 60 40" className={cx("text-pen", className)} style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
      <g {...stroke} strokeWidth={1.8}>
        <path d="M4 6 C 18 8, 34 16, 50 32" />
        <path d="M40 31 C 44 31.5, 48 32, 51 33 C 50.5 29, 50 26, 49.5 22" />
      </g>
    </svg>
  );
}

export function PenTick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 22" className={cx("text-pen", className)} aria-hidden>
      <path {...stroke} strokeWidth={2.4} d="M3 12.5 C 5 14, 7 16.5, 9 19.5 C 13 12, 17.5 7, 23.5 2.5" />
    </svg>
  );
}

export function PenCross({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={cx("text-pen", className)} aria-hidden>
      <g {...stroke} strokeWidth={2.4}>
        <path d="M4 3.5 C 9 9, 13 13, 18.5 19" />
        <path d="M18 3 C 13 8.5, 8.5 13.5, 3.5 18.5" />
      </g>
    </svg>
  );
}

/** A number circled in red pen, the way a teacher marks a score. */
export function CircledScore({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cx("relative inline-flex h-12 w-16 items-center justify-center", className)}>
      <svg viewBox="0 0 64 48" className="absolute inset-0 size-full text-pen" aria-hidden>
        <path {...stroke} strokeWidth={2} d="M40 5 C 20 2, 4 12, 5 26 C 6 40, 26 46, 43 42 C 58 38, 62 22, 54 12 C 50 7, 44 5, 34 6" />
      </svg>
      <span className="pen relative text-[1.6rem]">{value}</span>
    </span>
  );
}
