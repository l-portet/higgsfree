import { cn } from "@/lib/cn";
import { MARK_PATH } from "@/lib/mark";
import { MarkCrawl } from "./MarkCrawl";

/**
 * The brand green (the UI accent at rest) and the ink sampled from the artwork. With `intro`, a tile in the old
 * brand lime sits over the green one and fades out with the accent on load (`logo-intro`, globals.css), and the
 * glyph crawls from a scribble into the F meanwhile (`MarkCrawl`, docs/brand/mark-crawl.json).
 */
export const BRAND_COLOR = "#5dfd8c";
const INTRO_LIME = "#d0f81e";
export const BRAND_INK = "#171717";

export interface LogoProps {
  /** Height of the mark in px. The lockup's wordmark and gap scale with it (15 px type at 24). */
  size?: number;
  /** `mark` renders the tile alone; `lockup` adds the "higgsfree" wordmark as real text. */
  variant?: "mark" | "lockup";
  /** `accent`: the green tile and an `fg` wordmark. `mono`: the glyph alone, everything in `currentColor`. */
  tone?: "accent" | "mono";
  className?: string;
  /** Extra classes for the wordmark span, e.g. `hidden sm:block` to collapse it on small screens. */
  wordmarkClassName?: string;
  /** The nav's mark: opens on the old lime with a scribble, and fades to the green as the scribble crawls into the F, on load. */
  intro?: boolean;
}

/**
 * Brand mark, optionally locked up with the wordmark. The SVG is decorative (`aria-hidden`);
 * give the link or heading that wraps it an accessible name.
 */
export function Logo({ size = 24, variant = "mark", tone = "accent", className, wordmarkClassName, intro = false }: LogoProps) {
  const mark = intro && tone === "accent" ? (
    <MarkCrawl size={size} tile={BRAND_COLOR} lime={INTRO_LIME} ink={BRAND_INK} className={cn(variant === "mark" && className)} />
  ) : (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", variant === "mark" && className)}
      aria-hidden="true"
      focusable="false"
    >
      {tone === "accent" ? (
        <>
          <rect width="64" height="64" rx="15" fill={BRAND_COLOR} />
          <path fill={BRAND_INK} d={MARK_PATH} />
        </>
      ) : (
        // Without the tile the glyph grows to a 75 % body so it keeps the same visual weight.
        <path fill="currentColor" transform="translate(32 32) scale(1.2) translate(-32 -32)" d={MARK_PATH} />
      )}
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
        higgsfree
      </span>
    </span>
  );
}
