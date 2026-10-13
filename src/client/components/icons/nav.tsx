/**
 * Top bar icons that Lucide does not ship in the mockup's shape, drawn on Lucide's 24-unit grid with a
 * stroke that stays 1.5 px whatever the rendered size (like Lucide's `absoluteStrokeWidth`).
 */
import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & { size?: number };

const STROKE_PX = 1.5;

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: (STROKE_PX * 24) / size,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
}

/** Landscape frame with a solid play mark. */
export function VideoIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...svgProps(size)} {...props}>
      <rect x="2.6" y="4.1" width="18.8" height="15.8" rx="4.2" />
      <path d="M10.4 9.4 14.6 12l-4.2 2.6z" fill="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** A tray with two shrinking bars stacked on it. */
export function AssetsIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...svgProps(size)} {...props}>
      <rect x="2.6" y="11.4" width="18.8" height="9.45" rx="3" />
      <path d="M5.9 6.4h11.9" />
      <path d="M8.7 3.05h6.7" />
    </svg>
  );
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
