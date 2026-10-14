import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

export interface ChipProps extends ComponentProps<"button"> {
  icon?: ReactNode;
  label: ReactNode;
  chevron?: boolean;
  active?: boolean;
  /** `accent`: the active state is an accent tint (toggles like Sound); `neutral`: a raised surface (filters, open pickers). */
  tone?: "neutral" | "accent";
  /** Full-strength label and icon, for the one chip that names the thing (the model). Option chips are muted with a dim icon. */
  strong?: boolean;
  size?: "sm" | "md";
}

/** Composer control: icon + label + optional chevron, control radius. Works as a Radix `asChild` trigger. */
export function Chip({ icon, label, chevron = false, active, tone = "neutral", strong = false, size = "md", className, type = "button", ...props }: ChipProps) {
  const lit = tone === "accent" && active;
  return (
    <button
      type={type}
      data-active={active || undefined}
      data-tone={tone}
      className={cn(
        "group/chip inline-flex max-w-full select-none items-center gap-2 border border-border-strong bg-surface-2 font-medium tracking-[-0.01em]",
        "transition-[background-color,border-color,color,opacity] duration-150 ease-out",
        "hover:bg-surface-3 hover:text-fg data-[state=open]:bg-surface-3 data-[state=open]:text-fg",
        "disabled:opacity-50 disabled:pointer-events-none",
        strong ? "text-fg" : "text-fg-muted",
        tone === "neutral" && "data-[active=true]:bg-surface-3 data-[active=true]:text-fg",
        tone === "accent" && "data-[active=true]:border-accent/40 data-[active=true]:bg-accent/15 data-[active=true]:text-accent data-[active=true]:hover:bg-accent/20",
        size === "md" ? "h-9 rounded-control px-3 text-[13px]" : "h-7 rounded-button px-2 text-[12px]",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span className={cn("inline-flex shrink-0 items-center [&_svg]:size-4", lit ? "text-accent" : strong ? "text-fg" : "text-fg-faint group-hover/chip:text-fg-muted")}>
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
      {chevron ? (
        <ChevronDown
          size={14}
          className="-mr-0.5 shrink-0 text-fg-subtle transition-transform duration-150 [[data-state=open]_&]:rotate-180"
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
          "inline-flex max-w-full select-none items-center gap-2 border border-border bg-surface-2/60 font-medium tracking-[-0.01em] text-fg-subtle",
          size === "md" ? "h-9 rounded-control px-3 text-[13px]" : "h-7 rounded-button px-2 text-[12px]",
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
