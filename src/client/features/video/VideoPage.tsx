import { useCallback, useEffect, useMemo } from "react";
import { CircleAlert } from "lucide-react";
import type { Generation } from "@shared/types";
import { VIDEO_EXAMPLES } from "@/lib/examples";
import { cardAspectRatio, skeletonItems, type MasonryItem } from "@/lib/masonry";
import { useGenerationList, useGenerations, useListState, usePage, usePendingGenerations } from "@/store/generations";
import { useUi } from "@/store/ui";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { EmptyFeed } from "@/components/EmptyFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenerationCard, GenerationCardSkeleton } from "@/components/GenerationCard";
import { MasonryGrid } from "@/components/MasonryGrid";

const SKELETON_ASPECTS = ["16 / 9", "9 / 16", "16 / 9", "1 / 1", "16 / 9", "16 / 9"];
const SKELETON_ITEMS = skeletonItems(SKELETON_ASPECTS, (a) => <GenerationCardSkeleton aspect={a} />);

function RenderingStatus() {
  const pending = usePendingGenerations("video");
  if (pending.length === 0) return null;
  return (
    <p className="mb-4 inline-flex items-center gap-1.5 text-meta tabular-nums" aria-live="polite">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex size-2 rounded-full bg-accent" />
      </span>
      {pending.length} rendering · usually 2–5 min
    </p>
  );
}

/** The video feed: clips newest first (hover to preview), or the empty state with example shots. */
export default function VideoPage() {
  const items = useGenerationList("video");
  const page = usePage({ type: "video" });
  const fetchPage = useGenerations((s) => s.fetchPage);

  // Fetch when there is nothing yet (on mount, and again after the store's `reset`). A failed load waits for "Try again".
  useEffect(() => {
    if (!page.loaded && !page.loading && !page.error) void fetchPage({ type: "video" });
  }, [page.loaded, page.loading, page.error, fetchPage]);

  const ids = useMemo(() => items.map((g) => g.id), [items]);
  const openAt = useCallback((g: Generation) => useUi.getState().openLightbox(ids, Math.max(0, ids.indexOf(g.id))), [ids]);
  const cards = useMemo<MasonryItem[]>(
    () =>
      items.map((g) => ({
        key: g.id,
        aspect: cardAspectRatio(g),
        render: () => <GenerationCard generation={g} onOpen={openAt} />,
      })),
    [items, openAt],
  );

  const hasItems = items.length > 0;
  const { initialLoading, loadFailed, showEmpty } = useListState(page, hasItems);

  return (
    <Page className="flex flex-1 flex-col">
      {initialLoading ? <MasonryGrid items={SKELETON_ITEMS} aria-busy="true" aria-label="Loading videos" /> : null}

      {loadFailed ? (
        <EmptyState
          icon={<CircleAlert />}
          title="Couldn't load your videos"
          description={page.error}
          action={
            <Button onClick={() => void fetchPage({ type: "video" })} loading={page.loading}>
              Try again
            </Button>
          }
          className="flex-1"
        />
      ) : null}

      {showEmpty ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <EmptyFeed
            title="Your video runs land here"
            description="Describe the shot below, pick a model, press Generate. Every finished run lands in your library."
            examples={VIDEO_EXAMPLES}
            onExample={(prompt) => useUi.getState().setDraft({ type: "video", prompt })}
          />
        </div>
      ) : null}

      {hasItems ? (
        <>
          <RenderingStatus />
          <MasonryGrid items={cards} />
          {page.nextCursor ? (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={page.loading} onClick={() => void fetchPage({ type: "video", more: true })}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
