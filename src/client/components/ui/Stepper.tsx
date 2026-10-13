import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Accessible group label, e.g. "Number of images". */
  label: string;
  /** Show "value/max" (default) or a custom formatter. */
  format?: (value: number, max: number) => ReactNode;
  disabled?: boolean;
  className?: string;
}

/** `− 1/4 +` control, a composer chip in shape: control radius outside, tag radius (10 − 4) on the buttons. */
export function Stepper({ value, min, max, step = 1, onChange, label, format, disabled, className }: StepperProps) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  const btn =
    "inline-flex size-7 items-center justify-center rounded-tag text-fg-muted transition-colors duration-150 " +
    "hover:bg-surface-3 hover:text-fg disabled:text-fg-faint disabled:pointer-events-none";
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex h-9 select-none items-center gap-0.5 rounded-control border border-border-strong bg-surface-2 px-1",
        disabled && "opacity-50",
        className,
      )}
    >
      <button type="button" className={btn} onClick={dec} disabled={disabled || value <= min} aria-label={`Decrease ${label}`}>
        <Minus size={14} aria-hidden="true" />
      </button>
      <span className="min-w-[30px] px-0.5 text-center text-[13px] font-medium tabular-nums tracking-[-0.01em] text-fg" aria-live="polite">
        {format ? (
          format(value, max)
        ) : (
          <>
            {value}
            <span className="text-fg-subtle">/{max}</span>
          </>
        )}
      </span>
      <button type="button" className={btn} onClick={inc} disabled={disabled || value >= max} aria-label={`Increase ${label}`}>
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
