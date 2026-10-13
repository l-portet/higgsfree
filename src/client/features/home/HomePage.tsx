import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Clapperboard, Image, LayoutGrid, type LucideIcon } from "lucide-react";
import type { Generation } from "@shared/types";
import { useGenerationList, useGenerations, useListState, usePage } from "@/store/generations";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/cn";
import { Page } from "@/components/layout/Page";
import { LinkButton } from "@/components/ui/Button";
import { GenerationCard, GenerationCardSkeleton } from "@/components/GenerationCard";

const TILES: { to: string; icon: LucideIcon; chip: string; title: string; text: string }[] = [
  {
    to: "/image",
    icon: Image,
    chip: "Image",
    title: "Text & image to image",
    text: "Nano Banana Pro, GPT Image, Krea. Reference images, batches of four, 1K to 4K.",
  },
  {
    to: "/video",
    icon: Clapperboard,
    chip: "Video",
    title: "Text & image to video",
    text: "Seedance, Kling, Veo, Sora, Wan. First and last frame, native audio, up to 30s.",
  },
  {
    to: "/assets",
    icon: LayoutGrid,
    chip: "Library",
    title: "Everything you made",
    text: "Every generation with its prompt, options and cost. Stored locally, searchable, reusable.",
  },
];

function FeatureTile({ to, icon: Icon, chip, title, text }: (typeof TILES)[number]) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col justify-between gap-6 rounded-lg border border-border bg-surface p-4 transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
    >
      <div className="flex items-start justify-between">
        <span className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-3 text-fg">
          <Icon size={18} aria-hidden="true" />
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted transition-colors duration-150 group-hover:bg-surface-3">
          <Icon size={12} aria-hidden="true" />
          {chip}
        </span>
      </div>
      <div>
        <h3 className="text-heading">{title}</h3>
        <p className="mt-1 text-body text-fg-muted">{text}</p>
      </div>
      <ArrowUpRight
        size={16}
        className="absolute bottom-4 right-4 text-fg-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}

function Section({ title, aside, className, children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={className}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function HomePage() {
  const all = useGenerationList();
  const recent = useMemo(() => all.slice(0, 8), [all]);
  const page = usePage({});
  const fetchPage = useGenerations((s) => s.fetchPage);
  const server = useSettings((s) => s.server);

  // The default page size, same list key as Assets: a smaller fetch here would block or truncate that page.
  useEffect(() => {
    void fetchPage({});
  }, [fetchPage]);
  useEffect(() => {
    if (server === "online" && !page.loaded && !page.loading) void fetchPage({});
  }, [server, page.loaded, page.loading, fetchPage]);

  const ids = useMemo(() => recent.map((g) => g.id), [recent]);
  const openAt = useCallback((g: Generation) => useUi.getState().openLightbox(ids, Math.max(0, ids.indexOf(g.id))), [ids]);
  const { initialLoading: loading } = useListState(page, recent.length > 0);

  // Once there is work, the feed comes first and the hero steps down (a tool you open daily, not a landing page).
  // While the first page loads we assume the common case so returning users don't see the layout flip.
  const feedFirst = recent.length > 0 || loading;

  const tiles = (
    <div className={cn("grid gap-3 sm:grid-cols-3", feedFirst && "mt-10")}>
      {TILES.map((t) => (
        <FeatureTile key={t.to} {...t} />
      ))}
    </div>
  );

  const recentSection = (
    <Section
      title="Recent"
      className={feedFirst ? undefined : "mt-14"}
      aside={
        <Link to="/assets" className="inline-flex items-center gap-1 text-body text-fg-muted transition-colors hover:text-fg">
          View all <ArrowRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      {loading ? (
        <div className="edge-fade-x -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="w-[200px] shrink-0">
              <GenerationCardSkeleton aspect="3 / 4" />
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-body text-fg-muted">Nothing here yet.</p>
          <Link to="/image" className="mt-1 inline-block text-body font-medium text-fg underline-offset-4 hover:underline">
            Generate your first image →
          </Link>
        </div>
      ) : (
        <div className="edge-fade-x -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {recent.map((g) => (
            <div key={g.id} className="w-[200px] shrink-0 sm:w-[220px]">
              <GenerationCard generation={g} onOpen={openAt} showType />
            </div>
          ))}
        </div>
      )}
    </Section>
  );

  return (
    <Page className="pb-16">
      <section className={feedFirst ? "pb-10 pt-8 sm:pt-14" : "pb-12 pt-10 sm:pt-20"}>
        <h1 className={cn("text-display max-w-[12ch] text-fg", feedFirst ? "text-[40px] sm:text-[56px]" : "text-[44px] sm:text-[72px]")}>
          AI-native creative suite, <span className="text-accent">open.</span>
        </h1>
        <p className="mt-5 max-w-xl text-lead">
          Nano Banana, Seedance, Kling, Veo and more, from one self-hosted studio. Bring your own OpenRouter key;
          everything you make stays on your machine.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton to="/image" variant="primary" size="lg" leftIcon={<Image />}>
            Create image
          </LinkButton>
          <LinkButton to="/video" variant="secondary" size="lg" leftIcon={<Clapperboard />}>
            Create video
          </LinkButton>
        </div>
      </section>

      {feedFirst ? (
        <>
          {recentSection}
          {tiles}
        </>
      ) : (
        <>
          {tiles}
          {recentSection}
        </>
      )}
    </Page>
  );
}
