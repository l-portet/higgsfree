import { useState, type ReactNode } from "react";
import { Check, ImageUpscale, PenLine, WandSparkles } from "lucide-react";
import { cn } from "@/lib/cn";
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

/** A half of `ModeModelChip`: the chip's look without its own border, filling the group's height. */
export const CHIP_SEGMENT = "h-full rounded-[9px] border-0 bg-transparent px-2.5";

/**
 * Create / Edit / Upscale, and the model, in one chip: "Create v / (mark) Seedance 2.5 v". Each half opens its own list
 * (`ModeSwitch`, then the model picker, which lists the mode's models). One chip instead of two keeps the options on
 * one row.
 */
export function ModeModelChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("inline-flex h-9 min-w-0 max-w-full items-center rounded-control border border-border-strong bg-surface-2", className)}>
      {children}
    </div>
  );
}

/** The slash between the two halves. */
export function ChipSlash() {
  return (
    <span aria-hidden="true" className="select-none px-px text-[13px] text-fg-faint">
      /
    </span>
  );
}

/** The mode half of `ModeModelChip`: opens a short list of the three modes. */
export function ModeSwitch({ value, onChange, label }: { value: ComposerMode; onChange: (mode: ComposerMode) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const current = COMPOSER_MODES.find((m) => m.value === value) ?? COMPOSER_MODES[0];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip label={current?.label ?? "Create"} chevron strong aria-label={`${label}: ${current?.label ?? "Create"}`} className={cn(CHIP_SEGMENT, "shrink-0")} />
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
