import { cn } from "@/lib/cn";

/**
 * Open Higgsfield mark: an H whose crossbar is cut in the middle, so a full-height slot of light
 * runs through the letter (an open gate, an aperture). Drawn on a 64 grid with an 8-unit margin;
 * stems 12, stubs 8, gap 8, every edge on a multiple of 4 so it stays crisp at 16 px.
 * Source of truth and usage rules: docs/brand/BRAND.md. Keep this path in sync with docs/brand/mark.svg.
 */
const MARK_PATH =
  "M11 8h6a3 3 0 0 1 3 3v13h8v12h-8v17a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3z" +
  "M47 8h6a3 3 0 0 1 3 3v42a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3V36h-8V24h8V11a3 3 0 0 1 3-3z";

export interface LogoProps {
  /** Height of the mark in px. The lockup's wordmark and gap scale with it (15 px type at 24). */
  size?: number;
  /** `mark` renders the glyph alone; `lockup` adds the "Open Higgsfield" wordmark as real text. */
  variant?: "mark" | "lockup";
  /** `accent`: lime mark and `fg` wordmark. `mono`: everything in `currentColor`. */
  tone?: "accent" | "mono";
  className?: string;
  /** Extra classes for the wordmark span, e.g. `hidden sm:block` to collapse it on small screens. */
  wordmarkClassName?: string;
}

/**
 * Brand mark, optionally locked up with the wordmark. The SVG is decorative (`aria-hidden`);
 * give the link or heading that wraps it an accessible name.
 */
export function Logo({ size = 24, variant = "mark", tone = "accent", className, wordmarkClassName }: LogoProps) {
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", variant === "mark" && className)}
      aria-hidden="true"
      focusable="false"
    >
      <path fill={tone === "accent" ? "var(--color-accent)" : "currentColor"} d={MARK_PATH} />
    </svg>
  );
  if (variant === "mark") return mark;

  return (
    <span className={cn("inline-flex items-center", className)} style={{ gap: Math.round((size * 10) / 24) }}>
      {mark}
      <span
        className={cn(
          "whitespace-nowrap font-display font-bold leading-none tracking-[-0.01em]",
          tone === "accent" ? "text-fg" : "text-current",
          wordmarkClassName,
        )}
        style={{ fontSize: Math.round(size * 0.625) }}
      >
        Open Higgsfield
      </span>
    </span>
  );
}
