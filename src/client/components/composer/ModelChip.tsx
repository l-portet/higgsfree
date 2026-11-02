import type { ImageModel, VideoModel } from "@shared/types";
import { cn } from "@/lib/cn";
import { COMPOSER_MODES, type ComposerMode } from "@/lib/modes";
import { Chip } from "@/components/ui/Chip";
import { ProviderLogo } from "@/components/icons/providers";
import { hasProviderLogo } from "@/components/icons/marks";
import { ProviderTile } from "@/components/ProviderTile";
import { MODE_ICON } from "./ModeSwitch";

/**
 * Trigger chip for the model picker (which also holds the mode tabs): provider mark, name, chevron; in Edit and Upscale
 * a small glyph of the mode after the name. Red when the model cannot take the current inputs.
 */
export function ModelChip({
  model, reason, mode, className, ...props
}: { model: ImageModel | VideoModel; reason: string | null; mode?: ComposerMode } & Omit<React.ComponentProps<typeof Chip>, "label" | "icon">) {
  const icon = hasProviderLogo(model.provider) ? <ProviderLogo provider={model.provider} size={16} /> : <ProviderTile provider={model.provider} size={18} className="-ml-0.5" />;
  const modeName = mode && mode !== "create" ? COMPOSER_MODES.find((m) => m.value === mode)?.label : undefined;
  return (
    <Chip
      icon={icon}
      label={
        modeName && mode ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="truncate">{model.name}</span>
            <span aria-hidden="true" title={modeName} className="inline-flex shrink-0 text-fg-subtle [&_svg]:size-3.5">
              {MODE_ICON[mode]}
            </span>
          </span>
        ) : (
          model.name
        )
      }
      chevron
      strong
      aria-label={modeName ? `${modeName}, model: ${model.name}` : `Model: ${model.name}`}
      className={cn(reason && "border-danger/40 text-danger", className)}
      {...props}
    />
  );
}
