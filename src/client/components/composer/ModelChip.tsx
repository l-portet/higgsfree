import type { ImageModel, VideoModel } from "@shared/types";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui/Chip";
import { ProviderLogo } from "@/components/icons/providers";
import { hasProviderLogo } from "@/components/icons/marks";
import { ProviderTile } from "@/components/ProviderTile";

/** Trigger chip for the model picker: provider mark, name, chevron; red when the model cannot take the current inputs. */
export function ModelChip({ model, reason, className, ...props }: { model: ImageModel | VideoModel; reason: string | null } & Omit<React.ComponentProps<typeof Chip>, "label" | "icon">) {
  const icon = hasProviderLogo(model.provider) ? <ProviderLogo provider={model.provider} size={16} /> : <ProviderTile provider={model.provider} size={18} className="-ml-0.5" />;
  return (
    <Chip
      icon={icon}
      label={model.name}
      chevron
      strong
      aria-label={`Model: ${model.name}`}
      className={cn(reason && "border-danger/40 text-danger", className)}
      {...props}
    />
  );
}
