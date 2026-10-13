/** Icon-button styling, shared with links that look like icon buttons (nav, card overlays). */
import { cn } from "@/lib/cn";

export type IconButtonVariant = "ghost" | "secondary" | "overlay" | "primary" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex shrink-0 items-center justify-center select-none transition-[background-color,border-color,color,opacity,transform] " +
  "duration-150 ease-out active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none [&_svg]:shrink-0";

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2 data-[active=true]:text-fg data-[active=true]:bg-surface-2",
  secondary: "bg-surface-2 text-fg border border-border hover:bg-surface-3 hover:border-border-strong",
  overlay: "bg-black/55 text-white backdrop-blur-sm hover:bg-black/75 border border-white/10",
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  danger: "text-fg-muted hover:text-danger hover:bg-danger/10",
};

const SIZE: Record<IconButtonSize, string> = {
  sm: "size-7 rounded-button [&_svg]:size-3.5",
  md: "size-8 rounded-button [&_svg]:size-4",
  lg: "size-9 rounded-control [&_svg]:size-[18px]",
};

export function iconButtonClasses(
  variant: IconButtonVariant = "ghost",
  size: IconButtonSize = "md",
  round = false,
  className?: string,
) {
  return cn(BASE, VARIANT[variant], SIZE[size], round && "rounded-full", className);
}
