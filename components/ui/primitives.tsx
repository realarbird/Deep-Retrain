import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "success" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-indigo-500 text-white hover:bg-indigo-400 focus-visible:outline-indigo-300",
  secondary: "bg-slate-800 text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700 focus-visible:outline-slate-400",
  ghost: "text-slate-300 hover:bg-slate-800/70 hover:text-white focus-visible:outline-slate-400",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:outline-emerald-300",
  danger: "text-rose-300 hover:bg-rose-500/10 focus-visible:outline-rose-300",
};

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
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cx("rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 backdrop-blur-sm", className)}
    >
      {children}
    </div>
  );
}

type ChipTone = "slate" | "indigo" | "emerald" | "amber" | "rose" | "sky";

const CHIP_TONES: Record<ChipTone, string> = {
  slate: "bg-slate-800 text-slate-300 ring-slate-700",
  indigo: "bg-indigo-500/10 text-indigo-200 ring-indigo-400/30",
  emerald: "bg-emerald-500/10 text-emerald-200 ring-emerald-400/30",
  amber: "bg-amber-500/10 text-amber-200 ring-amber-400/30",
  rose: "bg-rose-500/10 text-rose-200 ring-rose-400/30",
  sky: "bg-sky-500/10 text-sky-200 ring-sky-400/30",
};

export function Chip({
  tone = "slate",
  icon,
  className,
  children,
  title,
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        CHIP_TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, max, tone = "indigo", label }: { value: number; max: number; tone?: "indigo" | "amber" | "emerald" | "rose"; label: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar = { indigo: "bg-indigo-400", amber: "bg-amber-400", emerald: "bg-emerald-500", rose: "bg-rose-400" }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
    >
      <div className={cx("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200 ring-1 ring-rose-400/30">
      {children}
    </p>
  );
}
