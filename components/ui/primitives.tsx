import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // A pressed-in bottom edge, like a key, rather than a glossy pill.
  primary: "bg-ink text-on-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.28)] hover:bg-ink/88 active:translate-y-px active:shadow-none",
  secondary: "bg-paper text-ink border border-line-strong shadow-[inset_0_-1px_0_var(--color-line)] hover:bg-sunken active:translate-y-px",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "text-critical-text hover:bg-critical/10",
};

export const buttonClass = (variant: ButtonVariant = "primary", className?: string) =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-[4px] px-3.5 py-2 text-sm font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
    BUTTON_VARIANTS[variant],
    className,
  );

export function Button({
  variant = "primary",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button {...props} disabled={disabled || loading} className={buttonClass(variant, className)}>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Card stock: the plain surface charts and panels sit on. */
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cx("rounded-[6px] border border-line bg-surface shadow-paper", className)}>
      {children}
    </div>
  );
}

type TagTone = "neutral" | "accent" | "good" | "warning" | "critical";

const TAG_DOTS: Record<TagTone, string | null> = {
  neutral: null,
  accent: "bg-accent",
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
};

/** A small label. Tone shows as a dot beside the text, so the text itself stays readable. */
export function Tag({
  tone = "neutral",
  className,
  children,
  title,
}: {
  tone?: TagTone;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  const dot = TAG_DOTS[tone];
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1.5 rounded-[3px] border border-line px-1.5 py-px text-xs text-ink-2", className)}
    >
      {dot && <span className={cx("size-1.5 rounded-full", dot)} aria-hidden />}
      {children}
    </span>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-serif text-lg font-medium leading-snug text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** A small, spaced-out label above a heading or a group of rows. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3", className)}>{children}</p>;
}

export function ProgressBar({ value, max, tone = "accent", label }: { value: number; max: number; tone?: "accent" | "warning"; label: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1 w-full overflow-hidden rounded-full bg-line"
    >
      <div className={cx("h-full rounded-full transition-[width] duration-500", tone === "warning" ? "bg-warning" : "bg-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="border-l-2 border-critical py-1 pl-3 text-sm text-critical-text">
      {children}
    </p>
  );
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const external = /^https?:/.test(href);
  return (
    <a
      href={href}
      className={cx("text-accent-text underline decoration-accent-text/30 underline-offset-2 hover:decoration-accent-text", className)}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-line-strong bg-paper px-1 py-px font-mono text-[11px] text-ink-2 shadow-[inset_0_-1px_0_var(--color-line)]">
      {children}
    </kbd>
  );
}

/** A row of mutually exclusive choices, like tabs on a ring binder. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex rounded-[5px] border border-line-strong bg-paper p-0.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-[3px] px-2.5 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            o.value === value ? "bg-ink text-on-ink" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const inputClass =
  "w-full rounded-[4px] border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

/** An on/off switch with its label. */
export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-ink-3">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-accent",
          checked ? "border-ink bg-ink" : "border-line-strong bg-sunken",
        )}
      >
        <span className={cx("inline-block size-3.5 rounded-full bg-paper shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-[2px]")} />
      </button>
    </label>
  );
}
