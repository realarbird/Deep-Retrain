import type { ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

/**
 * A ruled index card. The header sits above the red line; the body is set on
 * the blue rules (28px line height). With `back`, the card flips in 3D, or
 * crossfades when motion is reduced. The hidden face is inert.
 */
export function IndexCard({
  header,
  children,
  back,
  flipped = false,
  className,
  footer,
}: {
  header?: ReactNode;
  children: ReactNode;
  back?: ReactNode;
  flipped?: boolean;
  className?: string;
  footer?: ReactNode;
}) {
  const face = (content: ReactNode, side: "front" | "back", hidden: boolean) => (
    <div
      className={cx(
        "ruled flip-face relative flex min-h-[15rem] flex-col rounded-[6px] border border-line shadow-paper",
        side === "back" ? "flip-back" : "flip-front",
      )}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
    >
      <div className="flex h-[3.25rem] items-center justify-between gap-3 px-5 text-xs text-ink-3 sm:px-7">{header}</div>
      <div className="flex-1 px-5 pb-5 pt-2 text-[17px] leading-7 sm:px-7 sm:text-lg sm:leading-7">{content}</div>
      {footer && side === "front" && <div className="px-5 pb-5 sm:px-7">{footer}</div>}
    </div>
  );

  if (!back) return <div className={className}>{face(children, "front", false)}</div>;
  return (
    <div className={cx("flip-scene", className)}>
      <div className="flip-card" data-flipped={flipped ? "true" : "false"}>
        {face(children, "front", flipped)}
        {face(back, "back", !flipped)}
      </div>
    </div>
  );
}
