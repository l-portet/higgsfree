/** A note on a video: trimmed, video-only, kept across later writes, and round-tripped by an archive. */
import { describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import * as api from "@/lib/api";
import { sanitizeRecord } from "@/lib/archive/manifest";
import {
  getGeneration,
  insertGenerations,
  patchGeneration,
  toPublic,
  toStored,
} from "@/lib/db/generations";
import { NOTE_MAX } from "@/lib/notes";

const ts = "2026-10-14T10:00:00.000Z";

const video = (id: string, extra: Partial<Generation> = {}): Generation => ({
  id,
  type: "video",
  status: "completed",
  prompt: "a slow dolly",
  model: "m",
  modelName: "M",
  params: { duration: 5 },
  createdAt: ts,
  updatedAt: ts,
  ...extra,
});

const image = (id: string): Generation => ({
  id,
  type: "image",
  status: "completed",
  prompt: "a cup",
  model: "m",
  modelName: "M",
  params: { aspectRatio: "1:1", size: "1K" },
  createdAt: ts,
  updatedAt: ts,
});

describe("video notes", () => {
  it("saves a trimmed note, clears it, and refuses one on an image", async () => {
    await insertGenerations(
      [video("gen_aaaaaaaa"), image("gen_bbbbbbbb")].map((g) => toStored(g)),
      100
    );

    const saved = await api.updateGeneration("gen_aaaaaaaa", { note: "  dawn take  " });
    expect(saved.note).toBe("dawn take");
    expect((await api.getGeneration("gen_aaaaaaaa")).note).toBe("dawn take");

    const clipped = await api.updateGeneration("gen_aaaaaaaa", {
      note: ` ${"x".repeat(NOTE_MAX + 40)} `,
    });
    expect(clipped.note).toHaveLength(NOTE_MAX);

    await api.updateGeneration("gen_aaaaaaaa", { favorite: true });
    await patchGeneration("gen_aaaaaaaa", { costUsd: 0.2 });
    expect(await api.getGeneration("gen_aaaaaaaa")).toMatchObject({
      note: "x".repeat(NOTE_MAX),
      favorite: true,
      costUsd: 0.2,
    });

    const cleared = await api.updateGeneration("gen_aaaaaaaa", { note: "   " });
    expect(cleared).not.toHaveProperty("note");
    expect(await getGeneration("gen_aaaaaaaa")).not.toHaveProperty("note");

    await expect(api.updateGeneration("gen_bbbbbbbb", { note: "nope" })).rejects.toMatchObject({
      status: 400,
      error: "Only a video can have a note",
    });
    await expect(api.updateGeneration("gen_cccccccc", { note: "missing" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      api.updateGeneration("gen_aaaaaaaa", { note: 4 as unknown as string })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("keeps a video note through an archive and drops one that is blank or on an image", () => {
    const kept = sanitizeRecord({ ...video("gen_aaaaaaaa"), note: "  hello  " });
    expect(kept?.note).toBe("hello");
    const clipped = sanitizeRecord({ ...video("gen_aaaaaaaa"), note: "y".repeat(NOTE_MAX + 10) });
    expect(clipped?.note).toHaveLength(NOTE_MAX);
    expect(sanitizeRecord({ ...video("gen_aaaaaaaa"), note: "  " })).not.toHaveProperty("note");
    const picture = sanitizeRecord({ ...image("gen_bbbbbbbb"), note: "not a video" });
    expect(picture).not.toHaveProperty("note");
    expect(toPublic(toStored(video("gen_aaaaaaaa", { note: "kept" }))).note).toBe("kept");
  });
});
