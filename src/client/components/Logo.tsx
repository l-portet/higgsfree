import { cn } from "@/lib/cn";
import { MarkMorphGlyph } from "./MarkMorph";

/**
 * higgsfree mark: a looped script F, black on a green tile. The path is the supplied artwork
 * (docs/brand/logo-source.png) traced once onto a 64-unit tile, glyph at 61 % of the tile as in the
 * original. Source of truth and usage rules: docs/brand/BRAND.md; keep it in sync with docs/brand/mark.svg.
 */
const MARK_PATH = "M21.56 50.82C18.65 50.5 16.21 48.53 15.29 45.76C14.99 44.89 14.89 44.28 14.86 43.24C14.83 42.15 14.91 41.48 15.18 40.53C15.81 38.35 17.01 36.42 18.92 34.55C20.5 33 22.42 31.68 24.78 30.52C26.19 29.82 27.23 29.41 28.75 28.94L29.36 28.75L29.52 28.09C30.21 25.37 31.29 23.12 32.86 21.16C33.44 20.43 34.81 19.04 35.41 18.58C35.91 18.19 35.95 18.24 34.88 18.07C33.28 17.82 31.25 17.8 30.28 18.01C29.15 18.25 28.13 18.69 27.19 19.32C26.39 19.86 25.99 20.21 24.49 21.68C23.76 22.38 22.94 23.15 22.65 23.39C20.9 24.82 19.06 25.6 16.86 25.83C15.67 25.95 14 25.81 13.01 25.5L12.63 25.39L12.62 22.75C12.61 21.3 12.62 20.11 12.64 20.11C12.66 20.11 12.97 20.17 13.34 20.23C14.61 20.47 15.58 20.52 16.43 20.39C18.1 20.13 19.08 19.53 21.38 17.33C23.5 15.3 24.81 14.35 26.57 13.55C28.2 12.82 29.75 12.47 31.72 12.42C33.61 12.36 35.24 12.58 39.48 13.45C41.75 13.91 42.76 14.04 44.25 14.04C46.05 14.04 47.12 13.85 49.1 13.19C49.81 12.95 50.69 12.68 51.04 12.6C51.39 12.52 51.7 12.44 51.74 12.43C51.79 12.41 51.8 12.95 51.79 15.11L51.78 17.82L50.93 18.18C49.49 18.79 47.79 19.32 46.49 19.55C46.17 19.6 45.37 19.72 44.71 19.8C42.38 20.1 41.52 20.34 40.27 21.05C38.89 21.83 37.71 23.03 36.74 24.64C36.19 25.54 35.67 26.68 35.4 27.6L35.32 27.87L36.46 27.83C37.08 27.81 39.53 27.79 41.9 27.79L46.21 27.79L46.23 30.46L46.24 33.12L40.78 33.12C37.79 33.12 35.16 33.14 34.95 33.16L34.57 33.19L34.53 33.55C34.51 33.75 34.46 34.28 34.42 34.73C34.2 37.16 33.99 38.48 33.58 40.11C33.1 42.03 32.26 43.99 31.25 45.57C30.36 46.95 28.95 48.37 27.59 49.26C26.97 49.67 25.86 50.21 25.25 50.42C24.06 50.81 22.74 50.96 21.56 50.82ZM23.44 45.02C24.52 44.74 25.64 43.84 26.5 42.57C27.23 41.47 27.8 40.1 28.22 38.46C28.6 36.93 29.08 34.14 28.97 34.14C28.96 34.14 28.72 34.22 28.43 34.32C26.09 35.14 23.88 36.57 22.31 38.3C21.39 39.31 20.66 40.63 20.44 41.7C20.35 42.13 20.34 43.01 20.42 43.39C20.7 44.72 21.95 45.4 23.44 45.02Z";

/**
 * The brand green (the UI accent at rest) and the ink sampled from the artwork. With `intro`, a tile in the old
 * brand lime sits over the green one and fades out with the accent on load (`logo-intro`, globals.css), and the
 * glyph morphs from a swirl into the F meanwhile (`MarkMorphGlyph`, docs/brand/mark-morph.json).
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
  /** The nav's mark: opens on the old lime with the swirl, and fades to the green as the swirl becomes the F, on load. */
  intro?: boolean;
}

/**
 * Brand mark, optionally locked up with the wordmark. The SVG is decorative (`aria-hidden`);
 * give the link or heading that wraps it an accessible name.
 */
export function Logo({ size = 24, variant = "mark", tone = "accent", className, wordmarkClassName, intro = false }: LogoProps) {
  const mark = (
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
          {intro ? <rect width="64" height="64" rx="15" fill={INTRO_LIME} className="logo-intro" /> : null}
          {intro ? <MarkMorphGlyph fill={BRAND_INK} /> : <path fill={BRAND_INK} fillRule="evenodd" d={MARK_PATH} />}
        </>
      ) : (
        // Without the tile the glyph grows to a 75 % body so it keeps the same visual weight.
        <path fill="currentColor" fillRule="evenodd" transform="translate(32 32) scale(1.2) translate(-32 -32)" d={MARK_PATH} />
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
