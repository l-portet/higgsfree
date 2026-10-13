import type { ComponentProps } from "react";
import type { ModelBadge } from "@shared/types";
import { cn } from "@/lib/cn";

export type BadgeVariant = ModelBadge | "neutral" | "accent" | "danger";

const VARIANT: Record<BadgeVariant, string> = {
  new: "bg-accent text-on-accent",
  pro: "bg-surface-3 text-fg-muted border border-border-strong",
  fast: "bg-surface-3 text-fg-muted",
  beta: "bg-surface-3 text-fg-subtle border border-border",
  neutral: "bg-surface-3 text-fg-muted",
  accent: "bg-accent text-on-accent",
  danger: "bg-danger/15 text-danger",
};

const LABEL: Partial<Record<BadgeVariant, string>> = { new: "New", pro: "Pro", fast: "Fast", beta: "Beta" };

export interface BadgeProps extends ComponentProps<"span"> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded-badge px-1.5 text-[10px] font-bold uppercase leading-none tracking-[0.04em]",
        VARIANT[variant],
        className,
      )}
      {...props}
    >
      {children ?? LABEL[variant] ?? variant}
    </span>
  );
}

/** Translucent badge for use over media (cards, lightbox). */
export function OverlayBadge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-tag bg-black/55 px-1.5 text-[11px] font-medium leading-none text-white/90 backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
