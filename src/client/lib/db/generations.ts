/** Typed CRUD over the `generations` store. Rows in, `Generation` objects out. */
import type { Generation, GenerationStatus, ListGenerationsQuery, ListGenerationsResponse } from "@shared/types";
import { ApiClientError } from "../errors";
import { inputMediaIds, ownerGenerationId } from "../media-ids";
import { getDb } from "./index";
import type { MediaRow, StoredGeneration } from "./schema";

export type { MediaRow, StoredGeneration } from "./schema";

export const LIST_DEFAULT_LIMIT = 60;
export const LIST_MAX_LIMIT = 200;

export const isActive = (g: Pick<Generation, "status">): boolean => g.status === "pending" || g.status === "running";

/** What `toStored` accepts: a public record, optionally with the internal polling url. */
export type GenerationInput = Generation & { pollingUrl?: string };

/** Fields a write may change. `undefined` removes the field (`pollingUrl: undefined` clears it). */
export type GenerationPatch = Partial<Omit<StoredGeneration, "id" | "type" | "createdAt" | "updatedAt" | "fav" | "refs">>;

/** Derive the indexable fields; `favorite` is only ever present when true. */
export function toStored(g: GenerationInput): StoredGeneration {
  const { favorite, ...rest } = g;
  const row: StoredGeneration = { ...rest, fav: favorite ? 1 : 0, refs: inputMediaIds(g.inputs) };
  if (favorite) row.favorite = true;
  return row;
}

/** Strip the internal fields before anything leaves the data layer. */
export function toPublic(row: StoredGeneration): Generation {
  const { pollingUrl: _p, fav: _f, refs: _r, ...pub } = row;
  return pub;
}

/**
 * Merge a patch and bump `updatedAt` strictly past the previous value: the store ignores a
 * record whose `updatedAt` is not newer, and `pending → running` can land in the same millisecond.
 */
function applyPatch(prev: StoredGeneration, patch: GenerationPatch): StoredGeneration {
  const merged: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const nowIso = new Date().toISOString();
  merged.updatedAt = nowIso > prev.updatedAt ? nowIso : new Date(Date.parse(prev.updatedAt) + 1).toISOString();
  return toStored(merged as unknown as GenerationInput);
}

export async function getGeneration(id: string): Promise<StoredGeneration | undefined> {
  const db = await getDb();
  return db.get("generations", id);
}

/** Opaque cursor: `${createdAt}|${id}`; a bare createdAt is also accepted (then every row at that instant is skipped). */
function parseCursor(cursor: string | undefined): { createdAt: string; id?: string } | undefined {
  if (!cursor) return undefined;
  const bar = cursor.lastIndexOf("|");
  if (bar > 0) return { createdAt: cursor.slice(0, bar), id: cursor.slice(bar + 1) };
  return { createdAt: cursor };
}

type ListIndex = "byCreated" | "byType" | "byStatus" | "byTypeStatus" | "byFavorite";

/** Newest first, `limit` + a cursor for the next page; filters by type, status and favorite. */
export async function listGenerations(q: ListGenerationsQuery = {}): Promise<ListGenerationsResponse> {
  const db = await getDb();
  const limit = Math.min(LIST_MAX_LIMIT, Math.max(1, q.limit ?? LIST_DEFAULT_LIMIT));
  const cursor = parseCursor(q.cursor);
  let index: ListIndex;
  let prefix: (string | number)[];
  let matches = (_g: StoredGeneration): boolean => true;
  if (q.favorite !== undefined) {
    index = "byFavorite";
    prefix = [q.favorite ? 1 : 0];
    matches = (g) => (!q.type || g.type === q.type) && (!q.status || g.status === q.status);
  } else if (q.type && q.status) {
    index = "byTypeStatus";
    prefix = [q.type, q.status];
  } else if (q.type) {
    index = "byType";
    prefix = [q.type];
  } else if (q.status) {
    index = "byStatus";
    prefix = [q.status];
  } else {
    index = "byCreated";
    prefix = [];
  }
  // A shorter array sorts before every longer array with that prefix; "￿" sorts after every ISO date.
  const upper = cursor ? [...prefix, cursor.createdAt, ...(cursor.id !== undefined ? [cursor.id] : [])] : [...prefix, "￿"];
  const range = IDBKeyRange.bound(prefix, upper, false, Boolean(cursor));
  const tx = db.transaction("generations");
  const rows: StoredGeneration[] = [];
  let cur = await tx.store.index(index).openCursor(range, "prev");
  while (cur && rows.length <= limit) {
    if (matches(cur.value)) rows.push(cur.value);
    cur = await cur.continue();
  }
  await tx.done;
  const items = rows.slice(0, limit).map(toPublic);
  const last = items[items.length - 1];
  const nextCursor = rows.length > limit && last ? `${last.createdAt}|${last.id}` : undefined;
  return nextCursor ? { items, nextCursor } : { items };
}

