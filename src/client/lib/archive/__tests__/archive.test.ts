/** Export → import round trip into a fresh library, idempotent re-import, and the guards around bad archives. */
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import { buildArchive, importLibrary } from "..";
import { closeDb } from "../../db/index";
import { getAllGenerations, insertGenerations, toPublic, toStored } from "../../db/generations";
import { getMediaBlob, putMedia } from "../../db/media";
import { PNG_2X2 } from "../../../__tests__/mock-openrouter";

const ts = "2026-10-14T10:00:00.000Z";
const later = "2026-10-14T11:00:00.000Z";

const A: Generation = {
  id: "gen_aaaaaaaa", type: "image", status: "completed", prompt: "a", model: "m", modelName: "M", params: { aspectRatio: "1:1", size: "1K" },
  inputs: { referenceImages: ["up_11111111.png"] }, output: { id: "gen_aaaaaaaa.png", mime: "image/png", bytes: PNG_2X2.length, width: 2, height: 2 },
  favorite: true, costUsd: 0.1, createdAt: ts, updatedAt: ts, completedAt: ts, elapsedMs: 10,
};
const MP4ISH = Uint8Array.from([0, 0, 0, 8, 109, 100, 97, 116]);
const B: Generation = {
  id: "gen_bbbbbbbb", type: "video", status: "completed", prompt: "b", model: "m", modelName: "M", params: { duration: 5 },
  inputs: { firstFrame: "gen_aaaaaaaa.png" }, output: { id: "gen_bbbbbbbb.mp4", mime: "video/mp4", bytes: MP4ISH.length, durationSec: 5 },
  createdAt: later, updatedAt: later, completedAt: later,
};
const C: Generation = { id: "gen_cccccccc", type: "image", status: "failed", error: "boom", prompt: "c", model: "m", modelName: "M", params: { aspectRatio: "1:1", size: "1K" }, createdAt: ts, updatedAt: ts };
const D: Generation = { id: "gen_dddddddd", type: "video", status: "running", prompt: "d", model: "m", modelName: "M", params: { duration: 5 }, createdAt: ts, updatedAt: ts };

async function seed(): Promise<void> {
  await putMedia({ id: "up_11111111.png", kind: "upload", mime: "image/png", bytes: PNG_2X2.length, createdAt: ts, blob: new Blob([PNG_2X2], { type: "image/png" }) });
  await putMedia({ id: "gen_aaaaaaaa.png", kind: "output", mime: "image/png", bytes: PNG_2X2.length, createdAt: ts, blob: new Blob([PNG_2X2], { type: "image/png" }) });
  await putMedia({ id: "gen_bbbbbbbb.mp4", kind: "output", mime: "video/mp4", bytes: MP4ISH.length, createdAt: later, blob: new Blob([MP4ISH], { type: "video/mp4" }) });
  await insertGenerations([A, B, C, D].map((g) => toStored(g)), 100);
}

const freshLibrary = (): void => {
  closeDb();
  globalThis.indexedDB = new IDBFactory();
};

const bytesOf = async (id: string): Promise<number[]> => Array.from(new Uint8Array(await (await getMediaBlob(id))!.arrayBuffer()));

beforeEach(seed);

describe("export + import", () => {
  it("round-trips records, files and favorites into an empty library, and re-imports are no-ops", async () => {
    const { blob, manifest } = await buildArchive();
    expect(manifest).toMatchObject({ format: "higgsfree-library", version: 1, counts: { generations: 3, media: 3 } });
    expect(manifest.bytes).toBe(PNG_2X2.length * 2 + MP4ISH.length);
    expect(blob.size).toBeGreaterThan(manifest.bytes);

    freshLibrary();
    const result = await importLibrary(blob);
    expect(result).toMatchObject({ imported: 3, replaced: 0, skipped: 0, missingMedia: 0, invalid: 0, mediaWritten: 3 });
    const rows = (await getAllGenerations()).map(toPublic).sort((a, b) => a.id.localeCompare(b.id));
    expect(rows).toEqual([A, B, C]); // D was running: not exported
    expect(await bytesOf("gen_aaaaaaaa.png")).toEqual(Array.from(PNG_2X2));
    expect(await bytesOf("up_11111111.png")).toEqual(Array.from(PNG_2X2));
    expect(await bytesOf("gen_bbbbbbbb.mp4")).toEqual(Array.from(MP4ISH));
    expect((await getMediaBlob("gen_aaaaaaaa.png"))?.type).toBe("image/png");

    const again = await importLibrary(blob);
    expect(again).toMatchObject({ imported: 0, skipped: 3, mediaWritten: 0 });
    const replaced = await importLibrary(blob, { mode: "replace" });
    expect(replaced).toMatchObject({ imported: 0, replaced: 3, skipped: 0 });
  });

  it("exports a scope and can leave uploads out", async () => {
    const favorites = await buildArchive({ scope: "favorites" });
    expect(favorites.manifest.counts).toEqual({ generations: 1, media: 2 });
    const videos = await buildArchive({ scope: "video", includeUploads: false });
    expect(videos.manifest.counts).toEqual({ generations: 1, media: 1 });
  });

  it("skips a completed record whose file is missing, drops dangling inputs, and rejects foreign archives", async () => {
    const zip = await import("@zip.js/zip.js");
    zip.configure({ useWebWorkers: false });
    const make = async (records: unknown[], manifest: unknown): Promise<Blob> => {
      const w = new zip.ZipWriter<Blob>(new zip.BlobWriter("application/zip"), { level: 0 });
      await w.add("manifest.json", new zip.TextReader(JSON.stringify(manifest)));
      await w.add("generations.json", new zip.TextReader(JSON.stringify(records)));
      return w.close();
    };
    const manifest = { format: "higgsfree-library", version: 1, exportedAt: ts, app: { version: "test" }, counts: { generations: 2, media: 0 }, bytes: 0 };
    const orphanOutput = { ...A, id: "gen_zzzzzzzz", output: { ...A.output, id: "gen_zzzzzzzz.png" } };
    const danglingInput = { ...C, id: "gen_yyyyyyyy", inputs: { referenceImages: ["up_nonexist.png", "up_11111111.png"] } };
    const running = { ...D, id: "gen_xxxxxxxx" };
    const result = await importLibrary(await make([orphanOutput, danglingInput, running, { junk: true }], manifest));
    expect(result).toMatchObject({ imported: 2, missingMedia: 1, invalid: 1, mediaWritten: 0 });
    const rows = await getAllGenerations();
    expect(rows.find((g) => g.id === "gen_zzzzzzzz")).toBeUndefined();
    expect(rows.find((g) => g.id === "gen_yyyyyyyy")?.inputs).toEqual({ referenceImages: ["up_11111111.png"] }); // the existing upload is kept
    expect(rows.find((g) => g.id === "gen_xxxxxxxx")).toMatchObject({ status: "failed", error: expect.stringContaining("Interrupted") });

    await expect(importLibrary(await make([], { format: "something-else", version: 1 }))).rejects.toMatchObject({ status: 400, error: "Not a higgsfree library archive" });
    await expect(importLibrary(await make([], { ...manifest, version: 99 }))).rejects.toMatchObject({ status: 400, error: expect.stringContaining("newer app") });
    await expect(importLibrary(new Blob([new Uint8Array([1, 2, 3])]))).rejects.toMatchObject({ status: 400 });
  });
});
