import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps extends Omit<ComponentProps<"button">, "onChange" | "role"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** On / off switch (`role="switch"`): an accent track when on, like the Sound toggle chip. Label it with `aria-labelledby` or `aria-label`. */
export function Switch({ checked, onCheckedChange, className, disabled, type = "button", ...props }: SwitchProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-transparent bg-accent" : "border-border-strong bg-surface-3",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-3.5 rounded-full shadow-raised transition-transform duration-150",
          checked ? "translate-x-[18px] bg-on-accent" : "translate-x-[2px] bg-fg-muted",
        )}
      />
    </button>
  );
}
