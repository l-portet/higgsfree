import { useCallback, useLayoutEffect, useRef, type ComponentProps } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends ComponentProps<"textarea"> {
  /** Grow with content (default true). */
  autoGrow?: boolean;
  minRows?: number;
  maxRows?: number;
  /** Plain (borderless) style for embedding in a composed surface like the prompt bar. */
  unstyled?: boolean;
}

export function Textarea({
  autoGrow = true,
  minRows = 1,
  maxRows = 8,
  unstyled = false,
  className,
  value,
  ref,
  rows,
  ...props
}: TextareaProps) {
  const inner = useRef<HTMLTextAreaElement | null>(null);

  // Stable per forwarded ref: a new callback each render would detach and reattach the node every time.
  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      inner.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const min = line * minRows + pad + border;
    const max = line * maxRows + pad + border;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight + border, min), max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight + border > max ? "auto" : "hidden";
  }, [value, autoGrow, minRows, maxRows]);

  return (
    <textarea
      ref={setRef}
      rows={rows ?? minRows}
      value={value}
      className={cn(
        "block w-full resize-none bg-transparent text-fg placeholder:text-fg-subtle outline-none",
        !unstyled &&
          "rounded-sm border border-border bg-surface-2 px-3 py-2 text-[13px] leading-5 transition-colors duration-150 " +
            "hover:border-border-strong focus:border-border-strong focus:ring-2 focus:ring-accent/40",
        className,
      )}
      {...props}
    />
  );
}
