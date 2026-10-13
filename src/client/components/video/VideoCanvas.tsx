import { useCallback, useMemo, type ReactNode } from "react";
import { Check, CircleAlert, Coins, ImagePlus, Lightbulb, Play, Server, Waypoints } from "lucide-react";
import type { Generation } from "@shared/types";
import { cn } from "@/lib/cn";
import { cardAspectRatio, skeletonItems, type MasonryItem } from "@/lib/masonry";
import { useGenerationList, useGenerations, useListState, usePage, usePendingGenerations } from "@/store/generations";
import { useUi } from "@/store/ui";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { GenerationCard, GenerationCardSkeleton } from "@/components/GenerationCard";
import { MasonryGrid } from "@/components/MasonryGrid";
import { ProviderTile } from "@/components/ProviderTile";

export type CanvasTab = "history" | "how";

/* CSS-only illustrations for the three "how it works" cards. Decorative: the parent is aria-hidden. */

/** Step 1: a dashed 16:9 drop frame. */
function AddImageArt() {
  return (
    <div className="flex size-full items-center justify-center p-4">
      <div className="flex aspect-video w-full max-w-[260px] items-center justify-center rounded-md border border-dashed border-border-strong bg-surface/60">
        <ImagePlus size={28} className="text-fg-faint" />
      </div>
    </div>
  );
}

function MockModelRow({ provider, selected }: { provider: string; selected?: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full max-w-[260px] items-center gap-2.5 rounded-md border p-2",
        selected ? "border-border-strong bg-surface-3" : "border-border bg-surface/60",
      )}
    >
      <ProviderTile provider={provider} size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-2 w-[62%] rounded-full bg-fg/15" />
        <span className="h-1.5 w-[38%] rounded-full bg-fg/8" />
      </div>
      {selected ? <Check size={14} className="shrink-0 text-accent" /> : null}
    </div>
  );
}

/** Step 2: two picker rows, the second one selected. */
function ChooseModelArt() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 p-4">
      <MockModelRow provider="bytedance" />
      <MockModelRow provider="kwaivgi" selected />
    </div>
  );
}

