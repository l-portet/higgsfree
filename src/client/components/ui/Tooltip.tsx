import { useState, type ComponentProps, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

// A wrapper, not an alias (see Dialog.tsx).
export function TooltipProvider(props: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider {...props} />;
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  delayDuration?: number;
  className?: string;
  /** Force the tooltip open / closed (default: hover and focus). Never open while `content` is empty. */
  open?: boolean;
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  sideOffset = 6,
  delayDuration,
  className,
  open,
}: TooltipProps) {
  // Always controlled: Radix warns when a Root flips between controlled and uncontrolled.
  const [hovered, setHovered] = useState(false);
  const hasContent = !(content === null || content === undefined || content === false || content === "");
  // The Root (and so the Trigger's child) is rendered even without content. Swapping it for a bare
  // fragment would remount the child DOM node: a focused Generate button lost focus the moment
  // its disabled reason cleared (e.g. "Uploading images…" settling).
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration} open={hasContent && (open ?? hovered)} onOpenChange={setHovered}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      {hasContent ? (
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={sideOffset}
            collisionPadding={8}
            className={cn(
              "z-[60] max-w-[280px] rounded-button border border-border-strong bg-surface-3 px-2.5 py-1.5",
              "text-meta text-fg shadow-popover",
              "origin-[var(--radix-tooltip-content-transform-origin)] animate-pop-in data-[state=closed]:animate-pop-out",
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      ) : null}
    </TooltipPrimitive.Root>
  );
}
