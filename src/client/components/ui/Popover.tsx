import type { ComponentProps } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/cn";

// Wrappers, not aliases (see Dialog.tsx).
export function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />;
}
export function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger {...props} />;
}

export interface PopoverContentProps extends ComponentProps<typeof PopoverPrimitive.Content> {
  /** Remove the default inner padding (for list-style popovers with their own layout). */
  flush?: boolean;
}

export function PopoverContent({
  className,
  sideOffset = 8,
  collisionPadding = 12,
  align = "start",
  flush = false,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        align={align}
        className={cn(
          "z-50 rounded-popover border border-border-strong bg-surface-2 text-fg shadow-popover outline-none",
          "origin-[var(--radix-popover-content-transform-origin)] animate-pop-in data-[state=closed]:animate-pop-out",
          !flush && "p-1",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/** A selectable row inside a popover list. */
export interface PopoverItemProps extends ComponentProps<"button"> {
  selected?: boolean;
}

export function PopoverItem({ selected, className, type = "button", ...props }: PopoverItemProps) {
  return (
    <button
      type={type}
      role="option"
      aria-selected={selected}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-control px-2 py-2 text-left text-[13px] text-fg",
        "transition-colors duration-150 hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none",
        "aria-selected:bg-surface-3",
        "disabled:opacity-40 disabled:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

/** Muted section label at the top of a popover list ("Aspect ratio", "Quality"). */
export function PopoverLabel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("text-label px-2 pt-1.5 pb-1", className)} {...props} />;
}
