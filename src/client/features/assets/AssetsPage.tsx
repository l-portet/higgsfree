import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { CircleAlert, Clapperboard, Image as ImageIcon, LayoutGrid, SearchX, SquareCheck } from "lucide-react";
import type { Generation } from "@shared/types";
import { downloadFilename } from "@/lib/files";
import { formatBytes, pluralize } from "@/lib/format";
import { cardAspectRatio, skeletonItems, type MasonryItem } from "@/lib/masonry";
import { readJson, writeJson } from "@/lib/storage";
import { describeApiError } from "@/lib/api";
import { listKey, useGenerations, useListState, type PageState } from "@/store/generations";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Page, PageHeader } from "@/components/layout/Page";
import { Button, LinkButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenerationCard, GenerationCardSkeleton } from "@/components/GenerationCard";
import { MasonryGrid } from "@/components/MasonryGrid";
import { AssetsToolbar } from "@/components/assets/AssetsToolbar";
import { SelectableCard } from "@/components/assets/SelectableCard";
import { SelectionBar } from "@/components/assets/SelectionBar";
import {
  STATUS_LABEL,
  isTypeFilter,
  matchesStatus,
  queriesFor,
  typeNoun,
  type StatusFilter,
  type TypeFilter,
} from "@/components/assets/filters";

const STORAGE_KEY = "oh.assets.filter";
const SKELETON_ASPECTS = ["3 / 4", "16 / 9", "1 / 1", "3 / 4", "9 / 16", "4 / 3", "1 / 1", "16 / 9"];
const SKELETON_ITEMS = skeletonItems(SKELETON_ASPECTS, (a) => <GenerationCardSkeleton aspect={a} />);
const EMPTY_PAGE: PageState = { loading: false, loaded: false };
const DELETE_CONCURRENCY = 4;
const DOWNLOAD_GAP_MS = 350;

interface Persisted {
  type?: TypeFilter;
}

/** Everything loaded in the store that matches the current type + status filter (newest first). */
function useAssetList(type: TypeFilter, status: StatusFilter): Generation[] {
  return useGenerations(
    useShallow((s) => {
      const out: Generation[] = [];
      for (const id of s.ids) {
        const g = s.byId[id];
        if (!g) continue;
        if (type !== "all" && g.type !== type) continue;
        if (!matchesStatus(g.status, status)) continue;
        out.push(g);
      }
      return out;
    }),
  );
}

