import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none rounded-button font-medium " +
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out " +
  "active:scale-[0.985] disabled:opacity-50 disabled:pointer-events-none [&_svg]:shrink-0 " +
  "aria-disabled:active:scale-100";

/**
 * Not ready (`aria-disabled`, still focusable so the tooltip reason is reachable): primary rests on a
 * neutral surface until the action is possible, then turns to the accent; no hover while resting, and children
 * (cost estimate, icons) inherit the muted colour. Other variants simply dim. `disabled` (loading) keeps
 * the variant colours at 50 % opacity via BASE.
 */
const NOT_READY = "aria-disabled:opacity-50";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    // Transparent border so the geometry doesn't shift when the resting border appears.
    "bg-accent text-on-accent border border-transparent hover:bg-accent-hover " +
    "aria-disabled:bg-surface-2 aria-disabled:text-fg-muted aria-disabled:border aria-disabled:border-border aria-disabled:shadow-none " +
    "aria-disabled:hover:bg-surface-2 aria-disabled:hover:border-border aria-disabled:**:text-inherit",
  secondary: `bg-surface-2 text-fg border border-border hover:bg-surface-3 hover:border-border-strong ${NOT_READY}`,
  ghost: `text-fg-muted hover:text-fg hover:bg-surface-2 ${NOT_READY}`,
  danger: `bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15 hover:border-danger/30 ${NOT_READY}`,
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
  md: "h-9 px-3.5 text-[13px] [&_svg]:size-4",
  lg: "h-10 px-4 text-sm [&_svg]:size-4",
};

function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={size === "lg" ? 16 : 14} /> : leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}

export interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  leftIcon,
  rightIcon,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}

export interface AnchorButtonProps extends ComponentProps<"a"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function AnchorButton({
  variant = "secondary",
  size = "md",
  leftIcon,
  rightIcon,
  className,
  children,
  ...props
}: AnchorButtonProps) {
  return (
    <a className={buttonClasses(variant, size, className)} {...props}>
      {leftIcon}
      {children}
      {rightIcon}
    </a>
  );
}
