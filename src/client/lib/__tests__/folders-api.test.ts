/** The folder API: cleaned unique names, filing records through `updateGeneration`, delete, and the change feed. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeEvent, Generation } from "@shared/types";
import * as api from "@/lib/api";
import { insertGenerations, toStored } from "@/lib/db/generations";
import { subscribeEvents } from "@/lib/live";

const ts = "2026-10-14T10:00:00.000Z";
const record = (id: string, extra: Partial<Generation> = {}): Generation => ({
  id,
  type: "image",
  status: "completed",
  prompt: "p",
  model: "m",
  modelName: "M",
  params: { aspectRatio: "1:1", size: "1K" },
  createdAt: ts,
  updatedAt: ts,
  ...extra,
});

const events: ChangeEvent[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(async () => {
  events.length = 0;
  unsubscribe = subscribeEvents((ev) => {
    events.push(ev);
  });
  await insertGenerations([record("gen_aaaaaaaa"), record("gen_bbbbbbbb", { favorite: true })].map((g) => toStored(g)), 100);
});

afterEach(() => unsubscribe());

describe("folders", () => {
  it("creates folders with cleaned, unique names and lists them newest first", async () => {
    // A minute between folders, so the order never rests on two creations in the same millisecond.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T09:00:00Z"));
    const travel = await api.createFolder({ name: "  Travel   shots " });
    expect(travel.name).toBe("Travel shots");
    expect(travel.id).toMatch(/^fld_/);
    await expect(api.createFolder({ name: "   " })).rejects.toMatchObject({ status: 400 });
    await expect(api.createFolder({ name: "travel SHOTS" })).rejects.toMatchObject({ status: 409 });
    vi.setSystemTime(new Date("2026-10-15T09:01:00Z"));
    const set10 = await api.createFolder({ name: "Set 10" });
    vi.setSystemTime(new Date("2026-10-15T09:02:00Z"));
    const set2 = await api.createFolder({ name: "Set 2" });
    const { folders, summaries } = await api.listFolders();
    expect(folders.map((f) => f.id)).toEqual([set2.id, set10.id, travel.id]);
    expect(summaries[travel.id]).toEqual({ count: 0, newest: [] });
    // A rename does not move a folder.
    vi.setSystemTime(new Date("2026-10-15T09:03:00Z"));
    await api.renameFolder(travel.id, { name: "Aaa first by name" });
    expect((await api.listFolders()).folders.map((f) => f.id)).toEqual([set2.id, set10.id, travel.id]);
    expect(events.filter((e) => e.type === "folder")).toHaveLength(4);
  });

  it("renames, refusing a name another folder has", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T09:00:00Z"));
    const a = await api.createFolder({ name: "A" });
    vi.setSystemTime(new Date("2026-10-15T09:01:00Z"));
    await api.createFolder({ name: "B" });
    await expect(api.renameFolder(a.id, { name: "b" })).rejects.toMatchObject({ status: 409 });
    await expect(api.renameFolder("fld_nope000000", { name: "C" })).rejects.toMatchObject({ status: 404 });
    expect(await api.renameFolder(a.id, { name: " A " })).toEqual(a); // unchanged: no write, no event
    const renamed = await api.renameFolder(a.id, { name: "A2" });
    expect(renamed).toMatchObject({ id: a.id, name: "A2", createdAt: a.createdAt });
    expect(Date.parse(renamed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(a.updatedAt));
    expect((await api.listFolders()).folders.map((f) => f.name)).toEqual(["B", "A2"]);
    expect(events.filter((e) => e.type === "folder")).toHaveLength(3);
  });

  it("files records through updateGeneration: a folder keeps, no heart unfiles, unknown folders are refused", async () => {
    const travel = await api.createFolder({ name: "Travel" });
    const filed = await api.updateGeneration("gen_aaaaaaaa", { folder: travel.id });
    expect(filed).toMatchObject({ favorite: true, folder: travel.id });
    await expect(api.updateGeneration("gen_bbbbbbbb", { folder: "fld_nope000000" })).rejects.toMatchObject({ status: 404 });
    await expect(api.updateGeneration("gen_bbbbbbbb", { favorite: false, folder: travel.id })).rejects.toMatchObject({ status: 400 });
    await expect(api.updateGeneration("gen_bbbbbbbb", {})).rejects.toMatchObject({ status: 400 });
    expect((await api.listFolders()).summaries[travel.id]).toMatchObject({ count: 1, newest: [expect.objectContaining({ id: "gen_aaaaaaaa" })] });

    const unfiled = await api.updateGeneration("gen_aaaaaaaa", { folder: null });
    expect(unfiled.favorite).toBe(true);
    expect(unfiled).not.toHaveProperty("folder");
    await api.updateGeneration("gen_aaaaaaaa", { folder: travel.id });
    const dropped = await api.updateGeneration("gen_aaaaaaaa", { favorite: false });
    expect(dropped).not.toHaveProperty("favorite");
    expect(dropped).not.toHaveProperty("folder");
    expect((await api.listFolders()).summaries[travel.id]?.count).toBe(0);
    expect(events.filter((e) => e.type === "generation")).toHaveLength(4);
  });

  it("deleting a folder keeps its records, announces each one, and refuses a second time", async () => {
    const travel = await api.createFolder({ name: "Travel" });
    await api.updateGeneration("gen_aaaaaaaa", { folder: travel.id });
    await api.updateGeneration("gen_bbbbbbbb", { folder: travel.id });
    events.length = 0;

    await api.deleteFolder(travel.id);
    expect(events[0]).toEqual({ type: "folder-deleted", id: travel.id });
    const announced = events.filter((e): e is Extract<ChangeEvent, { type: "generation" }> => e.type === "generation");
    expect(announced.map((e) => e.generation.id).sort()).toEqual(["gen_aaaaaaaa", "gen_bbbbbbbb"]);
    expect(announced.every((e) => e.generation.favorite === true && e.generation.folder === undefined)).toBe(true);
    expect((await api.listGenerations({ favorite: true })).items).toHaveLength(2);
    expect((await api.listFolders()).folders).toEqual([]);
    await expect(api.deleteFolder(travel.id)).rejects.toMatchObject({ status: 404 });
  });
});
