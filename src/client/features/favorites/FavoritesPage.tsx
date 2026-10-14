import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { ArrowLeft, CircleAlert, FolderOpen, FolderPlus, FolderX, Pencil, Trash2 } from "lucide-react";
import type { Folder, Generation } from "@shared/types";
import { describeApiError } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { cardAspectRatio, skeletonItems, type MasonryItem } from "@/lib/masonry";
import { useFolderList, useFolders } from "@/store/folders";
import { useFavoriteList, useGenerations, useListState, usePage, type ListQuery } from "@/store/generations";
import { useUi } from "@/store/ui";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyFeed } from "@/components/EmptyFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { GenerationCard, GenerationCardSkeleton } from "@/components/GenerationCard";
import { MasonryGrid } from "@/components/MasonryGrid";
import { dragHasGeneration } from "@/components/favorites/dnd";
import { FolderNameDialog } from "@/components/favorites/FolderNameDialog";
import { FolderTile } from "@/components/favorites/FolderTile";

/** The main grid: kept runs in no folder (a filed run shows only inside its folder). */
const ALL_QUERY: ListQuery = { favorite: true, folder: null };
const SKELETON_ASPECTS = ["3 / 4", "16 / 9", "1 / 1", "3 / 4", "9 / 16", "4 / 3", "1 / 1", "16 / 9"];
const SKELETON_ITEMS = skeletonItems(SKELETON_ASPECTS, (a) => <GenerationCardSkeleton aspect={a} />);
/** A folder tile is square. */
const TILE_ASPECT = 1;

type NameDialog = { mode: "create" } | { mode: "rename"; folder: Folder };

/**
 * Kept runs (the heart on a card), images and videos together, newest first. Folders take the first
 * positions of the grid, followed by the kept runs that are in no folder; cards can be dragged onto a
 * folder, which takes them out of this grid. `?folder=<id>` opens one folder (its own paged list), so
 * Back returns to All.
 */
