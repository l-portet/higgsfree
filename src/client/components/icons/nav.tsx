/**
 * Top bar icons, drawn on Lucide's 24-unit grid with a stroke that stays 1.5 px whatever the rendered size
 * (like Lucide's `absoluteStrokeWidth`).
 */
import type { CSSProperties, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & { size?: number };

const STROKE_PX = 1.5;

const strokeWidth = (size: number) => (STROKE_PX * 24) / size;

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth(size),
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
}

/** Ring, shaft and two straight teeth. */
export function KeyIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...svgProps(size)} {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 19 4" />
      <path d="m18 5 2 2" />
      <path d="m15 8 2 2" />
    </svg>
  );
}

// ---------- Tab icons ----------
//
// Painted, not drawn: the tab's icon is a box whose `background-color` is the colour, cut to the icon's outline
// by a mask made from the shapes below. Not `currentColor` on an SVG: a colour-rewriting browser extension
// (seen 2026-10) drops the `color` of the active icon, which then inherits the label's white and never takes the
// accent at all — while `background-color: var(--color-accent)` (the key's dot) comes through and sweeps.

/** One element of an icon on the 24-unit grid: tag and SVG attributes (`fill: "ink"` makes it solid). */
type Shape = [tag: "rect" | "circle" | "path", attrs: Record<string, string | number>];

export interface TabIcon {
  /** Rendered box in px; sizes are tuned so the drawn shapes match the mockup (14 px frames, a 12 px heart). */
  size: number;
  shapes: Shape[];
}

/** Landscape frame with a solid play mark. */
export const VIDEO_ICON: TabIcon = {
  size: 16,
  shapes: [
    ["rect", { x: 2.6, y: 4.1, width: 18.8, height: 15.8, rx: 4.2 }],
    ["path", { d: "M10.4 9.4 14.6 12l-4.2 2.6z", fill: "ink", "stroke-width": 1 }],
  ],
};

/** Lucide's `image` (ISC). */
export const IMAGE_ICON: TabIcon = {
  size: 17,
  shapes: [
    ["rect", { width: 18, height: 18, x: 3, y: 3, rx: 2, ry: 2 }],
    ["circle", { cx: 9, cy: 9, r: 2 }],
    ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }],
  ],
};

/** Lucide's `heart` (ISC). */
export const HEART_ICON: TabIcon = {
  size: 13,
  shapes: [["path", { d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" }]],
};

/** The icon's outline as a mask image: its shapes in opaque black, everything else transparent. */
function maskImage({ size, shapes }: TabIcon): string {
  const body = shapes
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v === "ink" ? "#000" : v}"`).join(" ")}/>`)
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#000" ` +
    `stroke-width="${strokeWidth(size)}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Size and mask for a tab icon's box; give it the colour as a `bg-*` class. */
export function tabIconStyle(icon: TabIcon): CSSProperties {
  return { width: icon.size, height: icon.size, maskImage: maskImage(icon), maskSize: "100% 100%", maskRepeat: "no-repeat" };
}
