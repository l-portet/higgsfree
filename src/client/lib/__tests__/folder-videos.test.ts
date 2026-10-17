/** A folder download walks every page and keeps only that folder's videos. */
import { beforeEach, describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import { insertGenerations, toStored } from "@/lib/db/generations";
import { isDownloadableVideo, videosInFolder } from "@/lib/folder-videos";

const TRAVEL = "fld_travel0001";
const base = Date.parse("2026-10-14T10:00:00.000Z");

function video(i: number, extra: Partial<Generation> = {}): Generation {
  const ts = new Date(base + i * 1000).toISOString();
  return {
    id: `gen_${String(i).padStart(8, "0")}`,
    type: "video",
    status: "completed",
    prompt: `p${i}`,
    model: "m",
    modelName: "M",
    params: { duration: 5 },
    output: { id: `gen_${String(i).padStart(8, "0")}.mp4`, mime: "video/mp4", bytes: 10 },
    favorite: true,
    folder: TRAVEL,
    createdAt: ts,
    updatedAt: ts,
    ...extra,
  };
}

beforeEach(async () => {
  const rows = [
    video(1),
    video(2),
    video(3),
    video(4, { status: "failed", output: undefined }),
    video(5, { status: "running", output: undefined }),
    video(6, { folder: "fld_other00001" }),
    {
      ...video(7),
      type: "image" as const,
      params: { aspectRatio: "1:1" as const, size: "1K" as const },
      output: { id: "gen_00000007.png", mime: "image/png", bytes: 10 },
    },
  ];
  await insertGenerations(
    rows.map((g) => toStored(g)),
    100
  );
});

describe("videosInFolder", () => {
  it("returns every video in the folder, newest first, and pages past a short limit", async () => {
    const videos = await videosInFolder(TRAVEL, 2);
    expect(videos.map((g) => g.id)).toEqual([
      "gen_00000005",
      "gen_00000004",
      "gen_00000003",
      "gen_00000002",
      "gen_00000001",
    ]);
    expect(videos.filter(isDownloadableVideo).map((g) => g.id)).toEqual([
      "gen_00000003",
      "gen_00000002",
      "gen_00000001",
    ]);
  });
});
