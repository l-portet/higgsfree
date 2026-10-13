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
        <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
      ))}
    </div>
  );
}

function TitleBlock({ description = true }: { description?: boolean }) {
  return (
    <div>
      <Skeleton className="h-[22px] w-24" />
      {description ? <Skeleton className="mt-1.5 h-4 w-40" /> : null}
    </div>
  );
}

/** Hero lines + CTAs + three feature tiles. */
export function HomeFallback() {
  return (
    <Page {...BUSY} className="pb-16">
      <div className="pb-12 pt-10 sm:pt-20">
        <Skeleton className="h-[42px] w-[min(100%,560px)] sm:h-[68px]" />
        <Skeleton className="mt-2 h-[42px] w-[min(100%,300px)] sm:h-[68px]" />
        <Skeleton className="mt-5 h-5 w-[min(100%,480px)]" />
        <div className="mt-8 flex gap-3">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[140px] rounded-lg" />
        ))}
      </div>
    </Page>
  );
}

/** Grid only (the page has no title) plus the fixed prompt bar's footprint at the bottom. */
export function ImageFallback() {
  return (
    <Page {...BUSY} className="flex flex-1 flex-col pb-[calc(var(--prompt-bar-h,152px)+24px)]">
      <CardGrid />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
        <Skeleton className="h-[108px] w-full max-w-[960px] rounded-2xl" />
      </div>
    </Page>
  );
}

/** Settings panel (mode tabs, references, prompt) beside the canvas tab row. */
export function VideoFallback() {
  return (
    <Page {...BUSY} className="flex flex-1 flex-col">
      <div className="grid flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-[42px] rounded-[10px]" />
          <Skeleton className="h-[300px] rounded-lg" />
          <Skeleton className="h-[180px] rounded-lg" />
        </div>
        <div className="min-h-[420px]">
          <div className="flex h-9 items-center gap-5 border-b border-border">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
      </div>
    </Page>
  );
}

/** Title + count, chip toolbar, grid. */
export function AssetsFallback() {
  return (
    <Page {...BUSY} className="flex flex-1 flex-col pb-16">
      <div className="mb-4">
        <TitleBlock />
      </div>
      <div className="mb-5 flex items-center gap-1.5">
        <Skeleton className="h-8 w-14 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <CardGrid />
    </Page>
  );
}

/** Title + three card blocks in the narrow settings column. */
export function SettingsFallback() {
  return (
    <Page {...BUSY} className="max-w-[760px] pb-16">
      <div className="mb-6">
        <TitleBlock />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[220px] rounded-lg" />
        <Skeleton className="h-[160px] rounded-lg" />
        <Skeleton className="h-[140px] rounded-lg" />
      </div>
    </Page>
  );
}

export function PlainFallback() {
  return (
    <Page {...BUSY}>
      <TitleBlock description={false} />
    </Page>
  );
}
