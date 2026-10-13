/**
 * Normalized generations store: `byId` + `ids` (newest first), per-list paging,
 * wired to the SSE stream so cards update live.
 */
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Generation, GenerationStatus, GenerationType, ListGenerationsQuery } from "@shared/types";
import * as api from "@/lib/api";
import { ApiClientError } from "@/lib/api";
import { subscribeEvents, subscribeEventStatus } from "@/lib/sse";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

export type ListKey = string;

export interface PageState {
  loading: boolean;
  loaded: boolean;
  nextCursor?: string;
  error?: string;
}

const EMPTY_PAGE: PageState = { loading: false, loaded: false };

export function listKey(q: Pick<ListGenerationsQuery, "type" | "status">): ListKey {
  return `${q.type ?? "all"}:${q.status ?? "any"}`;
}

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
  /** Fetch the first page (or the next one with `more: true`) for a list. */
  fetchPage: (q: ListGenerationsQuery & { more?: boolean }) => Promise<void>;
  /** Re-fetch every locally pending/running record (whenever the SSE stream opens). */
  refreshPending: () => Promise<void>;
  deleteGeneration: (id: string) => Promise<void>;
  retryGeneration: (id: string) => Promise<Generation[]>;
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
        // A stale REST list response can arrive after a fresher SSE record; never let it win.
        if (prev && prev.updatedAt > g.updatedAt) continue;
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
      // Already gone on the server (deleted from another tab / replaced by a retry); drop it locally too.
      if (!(err instanceof ApiClientError && err.status === 404)) throw err;
    }
    get().remove(id);
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
    // The server also publishes `generation-deleted` for a replaced failure; removing here is a harmless double.
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

export function usePage(q: Pick<ListGenerationsQuery, "type" | "status">): PageState {
  const key = listKey(q);
  return useGenerations((s) => s.pages[key] ?? EMPTY_PAGE);
}

export interface ListState {
  /** First fetch in flight and nothing to show yet → skeletons. */
  initialLoading: boolean;
  /** First fetch failed while the server was reachable → "Try again". */
  loadFailed: boolean;
  /** Nothing to show and nothing more to wait for → empty state. */
  showEmpty: boolean;
}

/** Which of skeleton / error / empty a list page should render (lists render whenever `hasItems`). */
export function useListState(page: PageState, hasItems: boolean): ListState {
  const server = useSettings((s) => s.server);
  const initialLoading = !hasItems && !page.loaded && page.loading;
  const loadFailed = !hasItems && !page.loaded && !page.loading && Boolean(page.error) && server !== "offline";
  const showEmpty = !hasItems && !initialLoading && !loadFailed && (page.loaded || server === "offline" || Boolean(page.error));
  return { initialLoading, loadFailed, showEmpty };
}

// ---------- Live updates ----------

subscribeEvents((ev) => {
  const s = useGenerations.getState();
  if (ev.type === "generation") s.upsert(ev.generation);
  else if (ev.type === "generation-deleted") s.remove(ev.id);
});

// On every open, not only reconnects: pages fetch their lists before the stream is up, so a record
// that completed in that gap has no event to deliver it.
subscribeEventStatus((status) => {
  if (status === "open") void useGenerations.getState().refreshPending();
});