/** Merged paging state for the (1–2) API queries behind the current filter. */
function useMergedPage(type: TypeFilter, status: StatusFilter): PageState {
  const queries = useMemo(() => queriesFor(type, status), [type, status]);
  const pages = useGenerations(useShallow((s) => queries.map((q) => s.pages[listKey(q)] ?? EMPTY_PAGE)));
  return useMemo(
    () => ({
      loading: pages.some((p) => p.loading),
      loaded: pages.every((p) => p.loaded),
      nextCursor: pages.find((p) => p.nextCursor)?.nextCursor,
      error: pages.find((p) => p.error)?.error,
    }),
    [pages],
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
}

function triggerDownload(g: Generation): boolean {
  const out = g.output;
  if (!out) return false;
  const a = document.createElement("a");
  a.href = out.url;
  a.download = downloadFilename(g.id, out.mime, out.url);
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function AssetsPage() {
  const persisted = useMemo(() => readJson<Persisted>(STORAGE_KEY, {}), []);
  const [type, setType] = useState<TypeFilter>(isTypeFilter(persisted.type) ? persisted.type : "all");
  const [status, setStatus] = useState<StatusFilter>("any");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const items = useAssetList(type, status);
  const page = useMergedPage(type, status);
  const fetchPage = useGenerations((s) => s.fetchPage);
  const server = useSettings((s) => s.server);
  const queryKey = `${type}:${status}`;

  useEffect(() => {
    writeJson(STORAGE_KEY, { type } satisfies Persisted);
  }, [type]);

  // Fetch (or refresh) the first page of every query behind the current filter.
  useEffect(() => {
    for (const q of queriesFor(type, status)) void fetchPage(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, fetchPage]);

  // First load failed while the server was down → fetch once it's back.
  useEffect(() => {
    if (server === "online" && !page.loaded && !page.loading) {
      for (const q of queriesFor(type, status)) void fetchPage(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, page.loaded, page.loading, queryKey, fetchPage]);

  const loadMore = () => {
    for (const q of queriesFor(type, status)) void fetchPage({ ...q, more: true });
  };

  // ---------- Client-side search ----------
  const terms = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const visible = useMemo(() => {
    if (terms.length === 0) return items;
    return items.filter((g) => {
      const hay = `${g.prompt} ${g.modelName} ${g.model}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [items, terms]);
  const visibleIds = useMemo(() => visible.map((g) => g.id), [visible]);

  // ---------- Header count ----------
  const bytes = useMemo(() => visible.reduce((n, g) => n + (g.output?.bytes ?? 0), 0), [visible]);
  const countLabel = useMemo(() => {
    if (!page.loaded && items.length === 0) return "Every image and video you've generated, in one place.";
    const more = Boolean(page.nextCursor);
    const n = visible.length;
    const head = terms.length
      ? `${n} of ${items.length} ${typeNoun(type, items.length)}${more ? " loaded" : ""} match`
      : `${n} ${typeNoun(type, n)}${more ? " loaded" : ""}`;
    return bytes > 0 ? `${head} · ${formatBytes(bytes)}` : head;
  }, [page.loaded, page.nextCursor, items.length, visible.length, terms.length, type, bytes]);

  // ---------- Lightbox ----------
  const openAt = useCallback(
    (g: Generation) => useUi.getState().openLightbox(visibleIds, Math.max(0, visibleIds.indexOf(g.id))),
    [visibleIds],
  );

  // ---------- Selection mode ----------
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const lastToggled = useRef<string | null>(null);

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
    lastToggled.current = null;
  }, []);

  // Keep the selection a subset of what's on screen.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of visibleIds) if (prev.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  const toggle = useCallback(
    (g: Generation, shiftKey: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const anchor = lastToggled.current;
        const from = anchor ? visibleIds.indexOf(anchor) : -1;
        const to = visibleIds.indexOf(g.id);
        if (shiftKey && from >= 0 && to >= 0) {
          const [a, b] = from < to ? [from, to] : [to, from];
          const on = !prev.has(g.id);
          for (let i = a; i <= b; i++) {
            const id = visibleIds[i];
            if (!id) continue;
            if (on) next.add(id);
            else next.delete(id);
          }
        } else if (next.has(g.id)) {
          next.delete(g.id);
        } else {
          next.add(g.id);
        }
        return next;
      });
      lastToggled.current = g.id;
    },
    [visibleIds],
  );

  const selectAll = useCallback(() => setSelected(new Set(visibleIds)), [visibleIds]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedItems = useMemo(() => visible.filter((g) => selected.has(g.id)), [visible, selected]);

  // Masonry items in `visible` order (the lightbox and shift-range order). Only the toggled cards re-render.
  const showType = type === "all";
  const cards = useMemo<MasonryItem[]>(
    () =>
      visible.map((g) => ({
        key: g.id,
        aspect: cardAspectRatio(g),
        render: () =>
          selecting ? (
            <SelectableCard generation={g} selected={selected.has(g.id)} onToggle={toggle} showType={showType} />
          ) : (
            <GenerationCard generation={g} onOpen={openAt} showType={showType} />
          ),
      })),
    [visible, selecting, selected, toggle, openAt, showType],
  );
  const downloadable = useMemo(() => selectedItems.filter((g) => g.status === "completed" && g.output), [selectedItems]);

  const downloadSelected = async () => {
    if (downloadable.length === 0) return;
    setDownloading(true);
    try {
      let n = 0;
      for (const g of downloadable) {
        if (triggerDownload(g)) n++;
        if (n < downloadable.length) await sleep(DOWNLOAD_GAP_MS);
      }
      toast.success(`Downloading ${pluralize(n, "file")}`, {
        description: n > 1 ? "Your browser may ask to allow multiple downloads." : undefined,
      });
    } finally {
      setDownloading(false);
    }
  };

  const deleteSelected = async () => {
    const ids = selectedItems.map((g) => g.id);
    if (ids.length === 0) return;
    setDeleting(true);
    const failures: string[] = [];
    try {
      const queue = [...ids];
      const worker = async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          try {
            await useGenerations.getState().deleteGeneration(id);
          } catch (err) {
            failures.push(describeApiError(err));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, ids.length) }, worker));
      const ok = ids.length - failures.length;
      if (failures.length === 0) toast.success(`Deleted ${pluralize(ok, "item")}`);
      else toast.error(`Deleted ${ok} of ${ids.length}`, { description: failures[0] });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
      if (failures.length === 0) exitSelection();
    }
  };

  // ---------- Keyboard: "/" focuses search, Esc exits selection, ⌘/Ctrl+A selects all loaded ----------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (!selecting) return;
      if (e.key === "Escape" && !confirmDelete && !useUi.getState().lightbox) {
        if (isEditable(e.target)) return; // the search box handles its own Esc
        e.preventDefault();
        exitSelection();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !isEditable(e.target)) {
        e.preventDefault();
        selectAll();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecting, confirmDelete, exitSelection, selectAll]);

  // ---------- Render states ----------
  const hasItems = items.length > 0;
  const { initialLoading, loadFailed, showEmpty } = useListState(page, hasItems);
  const noMatches = hasItems && visible.length === 0;

  const emptyState = (() => {
    if (status !== "any") {
      const what = type === "all" ? "generations" : `${type}s`;
      return (
        <EmptyState
          icon={<LayoutGrid />}
          title={`No ${STATUS_LABEL[status].toLowerCase()} ${what}`}
          description={
            status === "rendering"
              ? "Nothing is rendering. New jobs show up here while they run."
              : `Nothing with this status${page.nextCursor ? " in what's loaded" : ""}.`
          }
          action={
            <Button variant="secondary" onClick={() => setStatus("any")}>
              Clear filter
            </Button>
          }
          className="flex-1"
        />
      );
    }
    if (type === "image") {
      return (
        <EmptyState
          icon={<ImageIcon />}
          title="No images yet"
          description="Images you generate land here with their prompt, model, options and cost."
          action={
            <LinkButton to="/image" variant="primary" leftIcon={<ImageIcon />}>
              Create image
            </LinkButton>
          }
          className="flex-1"
        />
      );
    }
    if (type === "video") {
      return (
        <EmptyState
          icon={<Clapperboard />}
          title="No videos yet"
          description="Videos you render land here. Hover to preview, open for the full player."
          action={
            <LinkButton to="/video" variant="primary" leftIcon={<Clapperboard />}>
              Create video
            </LinkButton>
          }
          className="flex-1"
        />
      );
    }
    return (
      <EmptyState
        icon={<LayoutGrid />}
        title="Your library is empty"
        description="Everything you generate is stored on this machine and shows up here."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton to="/image" variant="primary" leftIcon={<ImageIcon />}>
              Create image
            </LinkButton>
            <LinkButton to="/video" variant="secondary" leftIcon={<Clapperboard />}>
              Create video
            </LinkButton>
          </div>
        }
        className="flex-1"
      />
    );
  })();

  return (
    <Page className={selecting ? "flex flex-1 flex-col pb-32 sm:pb-28" : "flex flex-1 flex-col pb-16"}>
      <PageHeader
        title="Assets"
        description={<span className="tabular-nums">{countLabel}</span>}
        className="mb-4"
        actions={
          <Button
            variant={selecting ? "primary" : "secondary"}
            leftIcon={<SquareCheck />}
            aria-pressed={selecting}
            onClick={() => (selecting ? exitSelection() : setSelecting(true))}
            disabled={!hasItems && !selecting}
          >
            {selecting ? "Done" : "Select"}
          </Button>
        }
      />

      <AssetsToolbar
        type={type}
        onTypeChange={setType}
        status={status}
        onStatusChange={setStatus}
        query={query}
        onQueryChange={setQuery}
        searchRef={searchRef}
        className="mb-5"
      />

      {initialLoading ? <MasonryGrid items={SKELETON_ITEMS} aria-busy="true" aria-label="Loading assets" /> : null}

      {loadFailed ? (
        <EmptyState
          icon={<CircleAlert />}
          title="Couldn't load your assets"
          description={page.error}
          action={
            <Button onClick={() => queriesFor(type, status).forEach((q) => void fetchPage(q))} loading={page.loading}>
              Try again
            </Button>
          }
          className="flex-1"
        />
      ) : null}

      {showEmpty ? <div className="flex flex-1 items-center justify-center">{emptyState}</div> : null}

      {noMatches ? (
        <EmptyState
          icon={<SearchX />}
          title={`No matches for “${query.trim()}”`}
          description={`Searches prompt and model across the ${pluralize(items.length, typeNoun(type, 1), typeNoun(type, 2))} loaded so far.`}
          action={
            <Button variant="secondary" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
          className="flex-1"
        />
      ) : null}

      {hasItems && visible.length > 0 ? (
        <>
          <MasonryGrid items={cards} role={selecting ? "group" : undefined} aria-label={selecting ? "Select assets" : undefined} />
          {page.nextCursor ? (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={page.loading} onClick={loadMore}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {selecting ? (
        <SelectionBar
          count={selectedItems.length}
          total={visible.length}
          downloadable={downloadable.length}
          downloading={downloading}
          deleting={deleting}
          onSelectAll={selectAll}
          onClear={clearSelection}
          onDownload={() => void downloadSelected()}
          onDelete={() => setConfirmDelete(true)}
          onExit={exitSelection}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !deleting && setConfirmDelete(o)}
        title={`Delete ${pluralize(selectedItems.length, "item")}?`}
        description="Removes the records and their files. This can't be undone."
        confirmLabel={`Delete ${selectedItems.length}`}
        danger
        loading={deleting}
        onConfirm={deleteSelected}
      />
    </Page>
  );
}
