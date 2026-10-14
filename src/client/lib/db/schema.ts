/** The IndexedDB layout: records with the indexes the list queries need, media Blobs by id, and the Favorites folders. */
import type { DBSchema } from "idb";
import type { Folder, Generation } from "@shared/types";

export const DB_NAME = "higgsfree";
/** v2: the `folders` store and the `byFolder` index (see `upgrade` in index.ts). */
export const DB_VERSION = 2;

/** Row shape; `toPublic` strips the internal fields. */
export interface StoredGeneration extends Generation {
  /** Provider polling url (video jobs); cleared on completion / failure. */
  pollingUrl?: string;
  /** Indexable mirror of `favorite` (booleans are not valid IndexedDB keys). */
  fav: 0 | 1;
  /** Media ids referenced by `inputs`, for the multiEntry index behind delete's reference count. */
  refs: string[];
}

export interface MediaRow {
  /** `gen_<id>.<ext>` for outputs, `up_<id>.<ext>` for uploads. */
  id: string;
  kind: "output" | "upload";
  mime: string;
  bytes: number;
  createdAt: string;
  blob: Blob;
}

export interface HiggsfreeDB extends DBSchema {
  generations: {
    key: string;
    value: StoredGeneration;
    indexes: {
      /** `[createdAt, id]`: newest first when walked backwards, ties broken by id (what the old SQL did). */
      byCreated: [string, string];
      byType: [string, string, string];
      byStatus: [string, string, string];
      byTypeStatus: [string, string, string, string];
      byFavorite: [number, string, string];
      /** `[folder, createdAt, id]`; records without a folder are not in it. */
      byFolder: [string, string, string];
      byRef: string;
    };
  };
  media: {
    key: string;
    value: MediaRow;
    indexes: { byKind: string; byCreated: string };
  };
  folders: {
    key: string;
    value: Folder;
  };
}
