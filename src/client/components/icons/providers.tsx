/**
 * Provider logos as inline SVG. `ProviderLogo` looks a mark up by slug (`google`, `x-ai`, …) and
 * renders nothing for unknown providers so callers can fall back. Marks are monochrome (`currentColor`) and `aria-hidden`; the surrounding tile owns
 * the accessible name. Path data and licensing: ./marks.ts and ./LICENSES.md.
 */
import { PROVIDER_MARKS, hasProviderLogo } from "./marks";

export interface ProviderMarkProps {
  /** Pixel size of the square glyph (default 18). */
  size?: number;
  className?: string;
}

export interface ProviderLogoProps extends ProviderMarkProps {
  provider: string;
}

function Mark({ d, size = 18, className }: ProviderMarkProps & { d: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

/** Logo for a provider slug, or `null` when there is none. */
export function ProviderLogo({ provider, ...props }: ProviderLogoProps) {
  const d = hasProviderLogo(provider) ? PROVIDER_MARKS[provider] : undefined;
  return d ? <Mark d={d} {...props} /> : null;
}
