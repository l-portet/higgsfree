import { useCallback, useEffect, useMemo } from "react";
import { CircleAlert } from "lucide-react";
import type { Generation } from "@shared/types";
import { IMAGE_EXAMPLES } from "@/lib/examples";
import { cardAspectRatio, skeletonItems, type MasonryItem } from "@/lib/masonry";
import { useGenerationList, useGenerations, useListState, usePage } from "@/store/generations";
import { useUi } from "@/store/ui";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { EmptyFeed } from "@/components/EmptyFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenerationCard, GenerationCardSkeleton } from "@/components/GenerationCard";
import { MasonryGrid } from "@/components/MasonryGrid";

const SKELETON_ASPECTS = ["3 / 4", "1 / 1", "4 / 3", "3 / 4", "9 / 16", "1 / 1", "16 / 9", "3 / 4"];
const SKELETON_ITEMS = skeletonItems(SKELETON_ASPECTS, (a) => <GenerationCardSkeleton aspect={a} />);

/** The image feed: your runs newest first, or the empty state with example prompts. The composer is global. */
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
      {initialLoading ? <MasonryGrid items={SKELETON_ITEMS} aria-busy="true" aria-label="Loading images" /> : null}

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
          <MasonryGrid items={cards} />
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
