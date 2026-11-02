import { useState, type ReactNode } from "react";
import { Check, ImageUpscale, PenLine, WandSparkles } from "lucide-react";
import { COMPOSER_MODES, type ComposerMode } from "@/lib/modes";
import { Chip } from "@/components/ui/Chip";
import { Popover, PopoverContent, PopoverItem, PopoverLabel, PopoverTrigger } from "@/components/ui/Popover";

const MODE_ICON: Record<ComposerMode, ReactNode> = {
  create: <WandSparkles />,
  edit: <PenLine />,
  upscale: <ImageUpscale />,
};

const MODE_HINT: Record<ComposerMode, string> = {
  create: "From a prompt",
  edit: "Change one you have",
  upscale: "Sharper, larger",
};

/**
 * Create / Edit / Upscale, left of the model chip: a chip that opens a short list, like the other options. The model
 * picker next to it lists the mode's models.
 */
export function ModeSwitch({ value, onChange, label }: { value: ComposerMode; onChange: (mode: ComposerMode) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const current = COMPOSER_MODES.find((m) => m.value === value) ?? COMPOSER_MODES[0];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip icon={MODE_ICON[value]} label={current?.label ?? "Create"} chevron strong aria-label={`${label}: ${current?.label ?? "Create"}`} />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[220px]">
        <div role="listbox" aria-label={label}>
          <PopoverLabel>Mode</PopoverLabel>
          {COMPOSER_MODES.map((m) => (
            <PopoverItem
              key={m.value}
              selected={m.value === value}
              onClick={() => {
                onChange(m.value);
                setOpen(false);
              }}
            >
              <span className="inline-flex text-fg-muted [&_svg]:size-[15px]" aria-hidden="true">
                {MODE_ICON[m.value]}
              </span>
              <span className="flex-1">{m.label}</span>
              <span className="text-caption">{MODE_HINT[m.value]}</span>
              {m.value === value ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
            </PopoverItem>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
