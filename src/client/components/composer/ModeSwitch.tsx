import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ImageUpscale, PenLine, WandSparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { COMPOSER_MODES, type ComposerMode } from "@/lib/modes";

export const MODE_ICON: Record<ComposerMode, ReactNode> = {
  create: <WandSparkles />,
  edit: <PenLine />,
  upscale: <ImageUpscale />,
};

/**
 * Create / Edit / Upscale, at the top of the model picker: a segmented row whose tab picks which models the list shows
 * (and so the composer's mode). Arrow keys move between the tabs.
 */
export function ModeTabs({ value, onChange, label }: { value: ComposerMode; onChange: (mode: ComposerMode) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = COMPOSER_MODES.findIndex((m) => m.value === value);
    const next = (i + step + COMPOSER_MODES.length) % COMPOSER_MODES.length;
    const mode = COMPOSER_MODES[next];
    if (!mode) return;
    onChange(mode.value);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="grid grid-cols-3 gap-0.5 rounded-control bg-surface-2 p-[3px]">
      {COMPOSER_MODES.map((m, i) => {
        const on = m.value === value;
        return (
          <button
            key={m.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(m.value)}
            className={cn(
              "inline-flex h-7 select-none items-center justify-center gap-1.5 rounded-[7px] text-[12.5px] font-medium tracking-[-0.01em]",
              "transition-[background-color,color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              "[&_svg]:size-3.5",
              on ? "bg-surface-3 text-fg shadow-[0_0_0_1px_var(--color-border-strong)]" : "text-fg-muted hover:text-fg",
            )}
          >
            <span aria-hidden="true" className={cn("inline-flex", on ? "text-fg" : "text-fg-faint")}>
              {MODE_ICON[m.value]}
            </span>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
