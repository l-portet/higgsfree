import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/hooks";
import type { MasonryItem } from "@/lib/masonry";

/** Column gap in px (Tailwind `gap-3`). */
const GAP = 12;

export interface MasonryGridProps extends Omit<ComponentProps<"div">, "children"> {
  items: MasonryItem[];
  /** Minimum column width below and from the `sm` breakpoint, like `minmax(Npx, 1fr)` did. */
  minColumn?: { base: number; sm: number };
}

/** Same column count `repeat(auto-fill, minmax(min, 1fr))` would give for this width. */
function columnsFor(width: number, minColumn: number): number {
  return Math.max(1, Math.floor((width + GAP) / (minColumn + GAP)));
}

/** Greedy shortest-column packing. Heights are in column-width units so no pixels are needed. */
function distribute(items: MasonryItem[], columns: number, gapUnits: number): MasonryItem[][] {
  const cols: MasonryItem[][] = Array.from({ length: columns }, () => []);
  const heights = new Array<number>(columns).fill(0);
  for (const item of items) {
    let target = 0;
    for (let i = 1; i < columns; i++) if (heights[i]! < heights[target]!) target = i;
    cols[target]!.push(item);
    heights[target]! += 1 / item.aspect + gapUnits;
  }
  return cols;
}

/**
 * Pinterest-style feed: N equal flex columns, each item dropped into the shortest one, so tall
 * portrait cards never leave holes under their landscape neighbours. Items are placed in array
 * order (newest first), which keeps the top row the newest; the lightbox / selection order is the
 * items order, not the column order. One ResizeObserver per grid drives the column count.
 */
export function MasonryGrid({ items, minColumn = { base: 160, sm: 260 }, className, ...rest }: MasonryGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const sm = useMediaQuery("(min-width: 640px)");
  const min = sm ? minColumn.sm : minColumn.base;
  // `gapUnits` is the gap as a fraction of the column width, rounded so a window drag does not
  // redistribute on every pixel.
  const [layout, setLayout] = useState({ columns: 0, gapUnits: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width: number) => {
      const columns = columnsFor(width, min);
      const columnWidth = (width - GAP * (columns - 1)) / columns;
      const gapUnits = Math.round((GAP / columnWidth) * 100) / 100;
      setLayout((prev) => (prev.columns === columns && prev.gapUnits === gapUnits ? prev : { columns, gapUnits }));
    };
    measure(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) measure(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);

  const columns = useMemo(
    () => (layout.columns ? distribute(items, layout.columns, layout.gapUnits) : []),
    [items, layout.columns, layout.gapUnits],
  );

  // Each column is a one-track grid, not a flex column: cards use `self-start`, which in a flex
  // column is the horizontal axis and would shrink them to their content width.
  return (
    <div ref={ref} className={cn("flex items-start gap-3", className)} {...rest}>
      {columns.map((col, i) => (
        <div key={i} className="grid min-w-0 flex-1 basis-0 grid-cols-1 content-start gap-3">
          {col.map((item) => (
            <Fragment key={item.key}>{item.render()}</Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
