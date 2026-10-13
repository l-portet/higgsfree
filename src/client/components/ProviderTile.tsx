import { cn } from "@/lib/cn";
import { providerLabel } from "@/lib/models";
import { Tooltip } from "@/components/ui/Tooltip";
import { ProviderLogo } from "@/components/icons/providers";
import { hasProviderLogo } from "@/components/icons/marks";

export interface ProviderTileProps {
  provider: string;
  /** Pixel size (default 36). */
  size?: number;
  tooltip?: boolean;
  className?: string;
}

/** Square tile with the provider's logo, or its initial letter for providers without one. */
export function ProviderTile({ provider, size = 36, tooltip = false, className }: ProviderTileProps) {
  const label = providerLabel(provider);
  const letter = (label.charAt(0) || "?").toUpperCase();
  const logo = hasProviderLogo(provider);
  // 36 → 18, 32 → 16 (picker / video rows); 18 → 14 (prompt-bar and Settings chips).
  const glyph = size >= 32 ? Math.round(size / 2) : size - 4;
  const tile = (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center border border-border bg-surface-3 font-semibold",
        logo ? "text-fg" : "text-fg-muted",
        size >= 32 ? "rounded-[9px]" : "rounded-[5px]",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      role="img"
      aria-label={label}
    >
      {logo ? <ProviderLogo provider={provider} size={glyph} /> : letter}
    </span>
  );
  if (!tooltip) return tile;
  return <Tooltip content={label}>{tile}</Tooltip>;
}
