import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-on-ink hover:bg-ink/85",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "text-critical-text hover:bg-critical/10",
};

export const buttonClass = (variant: ButtonVariant = "primary", className?: string) =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
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

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cx("rounded-lg border border-line bg-surface", className)}>
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
      className={cx("inline-flex items-center gap-1.5 rounded border border-line px-1.5 py-px text-xs text-ink-2", className)}
    >
      {dot && <span className={cx("size-1.5 rounded-full", dot)} aria-hidden />}
      {children}
    </span>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
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

export const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60";
