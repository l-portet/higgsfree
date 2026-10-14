import { useCallback, useEffect, useMemo } from "react";
import { CircleAlert } from "lucide-react";
import type { Generation } from "@shared/types";
import { IMAGE_EXAMPLES } from "@/lib/examples";
import { useGenerationList, useGenerations, useListState, usePage } from "@/store/generations";
import { useUi } from "@/store/ui";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { EmptyFeed } from "@/components/EmptyFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { FEED_CELL, FeedGrid } from "@/components/FeedGrid";
import { GenerationCard, GenerationCardSkeleton } from "@/components/GenerationCard";

const CELL = FEED_CELL.image;
const SKELETON_COUNT = 8;

/** The image feed: your runs newest first in equal square cells, or the empty state with example prompts. The composer is global. */
export default function ImagePage() {
  const items = useGenerationList("image");
  const page = usePage({ type: "image" });
  const fetchPage = useGenerations((s) => s.fetchPage);

  // Fetch when there is nothing yet (on mount, and again after the store's `reset`). A failed load waits for "Try again".
  useEffect(() => {
    if (!page.loaded && !page.loading && !page.error) void fetchPage({ type: "image" });
  }, [page.loaded, page.loading, page.error, fetchPage]);

  const ids = useMemo(() => items.map((g) => g.id), [items]);
  const openAt = useCallback((g: Generation) => useUi.getState().openLightbox(ids, Math.max(0, ids.indexOf(g.id))), [ids]);

  const hasItems = items.length > 0;
  const { initialLoading, loadFailed, showEmpty } = useListState(page, hasItems);

  return (
    <Page className="flex flex-1 flex-col">
      {initialLoading ? (
        <FeedGrid aria-busy="true" aria-label="Loading images">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <GenerationCardSkeleton key={i} aspect={CELL} />
          ))}
        </FeedGrid>
      ) : null}

      {loadFailed ? (
        <EmptyState
          icon={<CircleAlert />}
          title="Couldn't load your images"
          description={page.error}
          action={
            <Button onClick={() => void fetchPage({ type: "image" })} loading={page.loading}>
              Try again
            </Button>
          }
          className="flex-1"
        />
      ) : null}

      {showEmpty ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <EmptyFeed
            title="Your image runs land here"
            description="Describe a subject below, pick a model, press Generate. Every finished run lands in your library."
            examples={IMAGE_EXAMPLES}
            onExample={(prompt) => useUi.getState().setDraft({ type: "image", prompt })}
          />
        </div>
      ) : null}

      {hasItems ? (
        <>
          <FeedGrid>
            {items.map((g) => (
              <GenerationCard key={g.id} generation={g} onOpen={openAt} cell={CELL} />
            ))}
          </FeedGrid>
          {page.nextCursor ? (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={page.loading} onClick={() => void fetchPage({ type: "image", more: true })}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
