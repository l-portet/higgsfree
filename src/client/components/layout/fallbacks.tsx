/*
 * Route-shaped fallbacks, shown while a page's chunk loads (first visit only; navigations keep the previous
 * page until the next one is ready). Each mirrors its page's layout so nothing jumps when it resolves.
 */
import { FEED_GRID_CLASSES } from "@/components/FeedGrid";
import { Page } from "@/components/layout/Page";
import { Skeleton } from "@/components/ui/Skeleton";

const BUSY = { "aria-busy": true, "aria-label": "Loading" } as const;

function CardGrid({ count = 8, aspect = "3 / 4" }: { count?: number; aspect?: string }) {
  return (
    <div className={FEED_GRID_CLASSES}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="rounded-card" style={{ aspectRatio: aspect }} />
      ))}
    </div>
  );
}

/**
 * The feed views (Image, Video, Favorites) are a grid under the floating nav; the feeds pass their cell
 * shape, and Video its status line ("2 rendering", "12 videos") so the grid lands where it will stay.
 */
export function FeedFallback({ aspect, statusLine }: { aspect?: string; statusLine?: boolean }) {
  return (
    <Page {...BUSY} className="flex flex-1 flex-col">
      {statusLine ? <div aria-hidden="true" className="mb-4 h-5" /> : null}
      <CardGrid aspect={aspect} />
    </Page>
  );
}

/** Count line + chip toolbar, then the grid. */
export function AssetsFallback() {
  return (
    <Page {...BUSY} className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-20 rounded-control" />
      </div>
      <div className="mb-5 flex items-center gap-1.5">
        <Skeleton className="h-9 w-16 rounded-control" />
        <Skeleton className="h-9 w-24 rounded-control" />
        <Skeleton className="h-9 w-24 rounded-control" />
      </div>
      <CardGrid />
    </Page>
  );
}

/** Title + three card blocks in the narrow settings column. */
export function PlainFallback() {
  return (
    <Page {...BUSY}>
      <Skeleton className="h-[22px] w-24" />
    </Page>
  );
}
