/**
 * The one connection to the library database, opened lazily (never at import: the
 * pages are prerendered without a browser) and migrated in place by `idb`'s `upgrade`.
 */
import { openDB, type IDBPDatabase } from "idb";
import { ApiClientError, STORAGE_UNAVAILABLE_MESSAGE } from "../errors";
import { errorMessage, log } from "../log";
import { DB_NAME, DB_VERSION, type HiggsfreeDB } from "./schema";

export type DbStatus = "unknown" | "open" | "unavailable";

export class DbUnavailableError extends ApiClientError {
  constructor(detail?: string) {
    super(0, STORAGE_UNAVAILABLE_MESSAGE, detail);
    this.name = "DbUnavailableError";
  }
}

let opening: Promise<IDBPDatabase<HiggsfreeDB>> | undefined;
let status: DbStatus = "unknown";
const statusListeners = new Set<(s: DbStatus) => void>();

function setStatus(next: DbStatus): void {
  if (status === next) return;
  status = next;
  for (const fn of statusListeners) fn(next);
}

/** Subscribe to the connection state; fires immediately with the current value. */
export function subscribeDbStatus(fn: (s: DbStatus) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => {
    statusListeners.delete(fn);
  };
}

/** The migrated database; the same promise for every caller. Rejects with `DbUnavailableError`. */
export function getDb(): Promise<IDBPDatabase<HiggsfreeDB>> {
  if (!opening) {
    if (typeof indexedDB === "undefined") {
      setStatus("unavailable");
      return Promise.reject(new DbUnavailableError("IndexedDB is not available here"));
    }
    opening = openDB<HiggsfreeDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const generations = db.createObjectStore("generations", { keyPath: "id" });
        generations.createIndex("byCreated", ["createdAt", "id"]);
        generations.createIndex("byType", ["type", "createdAt", "id"]);
        generations.createIndex("byStatus", ["status", "createdAt", "id"]);
        generations.createIndex("byTypeStatus", ["type", "status", "createdAt", "id"]);
        generations.createIndex("byFavorite", ["fav", "createdAt", "id"]);
        generations.createIndex("byRef", "refs", { multiEntry: true });
        const media = db.createObjectStore("media", { keyPath: "id" });
        media.createIndex("byKind", "kind");
        media.createIndex("byCreated", "createdAt");
      },
      blocked() {
        log.warn("library database upgrade is blocked by another open tab");
      },
      blocking(_current, _blocked, event) {
        // A newer app version opened the database elsewhere: let it migrate, and reopen on the next call.
        (event.target as IDBDatabase | null)?.close();
        opening = undefined;
        setStatus("unavailable");
      },
      terminated() {
        opening = undefined;
        setStatus("unavailable");
      },
    })
      .then((db) => {
        setStatus("open");
        return db;
      })
      .catch((err: unknown) => {
        opening = undefined;
        setStatus("unavailable");
        throw err instanceof DbUnavailableError ? err : new DbUnavailableError(errorMessage(err));
      });
  }
  return opening;
}

/** Tests: drop the cached connection so the next call opens afresh. */
export function closeDb(): void {
  void opening?.then((db) => db.close()).catch(() => undefined);
  opening = undefined;
  setStatus("unknown");
}
