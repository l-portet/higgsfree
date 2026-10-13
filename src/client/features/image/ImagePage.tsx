import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { Generation, ImageGenerateRequest } from "@shared/types";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { cardAspectRatio, skeletonItems, type MasonryItem } from "@/lib/masonry";
import { useGenerationList, useGenerations, useListState, usePage } from "@/store/generations";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenerationCard, GenerationCardSkeleton } from "@/components/GenerationCard";
import { MasonryGrid } from "@/components/MasonryGrid";
import { PromptBar } from "@/components/PromptBar";
import { CircleAlert } from "lucide-react";

/**
 * Bundled sample stills (`public/samples`, 480 px, ≤60 KB each, generated for this repo).
 * The gradient paints first and stays as the fallback if a file is missing.
 */
const SAMPLE_TILES = [
  { src: "/samples/01.jpg", x: -204, y: 8, r: -8, round: false, bg: "linear-gradient(160deg, #8a5a2b 0%, #3a2a1a 50%, #0e0c10 100%)" },
  { src: "/samples/02.jpg", x: -68, y: -4, r: -3, round: false, bg: "linear-gradient(160deg, #c2622e 0%, #6a2c1c 50%, #160d0c 100%)" },
  { src: "/samples/03.jpg", x: 68, y: -4, r: 3, round: true, bg: "linear-gradient(160deg, #e0a24c 0%, #8a5a2e 50%, #1c120c 100%)" },
  { src: "/samples/04.jpg", x: 204, y: 8, r: 8, round: false, bg: "linear-gradient(160deg, #5d6b62 0%, #2d3631 55%, #0d100e 100%)" },
];

const SKELETON_ASPECTS = ["3 / 4", "1 / 1", "4 / 3", "3 / 4", "9 / 16", "1 / 1", "16 / 9", "3 / 4"];
const SKELETON_ITEMS = skeletonItems(SKELETON_ASPECTS, (a) => <GenerationCardSkeleton aspect={a} />);

function ImageEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      {/* 560×200 cluster; below `sm` the same layout is scaled down instead of re-flowed. */}
      <div className="relative mx-auto mb-8 h-[120px] w-[340px] sm:h-[200px] sm:w-[560px]" aria-hidden="true">
        <div className="absolute inset-0 scale-[0.6] sm:scale-100">
          {SAMPLE_TILES.map((t, i) => (
            <div
              key={t.src}
              className={cn(
                "absolute left-1/2 top-1/2 size-[148px] overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]",
                t.round ? "rounded-full" : "rounded-[18px]",
              )}
              style={{
                transform: `translate(-50%, -50%) translate(${t.x}px, ${t.y}px) rotate(${t.r}deg)`,
                background: t.bg,
                zIndex: i === 2 ? 3 : i === 0 ? 1 : 2,
              }}
            >
              <img src={t.src} alt="" loading="eager" decoding="async" draggable={false} className="size-full object-cover" />
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10",
                  t.round ? "rounded-full" : "rounded-[18px]",
                )}
              />
            </div>
          ))}
        </div>
      </div>
      <h1 className="text-display text-[28px] sm:text-[40px]">
        <span className="block text-fg">Start creating with</span>
        <span className="block text-accent">higgsfree</span>
      </h1>
      <p className="mt-4 max-w-md text-lead">
        Describe a scene, pick a model and hit Generate. Runs on your OpenRouter key; every image stays in your own storage.
      </p>
    </div>
  );
}

export default function ImagePage() {
  const items = useGenerationList("image");
  const page = usePage({ type: "image" });
  const fetchPage = useGenerations((s) => s.fetchPage);
  const server = useSettings((s) => s.server);

  useEffect(() => {
    void fetchPage({ type: "image" });
  }, [fetchPage]);

  // First load failed while the server was down → fetch once it's back.
  useEffect(() => {
    if (server === "online" && !page.loaded && !page.loading) void fetchPage({ type: "image" });
  }, [server, page.loaded, page.loading, fetchPage]);

  // The prompt bar is fixed; it reports its height so the grid's bottom padding always clears it (MED-8).
  const pageRef = useRef<HTMLDivElement>(null);
  const onBarHeight = useCallback((h: number) => {
    pageRef.current?.style.setProperty("--prompt-bar-h", `${Math.ceil(h)}px`);
  }, []);

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

  const handleSubmit = async (req: ImageGenerateRequest) => {
    try {
      const res = await api.generateImage(req);
      useGenerations.getState().upsert(res.generations);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(`Generating ${pluralize(res.generations.length, "image")}…`);
    } catch (err) {
      toast.error("Generation failed", { description: describeApiError(err) });
    }
  };

  const hasItems = items.length > 0;
  const { initialLoading, loadFailed, showEmpty } = useListState(page, hasItems);

  return (
    <Page ref={pageRef} className="flex flex-1 flex-col pb-[calc(var(--prompt-bar-h,152px)+24px)]">
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
        <div className="flex flex-1 items-center justify-center">
          <ImageEmptyState />
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

      <PromptBar onSubmit={handleSubmit} onHeightChange={onBarHeight} />
    </Page>
  );
}
