import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends ComponentProps<"input"> {
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  invalid?: boolean;
}

export function Input({ leftIcon, rightSlot, invalid, className, ...props }: InputProps) {
  return (
    <div className={cn("relative flex items-center", className)}>
      {leftIcon ? (
        <span className="pointer-events-none absolute left-2.5 inline-flex text-fg-faint [&_svg]:size-4">{leftIcon}</span>
      ) : null}
      <input
        aria-invalid={invalid || undefined}
        className={cn(
          "h-9 w-full rounded-sm border border-border bg-surface-2 px-3 text-[13px] text-fg placeholder:text-fg-subtle",
          "transition-colors duration-150 outline-none hover:border-border-strong",
          "focus:border-border-strong focus:ring-2 focus:ring-accent/40",
          "aria-[invalid=true]:border-danger/50 aria-[invalid=true]:focus:ring-danger/30",
          "disabled:opacity-50",
          leftIcon && "pl-8",
          rightSlot && "pr-9",
        )}
        {...props}
      />
      {rightSlot ? <span className="absolute right-1.5 inline-flex">{rightSlot}</span> : null}
    </div>
  );
}
