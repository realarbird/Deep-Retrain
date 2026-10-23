import { cx } from "@/components/ui/primitives";

const LEVELS = [
  { value: 1, label: "Guessing" },
  { value: 2, label: "Unsure" },
  { value: 3, label: "Sure" },
] as const;

/** Optional: how sure you are, before you see the result. Feeds the calibration chart on the Stats tab. */
export function ConfidencePicker({ value, onChange }: { value: 1 | 2 | 3 | null; onChange: (v: 1 | 2 | 3 | null) => void }) {
  return (
    <div className="flex items-center gap-1.5 text-xs" role="radiogroup" aria-label="How sure are you?">
      <span className="mr-1 text-ink-3">How sure?</span>
      {LEVELS.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={value === l.value}
          onClick={() => onChange(value === l.value ? null : l.value)}
          className={cx(
            "rounded-full border px-2 py-0.5 transition-colors",
            value === l.value ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink-2 hover:text-ink",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
