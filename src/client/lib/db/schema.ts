/** The IndexedDB layout: records with the indexes the list queries need, and media Blobs by id. */
import type { DBSchema } from "idb";
import type { Generation } from "@shared/types";

export const DB_NAME = "higgsfree";
export const DB_VERSION = 1;

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
      byRef: string;
    };
  };
  media: {
    key: string;
    value: MediaRow;
    indexes: { byKind: string; byCreated: string };
  };
}
