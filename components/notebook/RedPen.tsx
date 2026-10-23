import type { ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

/**
 * A short note in red pen. The handwriting is decoration: screen readers get
 * the plain text, and the Settings switch turns it into ordinary italics.
 */
export function RedPen({ children, className, rotate = -2 }: { children: ReactNode; className?: string; rotate?: number }) {
  return (
    <span className={cx("pen inline-block text-[1.35rem]", className)} style={{ transform: `rotate(${rotate}deg)` }}>
      {children}
    </span>
  );
}