export default function FavoritesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const folderId = params.get("folder") || undefined;
  const query = useMemo<ListQuery>(() => (folderId ? { favorite: true, folder: folderId } : ALL_QUERY), [folderId]);

  const folders = useFolderList();
  const { foldersLoaded, foldersLoading, foldersError } = useFolders(
    useShallow((s) => ({ foldersLoaded: s.loaded, foldersLoading: s.loading, foldersError: s.error })),
  );
  const summaries = useFolders((s) => s.summaries);
  const folder = useFolders((s) => (folderId ? s.byId[folderId] : undefined));
  const fetchFolders = useFolders((s) => s.fetch);

  const items = useFavoriteList(folderId ?? null);
  const page = usePage(query);
  const fetchPage = useGenerations((s) => s.fetchPage);

  // Fetch what is missing (on mount, when the folder changes, and again after a store `reset`). A failed load waits for "Try again".
  useEffect(() => {
    if (!foldersLoaded && !foldersLoading && !foldersError) void fetchFolders();
  }, [foldersLoaded, foldersLoading, foldersError, fetchFolders]);
  useEffect(() => {
    if (!page.loaded && !page.loading && !page.error) void fetchPage(query);
  }, [page.loaded, page.loading, page.error, fetchPage, query]);

  // ---------- Navigation ----------
  const openFolder = useCallback((f: Folder) => router.push(`/favorites?folder=${encodeURIComponent(f.id)}`), [router]);
  const backToAll = useCallback(() => router.push("/favorites"), [router]);

  // ---------- Lightbox ----------
  const ids = useMemo(() => items.map((g) => g.id), [items]);
  const openAt = useCallback((g: Generation) => useUi.getState().openLightbox(ids, Math.max(0, ids.indexOf(g.id))), [ids]);

  // ---------- Folder dialogs ----------
  // The last mode stays while a dialog animates out, so its title does not flip on the way.
  const [nameDialog, setNameDialog] = useState<NameDialog>({ mode: "create" });
  const [nameOpen, setNameOpen] = useState(false);
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const createFolder = useCallback(() => {
    setNameDialog({ mode: "create" });
    setNameOpen(true);
  }, []);
  const renameFolder = useCallback((f: Folder) => {
    setNameDialog({ mode: "rename", folder: f });
    setNameOpen(true);
  }, []);
  const askDelete = useCallback((f: Folder) => {
    setDeleting(f);
    setDeleteOpen(true);
  }, []);

  const submitName = async (name: string) => {
    if (nameDialog.mode === "create") await useFolders.getState().create(name);
    else await useFolders.getState().rename(nameDialog.folder.id, name);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await useFolders.getState().remove(deleting.id);
      toast.success("Folder deleted", { description: "Its runs are still in Favorites." });
      setDeleteOpen(false);
      if (folderId === deleting.id) router.replace("/favorites");
    } catch (err) {
      toast.error("Couldn't delete the folder", { description: describeApiError(err) });
    } finally {
      setDeleteBusy(false);
    }
  };

  // ---------- Drag and drop: a card onto a tile (All view only; a folder view has no tiles) ----------
  const [dragging, setDragging] = useState(false);
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (dragHasGeneration(e.dataTransfer)) setDragging(true);
  };
  const onDragEnd = () => setDragging(false);
  // The card's `dragend` is enough in practice; this covers a card that left the tree mid-drag.
  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("dragend", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragend", stop);
      window.removeEventListener("drop", stop);
    };
  }, [dragging]);

  const dropOnFolder = useCallback(async (f: Folder, id: string) => {
    const g = useGenerations.getState().byId[id];
    if (!g) return;
    if (g.folder === f.id) {
      toast(`Already in ${f.name}`);
      return;
    }
    try {
      await useGenerations.getState().setKeep(id, { favorite: true, folder: f.id });
      // Where you drop is where the next heart goes too.
      useFolders.getState().setDestination(f.id);
      toast.success(`Moved to ${f.name}`);
    } catch (err) {
      toast.error("Couldn't move it", { description: describeApiError(err) });
    }
  }, []);

  // ---------- Grid: tiles first, then the cards (in `items` order, the lightbox order) ----------
  const tiles = useMemo<MasonryItem[]>(
    () =>
      folderId
        ? []
        : folders.map((f) => ({
            key: `folder:${f.id}`,
            aspect: TILE_ASPECT,
            render: () => (
              <FolderTile
                folder={f}
                summary={summaries[f.id]}
                dropHint={dragging}
                onOpen={openFolder}
                onRename={renameFolder}
                onDelete={askDelete}
                onDrop={(target, id) => void dropOnFolder(target, id)}
              />
            ),
          })),
    [folderId, folders, summaries, dragging, openFolder, renameFolder, askDelete, dropOnFolder],
  );
  const cards = useMemo<MasonryItem[]>(
    () =>
      items.map((g) => ({
        key: g.id,
        aspect: cardAspectRatio(g),
        render: () => <GenerationCard generation={g} onOpen={openAt} showType draggable={!folderId} />,
      })),
    [items, openAt, folderId],
  );
  const gridItems = useMemo(() => [...tiles, ...cards], [tiles, cards]);

  // ---------- Render states ----------
  const hasCards = items.length > 0;
  const hasTiles = tiles.length > 0;
  const { initialLoading, loadFailed, showEmpty } = useListState(page, hasCards || hasTiles);
  // In All, the tiles come with the folders: no empty state until they are known.
  const waitingFolders = !folderId && !foldersLoaded && !foldersError && !hasCards;
  const skeleton = initialLoading || (waitingFolders && !loadFailed);
  const empty = showEmpty && !waitingFolders;
  const folderMissing = Boolean(folderId) && foldersLoaded && !folder;
  const folderCount = folderId ? (summaries[folderId]?.count ?? items.length) : 0;

  const countLabel = (() => {
    if (!page.loaded && !hasCards) return "Kept runs, images and videos together.";
    // Everything kept: the loose runs on this grid plus what the folders hold.
    const filed = folders.reduce((n, f) => n + (summaries[f.id]?.count ?? 0), 0);
    const head = `${items.length + filed} kept${page.nextCursor ? " loaded" : ""}`;
    return folders.length > 0 ? `${head} · ${pluralize(folders.length, "folder")}` : head;
  })();

  return (
    <Page className="flex flex-1 flex-col">
      {folderId ? (
        folder ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <IconButton label="All favorites" size="md" onClick={backToAll} tooltipSide="bottom">
              <ArrowLeft />
            </IconButton>
            <h1 className="flex min-w-0 items-center gap-2 text-heading">
              <FolderOpen size={16} className="shrink-0 text-fg-muted" aria-hidden="true" />
              <span className="truncate">{folder.name}</span>
            </h1>
            <span className="text-meta tabular-nums">{folderCount === 0 ? "Empty" : pluralize(folderCount, "item")}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="sm" variant="secondary" leftIcon={<Pencil />} onClick={() => renameFolder(folder)}>
                Rename
              </Button>
              <Button size="sm" variant="secondary" leftIcon={<Trash2 />} onClick={() => askDelete(folder)}>
                Delete
              </Button>
            </div>
          </div>
        ) : null
      ) : (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-meta tabular-nums">{countLabel}</p>
          <Button size="sm" variant="secondary" leftIcon={<FolderPlus />} onClick={createFolder}>
            New folder
          </Button>
        </div>
      )}

      {folderMissing ? (
        <EmptyState
          icon={<FolderX />}
          title="This folder is gone"
          description="It was deleted, or it belongs to another browser's library."
          action={
            <Button variant="secondary" leftIcon={<ArrowLeft />} onClick={backToAll}>
              All favorites
            </Button>
          }
          className="flex-1"
        />
      ) : null}

      {!folderMissing && skeleton ? <MasonryGrid items={SKELETON_ITEMS} aria-busy="true" aria-label="Loading favorites" /> : null}

      {!folderMissing && loadFailed ? (
        <EmptyState
          icon={<CircleAlert />}
          title="Couldn't load your favorites"
          description={page.error}
          action={
            <Button onClick={() => void fetchPage(query)} loading={page.loading}>
              Try again
            </Button>
          }
          className="flex-1"
        />
      ) : null}

      {!folderMissing && empty ? (
        folderId && folder ? (
          <EmptyState
            icon={<FolderOpen />}
            title={`Nothing in ${folder.name} yet`}
            description="Drag a kept run onto this folder in All, or pick the folder from a heart's menu."
            action={
              <Button variant="secondary" leftIcon={<ArrowLeft />} onClick={backToAll}>
                All favorites
              </Button>
            }
            className="flex-1"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center py-8">
            <EmptyFeed title="Nothing kept yet" description="Hover a run and press its heart to keep it here. Kept runs stay easy to find as the history grows." />
          </div>
        )
      ) : null}

      {!folderMissing && (hasCards || hasTiles) ? (
        <div onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <MasonryGrid items={gridItems} />
          {page.nextCursor ? (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={page.loading} onClick={() => void fetchPage({ ...query, more: true })}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <FolderNameDialog
        open={nameOpen}
        onOpenChange={setNameOpen}
        title={nameDialog.mode === "rename" ? "Rename folder" : "New folder"}
        initialName={nameDialog.mode === "rename" ? nameDialog.folder.name : ""}
        submitLabel={nameDialog.mode === "rename" ? "Save" : "Create"}
        onSubmit={submitName}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => !deleteBusy && setDeleteOpen(o)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="Only the folder goes; the runs in it stay in Favorites."
        confirmLabel="Delete folder"
        danger
        loading={deleteBusy}
        onConfirm={confirmDelete}
      />
    </Page>
  );
}
