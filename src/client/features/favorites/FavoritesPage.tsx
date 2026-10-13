import { useCallback, useEffect, useMemo } from "react";
import { CircleAlert } from "lucide-react";
import type { Generation } from "@shared/types";
import { cardAspectRatio, skeletonItems, type MasonryItem } from "@/lib/masonry";
import { useFavoriteList, useGenerations, useListState, usePage } from "@/store/generations";
import { useUi } from "@/store/ui";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { EmptyFeed } from "@/components/EmptyFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenerationCard, GenerationCardSkeleton } from "@/components/GenerationCard";
import { MasonryGrid } from "@/components/MasonryGrid";

const QUERY = { favorite: true } as const;
const SKELETON_ASPECTS = ["3 / 4", "16 / 9", "1 / 1", "3 / 4", "9 / 16", "4 / 3", "1 / 1", "16 / 9"];
const SKELETON_ITEMS = skeletonItems(SKELETON_ASPECTS, (a) => <GenerationCardSkeleton aspect={a} />);

/** Kept runs (the heart on a card), images and videos together, newest first. */
export default function FavoritesPage() {
  const items = useFavoriteList();
  const page = usePage(QUERY);
  const fetchPage = useGenerations((s) => s.fetchPage);

  // Fetch when there is nothing yet (on mount, and again after the store's `reset`). A failed load waits for "Try again".
  useEffect(() => {
    if (!page.loaded && !page.loading && !page.error) void fetchPage(QUERY);
  }, [page.loaded, page.loading, page.error, fetchPage]);

  const ids = useMemo(() => items.map((g) => g.id), [items]);
  const openAt = useCallback((g: Generation) => useUi.getState().openLightbox(ids, Math.max(0, ids.indexOf(g.id))), [ids]);
  const cards = useMemo<MasonryItem[]>(
    () =>
      items.map((g) => ({
        key: g.id,
        aspect: cardAspectRatio(g),
        render: () => <GenerationCard generation={g} onOpen={openAt} showType />,
      })),
    [items, openAt],
  );

  const hasItems = items.length > 0;
  const { initialLoading, loadFailed, showEmpty } = useListState(page, hasItems);

  return (
    <Page className="flex flex-1 flex-col">
      {initialLoading ? <MasonryGrid items={SKELETON_ITEMS} aria-busy="true" aria-label="Loading favorites" /> : null}

      {loadFailed ? (
        <EmptyState
          icon={<CircleAlert />}
          title="Couldn't load your favorites"
          description={page.error}
          action={
            <Button onClick={() => void fetchPage(QUERY)} loading={page.loading}>
              Try again
            </Button>
          }
          className="flex-1"
        />
      ) : null}

      {showEmpty ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <EmptyFeed title="Nothing kept yet" description="Hover a run and press its heart to keep it here. Kept runs stay easy to find as the history grows." />
        </div>
      ) : null}

      {hasItems ? (
        <>
          <MasonryGrid items={cards} />
          {page.nextCursor ? (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={page.loading} onClick={() => void fetchPage({ ...QUERY, more: true })}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
