/** Typed CRUD over the `folders` store, and the records filed in a folder. */
import type { Folder, Generation } from "@shared/types";
import { applyPatch, toPublic } from "./generations";
import { getDb } from "./index";

/** Every `byFolder` key of one folder ("￿" sorts after every ISO date). */
const folderRange = (id: string): IDBKeyRange => IDBKeyRange.bound([id], [id, "￿"]);

export async function listFolders(): Promise<Folder[]> {
  const db = await getDb();
  return db.getAll("folders");
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  const db = await getDb();
  return db.get("folders", id);
}

/** Insert or replace. */
export async function putFolder(folder: Folder): Promise<void> {
  const db = await getDb();
  await db.put("folders", folder);
}

export async function countInFolder(id: string): Promise<number> {
  const db = await getDb();
  return db.countFromIndex("generations", "byFolder", folderRange(id));
}

/**
 * Delete a folder and take every record out of it, in one transaction; the records stay kept.
 * Returns the folder and the records changed (for the change feed), or undefined when it was already gone.
 */
export async function removeFolder(id: string): Promise<{ removed: Folder; cleared: Generation[] } | undefined> {
  const db = await getDb();
  const tx = db.transaction(["folders", "generations"], "readwrite");
  const folders = tx.objectStore("folders");
  const removed = await folders.get(id);
  if (!removed) {
    await tx.done;
    return undefined;
  }
  await folders.delete(id);
  const gens = tx.objectStore("generations");
  const cleared: Generation[] = [];
  for (const row of await gens.index("byFolder").getAll(folderRange(id))) {
    const next = applyPatch(row, { folder: undefined });
    await gens.put(next);
    cleared.push(toPublic(next));
  }
  await tx.done;
  return { removed, cleared };
}
