/**
 * Favorites folders: the list (newest first), what each tile shows (count, cover), and the
 * destination the heart files into by default: the last one picked, remembered in localStorage.
 */
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Folder, FolderSummary } from "@shared/types";
import * as api from "@/lib/api";
import { compareFolders, DESTINATION_STORAGE } from "@/lib/folders";
import { subscribeEvents } from "@/lib/live";
import { readJson, writeJson } from "@/lib/storage";

/** Record events arrive in bursts (a batch of four images); one re-read serves them all. */
const SUMMARY_DEBOUNCE_MS = 200;

interface FoldersState {
  byId: Record<string, Folder>;
  /** Newest first. */
  ids: string[];
  /** By folder id; refreshed whenever records change. */
  summaries: Record<string, FolderSummary>;
  loaded: boolean;
  loading: boolean;
  error?: string;
  /** The folder the heart files into by default (`null` = All). Read it through `defaultDestination`. */
  destination: string | null;

  fetch: () => Promise<void>;
  /** Re-read every folder's count and cover (coalesced; a no-op until the first `fetch`). */
  refreshSummaries: () => void;
  create: (name: string) => Promise<Folder>;
  rename: (id: string, name: string) => Promise<Folder>;
  /** The records stay kept. */
  remove: (id: string) => Promise<void>;
  /** Remember the last destination picked (a folder id, or `null` for All). */
  setDestination: (id: string | null) => void;
  /** The last destination picked, or `null` (All) when none was or that folder is gone. */
  defaultDestination: () => string | null;
  upsert: (folder: Folder) => void;
  drop: (id: string) => void;
  /** The library was replaced or cleared: forget everything (views refetch on their own). */
  reset: () => void;
}

const sortedIds = (byId: Record<string, Folder>): string[] => Object.values(byId).sort(compareFolders).map((f) => f.id);

let summaryTimer: ReturnType<typeof setTimeout> | undefined;

export const useFolders = create<FoldersState>()((set, get) => ({
  byId: {},
  ids: [],
  summaries: {},
  loaded: false,
  loading: false,
  destination: readJson<string>(DESTINATION_STORAGE, "") || null,

  fetch: async () => {
    if (get().loading) return;
    set({ loading: true, error: undefined });
    try {
      const res = await api.listFolders();
      const byId: Record<string, Folder> = {};
      for (const f of res.folders) byId[f.id] = f;
      set({ byId, ids: sortedIds(byId), summaries: res.summaries, loaded: true, loading: false });
    } catch (err) {
      set({ loading: false, error: api.describeApiError(err) });
    }
  },

  refreshSummaries: () => {
    if (!get().loaded || get().ids.length === 0) return;
    if (summaryTimer) clearTimeout(summaryTimer);
    summaryTimer = setTimeout(() => {
      summaryTimer = undefined;
      api
        .listFolders()
        .then((res) => {
          if (!get().loaded) return; // reset meanwhile
          const byId: Record<string, Folder> = {};
          for (const f of res.folders) byId[f.id] = f;
          set({ byId, ids: sortedIds(byId), summaries: res.summaries });
        })
        .catch(() => undefined);
    }, SUMMARY_DEBOUNCE_MS);
  },

  create: async (name) => {
    const folder = await api.createFolder({ name });
    get().upsert(folder);
    return folder;
  },

  rename: async (id, name) => {
    const folder = await api.renameFolder(id, { name });
    get().upsert(folder);
    return folder;
  },

  remove: async (id) => {
    await api.deleteFolder(id);
    get().drop(id);
  },

  setDestination: (id) => {
    set({ destination: id });
    writeJson(DESTINATION_STORAGE, id ?? "");
  },

  defaultDestination: () => {
    const { destination, byId } = get();
    return destination && byId[destination] ? destination : null;
  },

  upsert: (folder) => {
    set((s) => {
      const byId = { ...s.byId, [folder.id]: folder };
      const summaries = s.summaries[folder.id] ? s.summaries : { ...s.summaries, [folder.id]: { count: 0, newest: [] } };
      return { byId, ids: sortedIds(byId), summaries };
    });
  },

  drop: (id) => {
    if (!get().byId[id]) return;
    set((s) => {
      const byId = { ...s.byId };
      delete byId[id];
      const summaries = { ...s.summaries };
      delete summaries[id];
      return { byId, ids: sortedIds(byId), summaries };
    });
  },

  reset: () => {
    if (summaryTimer) clearTimeout(summaryTimer);
    summaryTimer = undefined;
    set({ byId: {}, ids: [], summaries: {}, loaded: false, loading: false, error: undefined });
  },
}));

// ---------- Selectors / hooks ----------

/** Every folder, newest first. */
export function useFolderList(): Folder[] {
  return useFolders(
    useShallow((s) => {
      const out: Folder[] = [];
      for (const id of s.ids) {
        const f = s.byId[id];
        if (f) out.push(f);
      }
      return out;
    }),
  );
}

/** The folder's name, or undefined when there is no such folder (a stale id reads as "All"). */
export function useFolderName(id: string | undefined): string | undefined {
  return useFolders((s) => (id ? s.byId[id]?.name : undefined));
}

// ---------- Live updates ----------

subscribeEvents((ev) => {
  const s = useFolders.getState();
  if (ev.type === "folder") s.upsert(ev.folder);
  else if (ev.type === "folder-deleted") s.drop(ev.id);
  else if (ev.type === "generation" || ev.type === "generation-deleted") s.refreshSummaries();
  else if (ev.type === "reset") s.reset();
});
