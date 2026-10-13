import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

export interface ChipProps extends ComponentProps<"button"> {
  icon?: ReactNode;
  label: ReactNode;
  chevron?: boolean;
  active?: boolean;
  size?: "sm" | "md";
}

/** Prompt-bar control pill: icon + label + optional chevron. Works as a Radix `asChild` trigger. */
export function Chip({ icon, label, chevron = false, active, size = "md", className, type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      data-active={active || undefined}
      className={cn(
        "inline-flex max-w-full select-none items-center gap-1.5 rounded-full border border-border bg-surface-2 text-fg",
        "font-medium transition-[background-color,border-color,color,opacity] duration-150 ease-out",
        "hover:border-border-strong hover:bg-surface-3",
        "data-[active=true]:border-border-strong data-[active=true]:bg-surface-3",
        "data-[state=open]:border-border-strong data-[state=open]:bg-surface-3",
        "disabled:opacity-50 disabled:pointer-events-none",
        size === "md" ? "h-9 px-3 text-[13px]" : "h-7 px-2 text-[12px]",
        className,
      )}
      {...props}
    >
      {icon ? <span className="inline-flex shrink-0 items-center text-fg-muted [&_svg]:size-4">{icon}</span> : null}
      <span className="truncate">{label}</span>
      {chevron ? (
        <ChevronDown
          size={14}
          className="-mr-0.5 shrink-0 text-fg-faint transition-transform duration-150 [[data-state=open]_&]:rotate-180"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}

/** Non-interactive chip for single-option controls (e.g. one resolution or one quality). */
export function StaticChip({ icon, label, title, size = "md", className }: { icon?: ReactNode; label: ReactNode; title: string; size?: "sm" | "md"; className?: string }) {
  return (
    <Tooltip content={title}>
      <span
        className={cn(
          "inline-flex max-w-full select-none items-center gap-1.5 rounded-full border border-border bg-surface-2/60 font-medium text-fg-muted",
          size === "md" ? "h-9 px-3 text-[13px]" : "h-7 px-2 text-[12px]",
          className,
        )}
      >
        {icon ? <span className="inline-flex shrink-0 items-center text-fg-faint [&_svg]:size-4" aria-hidden="true">{icon}</span> : null}
        <span className="truncate tabular-nums" aria-hidden="true">{label}</span>
        <span className="sr-only">{title}</span>
      </span>
    </Tooltip>
  );
}
