/**
 * Normalized generations store: `byId` + `ids` (newest first), per-list paging,
 * wired to the live change feed so cards update as jobs progress.
 */
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Generation, GenerationStatus, GenerationType, ListGenerationsQuery, UpdateGenerationRequest } from "@shared/types";
import * as api from "@/lib/api";
import { ApiClientError } from "@/lib/api";
import { subscribeEvents, subscribeEventStatus } from "@/lib/live";
import { normalizeNote } from "@/lib/notes";
import { useUi } from "@/store/ui";

export type ListKey = string;

export interface PageState {
  loading: boolean;
  loaded: boolean;
  nextCursor?: string;
  error?: string;
}

const EMPTY_PAGE: PageState = { loading: false, loaded: false };

/** The filters a list is keyed by (paging state is per key). */
export type ListQuery = Pick<ListGenerationsQuery, "type" | "status" | "favorite" | "folder">;

export function listKey(q: ListQuery): ListKey {
  const where = q.folder === null ? ":loose" : q.folder ? `:in:${q.folder}` : "";
  return `${q.type ?? "all"}:${q.status ?? "any"}${q.favorite ? ":kept" : ""}${where}`;
}

/** What the heart can change: kept or not, and the folder (`null` = out of its folder). */
export type KeepPatch = Pick<UpdateGenerationRequest, "favorite" | "folder">;

export function isPending(g: Pick<Generation, "status">): boolean {
  return g.status === "pending" || g.status === "running";
}

/** Newest first; the images of one batch keep their #1…#4 order. */
function byNewest(a: Generation, b: Generation): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (tb !== ta) return tb - ta;
  return (a.batchIndex ?? 0) - (b.batchIndex ?? 0) || (a.id < b.id ? -1 : 1);
}

interface GenerationsState {
  byId: Record<string, Generation>;
  ids: string[];
  pages: Record<ListKey, PageState>;

  upsert: (items: Generation | Generation[]) => void;
  /** Drop a record locally (also pulls it out of an open lightbox). */
  remove: (id: string) => void;
  /** The library was replaced or cleared: forget everything (pages refetch on their own). */
  reset: () => void;
  /** Fetch the first page (or the next one with `more: true`) for a list. */
  fetchPage: (q: ListGenerationsQuery & { more?: boolean }) => Promise<void>;
  /** Re-fetch every locally pending/running record (whenever the live feed (re)connects). */
  refreshPending: () => Promise<void>;
  deleteGeneration: (id: string) => Promise<void>;
  retryGeneration: (id: string) => Promise<Generation[]>;
  /** The heart and its folder: optimistic locally, the stored record wins once the write lands. */
  setKeep: (id: string, patch: KeepPatch) => Promise<void>;
  /** A video's note (`null` removes it): optimistic locally, the stored record wins once the write lands. */
  setNote: (id: string, note: string | null) => Promise<void>;
}

export const useGenerations = create<GenerationsState>()((set, get) => ({
  byId: {},
  ids: [],
  pages: {},

  upsert: (items) => {
    const list = Array.isArray(items) ? items : [items];
    if (list.length === 0) return;
    set((s) => {
      const byId = { ...s.byId };
      let changedOrder = false;
      for (const g of list) {
        const prev = byId[g.id];
        // A stale list page can arrive after a fresher record from the feed; never let it win
        // (an equal timestamp is the same write: the feed re-sends recent rows on purpose).
        if (prev && prev.updatedAt >= g.updatedAt) continue;
        if (!prev) changedOrder = true;
        byId[g.id] = g;
      }
      const ids = changedOrder
        ? Object.values(byId)
            .sort(byNewest)
            .map((g) => g.id)
        : s.ids;
      return { byId, ids };
    });
  },

  remove: (id) => {
    if (!get().byId[id]) return;
    set((s) => {
      const byId = { ...s.byId };
      delete byId[id];
      return { byId, ids: s.ids.filter((x) => x !== id) };
    });
    const lb = useUi.getState().lightbox;
    if (lb?.ids.includes(id)) useUi.getState().lightboxSetIds(lb.ids.filter((x) => x !== id));
  },

  reset: () => {
    set({ byId: {}, ids: [], pages: {} });
    useUi.getState().closeLightbox();
  },

  fetchPage: async ({ more, ...q }) => {
    const key = listKey(q);
    const page = get().pages[key] ?? EMPTY_PAGE;
    if (page.loading) return;
    if (more && !page.nextCursor) return;
    set((s) => ({ pages: { ...s.pages, [key]: { ...page, loading: true, error: undefined } } }));
    try {
      const res = await api.listGenerations({ ...q, cursor: more ? page.nextCursor : undefined });
      get().upsert(res.items);
      set((s) => ({
        pages: {
          ...s.pages,
          [key]: { loading: false, loaded: true, nextCursor: res.nextCursor },
        },
      }));
    } catch (err) {
      set((s) => ({
        pages: {
          ...s.pages,
          [key]: { ...page, loading: false, loaded: page.loaded, error: api.describeApiError(err) },
        },
      }));
    }
  },

  refreshPending: async () => {
    const { byId } = get();
    const pending = Object.values(byId).filter(isPending);
    if (pending.length === 0) return;
    const results = await Promise.allSettled(pending.map((g) => api.getGeneration(g.id)));
    const fresh: Generation[] = [];
    for (const r of results) if (r.status === "fulfilled") fresh.push(r.value);
    if (fresh.length) get().upsert(fresh);
  },

  deleteGeneration: async (id) => {
    try {
      await api.deleteGeneration(id);
    } catch (err) {
      // Already gone (deleted from another tab, or replaced by a retry); drop it locally too.
      if (!(err instanceof ApiClientError && err.status === 404)) throw err;
    }
    get().remove(id);
  },

  setKeep: async (id, patch) => {
    const prev = get().byId[id];
    if (!prev) return;
    // Same rules as `api.updateGeneration`: a folder keeps the record, removing the heart clears the folder.
    const { favorite: _was, folder: _in, ...rest } = prev;
    const favorite = patch.folder ? true : (patch.favorite ?? Boolean(prev.favorite));
    const folder = favorite ? (patch.folder === undefined ? prev.folder : (patch.folder ?? undefined)) : undefined;
    const optimistic: Generation = { ...rest };
    if (favorite) optimistic.favorite = true;
    if (folder) optimistic.folder = folder;
    set((s) => ({ byId: { ...s.byId, [id]: optimistic } }));
    try {
      get().upsert(await api.updateGeneration(id, patch));
    } catch (err) {
      set((s) => (s.byId[id] === optimistic ? { byId: { ...s.byId, [id]: prev } } : s));
      throw err;
    }
  },

  setNote: async (id, note) => {
    const prev = get().byId[id];
    if (!prev || prev.type !== "video") return;
    const text = normalizeNote(note ?? "");
    if ((prev.note ?? "") === text) return;
    const { note: _prevNote, ...rest } = prev;
    const optimistic: Generation = text ? { ...rest, note: text } : { ...rest };
    set((s) => ({ byId: { ...s.byId, [id]: optimistic } }));
    try {
      get().upsert(await api.updateGeneration(id, { note: text || null }));
    } catch (err) {
      set((s) => (s.byId[id] === optimistic ? { byId: { ...s.byId, [id]: prev } } : s));
      throw err;
    }
  },

  retryGeneration: async (id) => {
    const wasFailed = get().byId[id]?.status === "failed";
    const res = await api.retryGeneration(id);
    get().upsert(res.generations);
    // A retried failure is replaced: point an open lightbox at the new record before the old id is dropped.
    const next = res.generations[0]?.id;
    const lb = useUi.getState().lightbox;
    if (wasFailed && next && lb?.ids.includes(id)) {
      useUi.getState().lightboxSetIds(lb.ids.map((x) => (x === id ? next : x)));
    }
    // The feed also announces the replaced id; removing here is a harmless double.
    if (wasFailed) get().remove(id);
    return res.generations;
  },
}));

