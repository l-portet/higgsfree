import { useCallback, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { NO_AUTOFILL } from "@/lib/no-autofill";

export interface TextareaProps extends ComponentProps<"textarea"> {
  /** Grow with content (default true). */
  autoGrow?: boolean;
  minRows?: number;
  maxRows?: number;
  /**
   * Mount at `minRows` when there is already text in it, and grow to fit on the first focus (or as soon as
   * the text changes from what it was handed). A restored prompt would otherwise open the page on a bar
   * several lines tall; this keeps it one line until it is being worked on. Needs `autoGrow`.
   */
  compactUntilFocus?: boolean;
  /** Plain (borderless) style for embedding in a composed surface like the prompt bar. */
  unstyled?: boolean;
}

export function Textarea({
  autoGrow = true,
  minRows = 1,
  maxRows = 8,
  compactUntilFocus = false,
  unstyled = false,
  className,
  value,
  ref,
  rows,
  onFocus,
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

  // State, not a ref: both are read while rendering, to drop out of compact without a second paint.
  const [mountedWith] = useState(value);
  const [compact, setCompact] = useState(() => compactUntilFocus && autoGrow && typeof value === "string" && value.length > 0);
  // New text (a prompt handed over from "Reuse prompt", an example) is there to be read: show all of it.
  if (compact && value !== mountedWith) setCompact(false);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const min = line * minRows + pad + border;
    const max = line * maxRows + pad + border;
    if (compact) {
      el.style.height = `${min}px`;
      el.style.overflowY = "hidden";
      el.scrollTop = 0; // The first line, not wherever the caret left it.
      return;
    }
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight + border, min), max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight + border > max ? "auto" : "hidden";
  }, [value, autoGrow, minRows, maxRows, compact]);

  return (
    <textarea
      {...NO_AUTOFILL}
      ref={setRef}
      rows={rows ?? minRows}
      value={value}
      onFocus={(e) => {
        setCompact(false);
        onFocus?.(e);
      }}
      className={cn(
        "block w-full resize-none bg-transparent text-fg placeholder:text-fg-subtle outline-none",
        !unstyled &&
          "rounded-field border border-border bg-inset px-3 py-2 text-[13px] leading-5 transition-colors duration-150 " +
            "hover:border-border-strong focus:border-border-strong focus:ring-2 focus:ring-accent/40",
        className,
      )}
      {...props}
    />
  );
}