/** Step 3: a finished 16:9 clip with a lime play control. */
function GetVideoArt() {
  return (
    <div className="flex size-full items-center justify-center p-4">
      <div className="flex aspect-video w-full max-w-[260px] items-center justify-center rounded-md border border-border bg-gradient-to-br from-surface-3 to-surface">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent text-on-accent">
          <Play size={16} fill="currentColor" className="ml-0.5" />
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  { art: AddImageArt, title: "Add image", text: "Drop or paste a first frame, or start from a prompt." },
  { art: ChooseModelArt, title: "Choose model", text: "Seedance, Kling, Veo, Sora, Wan, each with its real limits." },
  { art: GetVideoArt, title: "Get video", text: "Rendered in minutes on your key, stored on this machine." },
];

function VideoEmptyState() {
  return (
    <div className="flex flex-col items-start rounded-2xl bg-surface p-6 text-left sm:p-8">
      <h1 className="text-display text-[32px] sm:text-[40px]">
        <span className="block text-fg">Make videos</span>
        <span className="block text-accent">in one click</span>
      </h1>
      <p className="mt-3 max-w-lg text-meta">
        Animate an image or describe a scene, pick a model and hit Generate. Jobs run on the server and show up here
        as they render.
      </p>
      {/* Between md and lg the canvas sits beside a 280px panel and is too narrow for three columns:
          the cards turn into art-left rows there and go back to columns at lg. */}
      <ol className="mt-8 grid w-full gap-4 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
        {STEPS.map(({ art: Art, title, text }) => (
          <li key={title} className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface md:max-lg:flex-row">
            <div
              className={cn(
                "aspect-[4/3] rounded-t-lg border-b border-border bg-surface-2",
                "md:max-lg:w-44 md:max-lg:shrink-0 md:max-lg:rounded-l-lg md:max-lg:rounded-tr-none md:max-lg:border-b-0 md:max-lg:border-r",
              )}
              aria-hidden="true"
            >
              <Art />
            </div>
            <div className="p-4 md:max-lg:self-center">
              <h2 className="text-heading">{title}</h2>
              <p className="mt-1 text-meta">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Explainer({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-[7px] border border-border bg-surface-2 text-fg-muted [&_svg]:size-3.5">
          {icon}
        </span>
        <h3 className="text-body font-semibold text-fg">{title}</h3>
      </div>
      <div className="text-body text-fg-muted">{children}</div>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Explainer icon={<Waypoints />} title="Models via OpenRouter">
          Every model runs through OpenRouter's video API on your own key. The estimate uses the per-second rate for
          the model, duration and resolution you picked.
        </Explainer>
        <Explainer icon={<Server />} title="Jobs run on the server">
          Submitting returns right away. The server polls the provider, saves the MP4 to your data directory and
          pushes updates live, even if you close the tab.
        </Explainer>
        <Explainer icon={<Coins />} title="Cost is recorded">
          The provider's real cost is saved with each generation and shown on the card, in the lightbox and in
          Assets.
        </Explainer>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[7px] border border-border bg-surface-2 text-fg-muted">
            <Lightbulb size={14} aria-hidden="true" />
          </span>
          <h3 className="text-body font-semibold text-fg">Prompting tips</h3>
        </div>
        <ul className="grid gap-x-6 gap-y-2.5 text-body text-fg-muted md:grid-cols-2">
          <li className="flex gap-2.5">
            <span className="mt-[9px] size-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>
              <span className="text-fg">Anchor wardrobe colors per shot.</span> In multi-shot prompts, "red jacket" in
              shot 1 must read "red jacket" in shot 3 or the model drifts.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-[9px] size-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>
              <span className="text-fg">Use a first frame for identity.</span> Faces and products hold better from an
              image than from words. Kling 3.0 Pro and Hailuo 3 accept real faces; Seedance rejects them.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-[9px] size-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>
              <span className="text-fg">Seedance 2.5 renders up to 30s in one shot.</span> Describe the whole arc (setup,
              action, payoff) in a single prompt instead of chaining clips.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-[9px] size-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>
              <span className="text-fg">Provider errors are shown verbatim.</span> For unverified models the error usually
              lists the supported values. Adjust and retry from the card.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

const SKELETON_ASPECTS = ["16 / 9", "9 / 16", "16 / 9", "1 / 1", "16 / 9", "16 / 9"];
const SKELETON_ITEMS = skeletonItems(SKELETON_ASPECTS, (a) => <GenerationCardSkeleton aspect={a} />);
/** Narrower than the other feeds: the canvas shares the row with the 280px form panel. */
const MIN_COLUMN = { base: 160, sm: 240 };

function History() {
  const items = useGenerationList("video");
  const page = usePage({ type: "video" });
  const fetchPage = useGenerations((s) => s.fetchPage);

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

  const { initialLoading, loadFailed, showEmpty } = useListState(page, items.length > 0);

  if (initialLoading) {
    return <MasonryGrid items={SKELETON_ITEMS} minColumn={MIN_COLUMN} aria-busy="true" aria-label="Loading videos" />;
  }

  if (loadFailed) {
    return (
      <EmptyState
        icon={<CircleAlert />}
        title="Couldn't load your videos"
        description={page.error}
        action={
          <Button onClick={() => void fetchPage({ type: "video" })} loading={page.loading}>
            Try again
          </Button>
        }
      />
    );
  }

  if (showEmpty) return <VideoEmptyState />;

  return (
    <>
      <MasonryGrid items={cards} minColumn={MIN_COLUMN} />
      {page.nextCursor ? (
        <div className="mt-8 flex justify-center">
          <Button variant="secondary" loading={page.loading} onClick={() => void fetchPage({ type: "video", more: true })}>
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}

function RenderingStatus() {
  const pending = usePendingGenerations("video");
  if (pending.length === 0) return null;
  return (
    <p className="inline-flex items-center gap-1.5 text-meta tabular-nums" aria-live="polite">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex size-2 rounded-full bg-accent" />
      </span>
      {pending.length} rendering · 2–5 min
    </p>
  );
}

export interface VideoCanvasProps {
  tab: CanvasTab;
  onTabChange: (tab: CanvasTab) => void;
  className?: string;
  id?: string;
}

export function VideoCanvas({ tab, onTabChange, className, id }: VideoCanvasProps) {
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v === "how" ? "how" : "history")} className={cn("flex min-w-0 flex-col", className)} id={id}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <TabsList variant="underline" aria-label="Canvas" className="border-b-0">
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="how">How it works</TabsTrigger>
        </TabsList>
        <RenderingStatus />
      </div>
      <TabsContent value="history" className="flex-1">
        <History />
      </TabsContent>
      <TabsContent value="how">
        <HowItWorks />
      </TabsContent>
    </Tabs>
  );
}
