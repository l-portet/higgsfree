/** The `folders` store: the v1 → v2 upgrade, listing a folder's records, a delete that unfiles them, clear. */
import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import type { Folder, Generation } from "@shared/types";
import { countInFolder, listFolders, putFolder, removeFolder } from "../folders";
import { clearLibrary, getAllGenerations, insertGenerations, listGenerations, toStored } from "../generations";
import { closeDb, getDb } from "../index";
import { DB_NAME } from "../schema";

const base = Date.parse("2026-10-14T10:00:00.000Z");
const at = (i: number): string => new Date(base + i * 1000).toISOString();

function record(i: number, extra: Partial<Generation> = {}): Generation {
  return {
    id: `gen_${String(i).padStart(8, "0")}`,
    type: "image",
    status: "completed",
    prompt: `p${i}`,
    model: "m",
    modelName: "M",
    params: { aspectRatio: "1:1", size: "1K" },
    createdAt: at(i),
    updatedAt: at(i),
    ...extra,
  };
}

const folder = (id: string, name: string): Folder => ({ id, name, createdAt: at(0), updatedAt: at(0) });
const TRAVEL = folder("fld_travel0001", "Travel");
const WORK = folder("fld_work000001", "Work");

describe("folders store", () => {
  it("upgrades a v1 library in place: records kept, the folders store and the byFolder index added", async () => {
    closeDb();
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const g = db.createObjectStore("generations", { keyPath: "id" });
        g.createIndex("byCreated", ["createdAt", "id"]);
        g.createIndex("byType", ["type", "createdAt", "id"]);
        g.createIndex("byStatus", ["status", "createdAt", "id"]);
        g.createIndex("byTypeStatus", ["type", "status", "createdAt", "id"]);
        g.createIndex("byFavorite", ["fav", "createdAt", "id"]);
        g.createIndex("byRef", "refs", { multiEntry: true });
        const m = db.createObjectStore("media", { keyPath: "id" });
        m.createIndex("byKind", "kind");
        m.createIndex("byCreated", "createdAt");
      },
    });
    await v1.put("generations", toStored(record(1, { favorite: true })));
    v1.close();

    const db = await getDb();
    expect(db.version).toBe(2);
    expect(db.objectStoreNames.contains("folders")).toBe(true);
    expect(db.transaction("generations").store.indexNames.contains("byFolder")).toBe(true);
    expect((await listGenerations({ favorite: true })).items.map((g) => g.id)).toEqual(["gen_00000001"]);
    await putFolder(TRAVEL);
    expect(await listFolders()).toEqual([TRAVEL]);
  });

  it("lists a folder's records newest first through the cursor, counts them, and still filters by favorite / type", async () => {
    await putFolder(TRAVEL);
    await putFolder(WORK);
    const rows: Generation[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push(record(i, i % 3 === 0 ? { favorite: true, folder: TRAVEL.id } : i % 3 === 1 ? { favorite: true, folder: WORK.id } : { favorite: true }));
    }
    rows.push(record(100, { folder: TRAVEL.id })); // not kept: the folder is dropped on the way in
    await insertGenerations(rows.map((g) => toStored(g)), 1000);

    expect(await countInFolder(TRAVEL.id)).toBe(10);
    expect(await countInFolder(WORK.id)).toBe(10);
    const first = await listGenerations({ folder: TRAVEL.id, limit: 4 });
    expect(first.items.map((g) => g.id)).toEqual(["gen_00000027", "gen_00000024", "gen_00000021", "gen_00000018"]);
    expect(first.items.every((g) => g.favorite === true && g.folder === TRAVEL.id)).toBe(true);
    expect(first.items[0]).not.toHaveProperty("fav");
    const rest = await listGenerations({ folder: TRAVEL.id, cursor: first.nextCursor, limit: 100 });
    expect(rest.items).toHaveLength(6);
    expect(rest.nextCursor).toBeUndefined();
    expect((await listGenerations({ folder: TRAVEL.id, favorite: false })).items).toHaveLength(0);
    expect((await listGenerations({ folder: TRAVEL.id, type: "video" })).items).toHaveLength(0);
    expect((await getAllGenerations()).find((g) => g.id === "gen_00000100")?.folder).toBeUndefined();
    expect((await listGenerations({ favorite: true, limit: 100 })).items).toHaveLength(30);
  });

  it("deleting a folder unfiles its records (still kept) and reports them; clearing the library drops folders too", async () => {
    await putFolder(TRAVEL);
    const rows = [record(1, { favorite: true, folder: TRAVEL.id }), record(2, { favorite: true, folder: TRAVEL.id }), record(3, { favorite: true })];
    await insertGenerations(rows.map((g) => toStored(g)), 100);

    const res = await removeFolder(TRAVEL.id);
    expect(res?.removed).toEqual(TRAVEL);
    expect(res?.cleared.map((g) => g.id).sort()).toEqual(["gen_00000001", "gen_00000002"]);
    expect(res?.cleared.every((g) => g.favorite === true && g.folder === undefined && g.updatedAt > at(2))).toBe(true);
    expect(await removeFolder(TRAVEL.id)).toBeUndefined();
    expect(await countInFolder(TRAVEL.id)).toBe(0);
    expect((await listGenerations({ favorite: true })).items).toHaveLength(3);

    await putFolder(WORK);
    await clearLibrary();
    expect(await listFolders()).toEqual([]);
    expect(await getAllGenerations()).toEqual([]);
  });
});
