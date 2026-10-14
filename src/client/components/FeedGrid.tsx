import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * The cell shape of each feed: the composers' default ratios, so a typical run fills its cell. Other
 * ratios are cropped to fit (`object-cover`); the lightbox shows the whole frame.
 */
export const FEED_CELL = { image: "1 / 1", video: "16 / 9" } as const;

/** Auto-filled columns, the widths the masonry used (160 px minimum, 260 px from `sm`). */
export const FEED_GRID_CLASSES = "grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]";

/**
 * The Image and Video feeds: every card in an identical cell, whatever its output's ratio or its state
 * (rendering, done, failed), so nothing resizes or reshuffles when a run completes. A new run takes
 * the first cell and the others move along by one, in reading order.
 */
export function FeedGrid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(FEED_GRID_CLASSES, className)} {...props} />;
}
