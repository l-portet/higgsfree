/** `listGenerations` reproduces the old SQL semantics: newest first, tuple cursor, filters, limits. */
import { beforeEach, describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import { insertGenerations, listGenerations, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT, toStored } from "../generations";

const base = Date.parse("2026-10-14T10:00:00.000Z");

function record(i: number, extra: Partial<Generation> = {}): Generation {
  const ts = new Date(base + i * 1000).toISOString();
  return {
    id: `gen_${String(i).padStart(8, "0")}`,
    type: i % 3 === 0 ? "video" : "image",
    status: i % 7 === 0 ? "failed" : "completed",
    prompt: `p${i}`,
    model: "m",
    modelName: "M",
    params: { aspectRatio: "1:1", size: "1K" },
    createdAt: ts,
    updatedAt: ts,
    ...extra,
  };
}

const TOTAL = 130;

beforeEach(async () => {
  const rows = Array.from({ length: TOTAL }, (_, i) => record(i, i % 10 === 0 ? { favorite: true } : {}));
  // One batch of four sharing a timestamp, to check that siblings do not break the cursor.
  const batchTs = new Date(base + 500 * 1000).toISOString();
  for (let j = 0; j < 4; j++) rows.push(record(1000 + j, { batchId: "batch_x", batchIndex: j, createdAt: batchTs, updatedAt: batchTs }));
  await insertGenerations(rows.map((g) => toStored(g)), 10_000);
});

describe("listGenerations", () => {
  it("returns the newest page with a cursor, batch siblings included", async () => {
    const page = await listGenerations();
    expect(page.items).toHaveLength(LIST_DEFAULT_LIMIT);
    expect(page.nextCursor).toBeTruthy();
    expect(page.items.slice(0, 4).map((g) => g.batchId)).toEqual(["batch_x", "batch_x", "batch_x", "batch_x"]);
    for (let i = 1; i < page.items.length; i++) {
      const a = page.items[i - 1];
      const b = page.items[i];
      expect(a && b && (a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id > b.id))).toBe(true);
    }
    expect(page.items[0]).not.toHaveProperty("fav");
    expect(page.items[0]).not.toHaveProperty("refs");
  });

  it("walks every record exactly once through cursors", async () => {
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listGenerations({ limit: 50, cursor });
      for (const g of page.items) {
        expect(seen.has(g.id)).toBe(false);
        seen.add(g.id);
      }
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(seen.size).toBe(TOTAL + 4);
    expect(pages).toBe(3);
  });

  it("accepts a bare createdAt cursor and clamps the limit", async () => {
    const first = await listGenerations({ limit: 1 });
    const newest = first.items[0];
    if (!newest) throw new Error("empty");
    const rest = await listGenerations({ cursor: newest.createdAt, limit: LIST_MAX_LIMIT + 50 });
    expect(rest.items).toHaveLength(TOTAL + 4 - 4); // the whole batch shares that instant and is skipped
    expect(rest.items.every((g) => g.createdAt < newest.createdAt)).toBe(true);
    expect((await listGenerations({ limit: 0 })).items).toHaveLength(1);
  });

  it("filters by type, status, favorite and combinations", async () => {
    const videos = await listGenerations({ type: "video", limit: 200 });
    expect(videos.items.length).toBeGreaterThan(0);
    expect(videos.items.every((g) => g.type === "video")).toBe(true);
    const failed = await listGenerations({ status: "failed", limit: 200 });
    expect(failed.items.every((g) => g.status === "failed")).toBe(true);
    const failedVideos = await listGenerations({ type: "video", status: "failed", limit: 200 });
    expect(failedVideos.items.every((g) => g.type === "video" && g.status === "failed")).toBe(true);
    expect(failedVideos.items.length).toBe(videos.items.filter((g) => g.status === "failed").length);
    const kept = await listGenerations({ favorite: true, limit: 200 });
    expect(kept.items).toHaveLength(13);
    expect(kept.items.every((g) => g.favorite === true)).toBe(true);
    const keptImages = await listGenerations({ favorite: true, type: "image", limit: 200 });
    expect(keptImages.items.every((g) => g.favorite === true && g.type === "image")).toBe(true);
    expect(keptImages.items.length).toBe(kept.items.filter((g) => g.type === "image").length);
    const notKept = await listGenerations({ favorite: false, limit: 200 });
    expect(notKept.items).toHaveLength(TOTAL + 4 - 13);
    expect(notKept.items.every((g) => !g.favorite)).toBe(true);
  });

  it("pages a filtered list with the cursor too", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listGenerations({ type: "image", limit: 20, cursor });
      seen.push(...page.items.map((g) => g.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe((await listGenerations({ type: "image", limit: 200 })).items.length);
  });
});