// ---------- Selectors / hooks ----------

function selectList(type?: GenerationType, status?: GenerationStatus) {
  return (s: GenerationsState): Generation[] => {
    const out: Generation[] = [];
    for (const id of s.ids) {
      const g = s.byId[id];
      if (!g) continue;
      if (type && g.type !== type) continue;
      if (status && g.status !== status) continue;
      out.push(g);
    }
    return out;
  };
}

export function useGenerationList(type?: GenerationType, status?: GenerationStatus): Generation[] {
  return useGenerations(useShallow(selectList(type, status)));
}

export function usePendingGenerations(type?: GenerationType): Generation[] {
  return useGenerations(
    useShallow((s) => {
      const out: Generation[] = [];
      for (const id of s.ids) {
        const g = s.byId[id];
        if (g && isPending(g) && (!type || g.type === type)) out.push(g);
      }
      return out;
    }),
  );
}

export function usePage(q: ListQuery): PageState {
  const key = listKey(q);
  return useGenerations((s) => s.pages[key] ?? EMPTY_PAGE);
}

/**
 * Kept (hearted) records in the store, newest first: every one (`undefined`), the ones filed in a
 * folder (its id), or the ones in no folder (`null`, the Favorites view's own grid).
 */
export function useFavoriteList(folder?: string | null): Generation[] {
  return useGenerations(
    useShallow((s) => {
      const out: Generation[] = [];
      for (const id of s.ids) {
        const g = s.byId[id];
        if (!g?.favorite) continue;
        if (folder === undefined || (folder === null ? !g.folder : g.folder === folder)) out.push(g);
      }
      return out;
    }),
  );
}

export interface ListState {
  /** First fetch in flight and nothing to show yet → skeletons. */
  initialLoading: boolean;
  /** First fetch failed → "Try again". */
  loadFailed: boolean;
  /** Nothing to show and nothing more to wait for → empty state. */
  showEmpty: boolean;
}

/** Which of skeleton / error / empty a list page should render (lists render whenever `hasItems`). */
export function useListState(page: PageState, hasItems: boolean): ListState {
  const initialLoading = !hasItems && !page.loaded && page.loading;
  const loadFailed = !hasItems && !page.loaded && !page.loading && Boolean(page.error);
  const showEmpty = !hasItems && !initialLoading && !loadFailed && page.loaded;
  return { initialLoading, loadFailed, showEmpty };
}

// ---------- Live updates ----------

subscribeEvents((ev) => {
  const s = useGenerations.getState();
  if (ev.type === "generation") s.upsert(ev.generation);
  else if (ev.type === "generation-deleted") s.remove(ev.id);
  else if (ev.type === "reset") s.reset();
});

// On every open, not only reconnects: pages fetch their lists before the feed is up, so a record
// that completed in that gap has no event to deliver it.
subscribeEventStatus((status) => {
  if (status === "open") void useGenerations.getState().refreshPending();
});
