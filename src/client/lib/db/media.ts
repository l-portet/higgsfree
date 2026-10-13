/** Media Blobs by id. Reads return the Blob handle; the bytes load when something displays it. */
import type { MediaKind } from "../media-ids";
import { getDb } from "./index";
import type { MediaRow } from "./schema";

export async function putMedia(row: MediaRow): Promise<void> {
  const db = await getDb();
  await db.put("media", row);
}

export async function getMediaRow(id: string): Promise<MediaRow | undefined> {
  const db = await getDb();
  return db.get("media", id);
}

export async function getMediaBlob(id: string): Promise<Blob | undefined> {
  return (await getMediaRow(id))?.blob;
}

export async function mediaExists(id: string): Promise<boolean> {
  const db = await getDb();
  return (await db.getKey("media", id)) !== undefined;
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("media", id);
}

export async function listMediaKeys(kind?: MediaKind): Promise<string[]> {
  const db = await getDb();
  return kind ? db.getAllKeysFromIndex("media", "byKind", kind) : db.getAllKeys("media");
}

/** Every upload row (no blobs read until `.blob` is touched). */
export async function listUploads(): Promise<MediaRow[]> {
  const db = await getDb();
  return db.getAllFromIndex("media", "byKind", "upload");
}

/**
 * Uploads older than `minAgeMs` that no record references (attached, never generated).
 * Returns how many were removed.
 */
export async function sweepOrphanUploads(minAgeMs = 24 * 3_600_000): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - minAgeMs).toISOString();
  const tx = db.transaction(["media", "generations"], "readwrite");
  const refs = tx.objectStore("generations").index("byRef");
  let removed = 0;
  let cur = await tx.objectStore("media").index("byKind").openCursor("upload");
  while (cur) {
    const row = cur.value;
    if (row.createdAt < cutoff && (await refs.count(row.id)) === 0) {
      await cur.delete();
      removed++;
    }
    cur = await cur.continue();
  }
  await tx.done;
  return removed;
}
