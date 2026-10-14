/*
 * Route-shaped fallbacks, shown while a page's chunk loads (first visit only; navigations keep the previous
 * page until the next one is ready). Each mirrors its page's layout so nothing jumps when it resolves.
 */
import { Page } from "@/components/layout/Page";
import { Skeleton } from "@/components/ui/Skeleton";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]";
const BUSY = { "aria-busy": true, "aria-label": "Loading" } as const;

function CardGrid({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4] rounded-card" />
      ))}
    </div>
  );
}

/** The feed views (Image, Video, Favorites) are a grid under the floating nav. */
export function FeedFallback() {
  return (
    <Page {...BUSY} className="flex flex-1 flex-col">
      <CardGrid />
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