const statusRange = (status: GenerationStatus): IDBKeyRange => IDBKeyRange.bound([status], [status, "￿"]);

/**
 * Insert new rows, or throw a 429 when they would push pending + running past `maxActive`.
 * The count and the inserts share one readwrite transaction, so the ceiling holds across tabs.
 */
export async function insertGenerations(rows: StoredGeneration[], maxActive: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("generations", "readwrite");
  const byStatus = tx.store.index("byStatus");
  const active = (await byStatus.count(statusRange("pending"))) + (await byStatus.count(statusRange("running")));
  if (active + rows.length > maxActive) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new ApiClientError(429, `Too many active generations (${maxActive}). Wait for some to finish.`);
  }
  for (const row of rows) await tx.store.add(row);
  await tx.done;
}

/** Read-modify-write in one transaction. Returns the fresh row, or undefined when it is gone. */
export async function patchGeneration(id: string, patch: GenerationPatch): Promise<StoredGeneration | undefined> {
  const db = await getDb();
  const tx = db.transaction("generations", "readwrite");
  const prev = await tx.store.get(id);
  if (!prev) {
    await tx.done;
    return undefined;
  }
  const next = applyPatch(prev, patch);
  await tx.store.put(next);
  await tx.done;
  return next;
}

/** Same as `patchGeneration`, but the media row lands in the same transaction, and only if the record still exists. */
export async function completeGeneration(id: string, patch: GenerationPatch, media?: MediaRow): Promise<StoredGeneration | undefined> {
  const db = await getDb();
  const tx = db.transaction(["generations", "media"], "readwrite");
  const gens = tx.objectStore("generations");
  const prev = await gens.get(id);
  if (!prev) {
    await tx.done;
    return undefined;
  }
  const next = applyPatch(prev, patch);
  if (media) await tx.objectStore("media").put(media);
  await gens.put(next);
  await tx.done;
  return next;
}

/**
 * Cascade delete in one transaction: the row, its output, and every media its inputs pointed at
 * that nothing else uses any more (an upload no other record references; another record's output
 * whose record is already gone). Returns the public record and the media ids removed.
 */
export async function removeGeneration(id: string): Promise<{ removed: Generation; mediaDeleted: string[] } | undefined> {
  const db = await getDb();
  const tx = db.transaction(["generations", "media"], "readwrite");
  const gens = tx.objectStore("generations");
  const media = tx.objectStore("media");
  const byRef = gens.index("byRef");
  const row = await gens.get(id);
  if (!row) {
    await tx.done;
    return undefined;
  }
  await gens.delete(id);
  const candidates = new Set(row.refs);
  if (row.output) candidates.add(row.output.id);
  const mediaDeleted: string[] = [];
  for (const mediaId of candidates) {
    if ((await byRef.count(mediaId)) > 0) continue; // still an input of another record
    const owner = ownerGenerationId(mediaId);
    if (owner && owner !== id && (await gens.getKey(owner)) !== undefined) continue; // another record's output, still owned
    if ((await media.getKey(mediaId)) === undefined) continue;
    await media.delete(mediaId);
    mediaDeleted.push(mediaId);
  }
  await tx.done;
  return { removed: toPublic(row), mediaDeleted };
}

export async function countActive(): Promise<number> {
  const db = await getDb();
  const tx = db.transaction("generations");
  const byStatus = tx.store.index("byStatus");
  const n = (await byStatus.count(statusRange("pending"))) + (await byStatus.count(statusRange("running")));
  await tx.done;
  return n;
}

/** Pending and running rows, oldest first. */
export async function listActive(): Promise<StoredGeneration[]> {
  const db = await getDb();
  const [pending, running] = await Promise.all([
    db.getAllFromIndex("generations", "byStatus", statusRange("pending")),
    db.getAllFromIndex("generations", "byStatus", statusRange("running")),
  ]);
  return [...pending, ...running].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
}

/** Every row, for export and stats (no blobs are read). */
export async function getAllGenerations(): Promise<StoredGeneration[]> {
  const db = await getDb();
  return db.getAll("generations");
}

/** Both stores emptied in one transaction ("Delete everything"). */
export async function clearLibrary(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["generations", "media"], "readwrite");
  await Promise.all([tx.objectStore("generations").clear(), tx.objectStore("media").clear()]);
  await tx.done;
}
