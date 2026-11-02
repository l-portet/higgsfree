import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { COMPOSER_MODES, type ComposerMode } from "@/lib/modes";

/**
 * Create / Edit / Upscale, left of the model chip: a segmented control the height of a chip. The model picker next to
 * it lists the mode's models. Arrow keys move between the three, as in any radio group.
 */
export function ModeSwitch({ value, onChange, label }: { value: ComposerMode; onChange: (mode: ComposerMode) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
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
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-control border border-border-strong bg-surface-2 p-[3px]"
    >
      {COMPOSER_MODES.map((m, i) => {
        const on = m.value === value;
        return (
          <button
            key={m.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(m.value)}
            className={cn(
              "h-full select-none rounded-[7px] px-2.5 text-[13px] font-medium tracking-[-0.01em]",
              "transition-[background-color,color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              on ? "bg-surface-3 text-fg shadow-[0_0_0_1px_var(--color-border-strong)]" : "text-fg-muted hover:text-fg",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
