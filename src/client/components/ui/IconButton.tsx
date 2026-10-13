import type { ComponentProps } from "react";
import { iconButtonClasses, type IconButtonSize, type IconButtonVariant } from "./iconButtonClasses";
import { Tooltip } from "./Tooltip";

export type { IconButtonSize, IconButtonVariant };

export interface IconButtonProps extends Omit<ComponentProps<"button">, "aria-label"> {
  /** Accessible name; also the tooltip text. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  round?: boolean;
  active?: boolean;
  /** Show a tooltip with the label (default true). */
  tooltip?: boolean;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  round = false,
  active,
  tooltip = true,
  tooltipSide = "top",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      data-active={active || undefined}
      className={iconButtonClasses(variant, size, round, className)}
      {...props}
    />
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} side={tooltipSide}>
      {button}
    </Tooltip>
  );
}
