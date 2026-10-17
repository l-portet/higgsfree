/** Every video filed in a Favorites folder, newest first, across every page of the library. */
import type { Generation } from "@shared/types";
import { listGenerations } from "./api";

/** A folder is not expected to need more pages than this; the loop stops rather than running forever. */
const MAX_PAGES = 50;

export async function videosInFolder(folderId: string, pageSize = 200): Promise<Generation[]> {
  const videos: Generation[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await listGenerations({ folder: folderId, type: "video", limit: pageSize, cursor });
    for (const g of res.items) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      videos.push(g);
    }
    if (!res.nextCursor || res.nextCursor === cursor || res.items.length === 0) return videos;
    cursor = res.nextCursor;
  }
  return videos;
}

/** A video the folder download can save: finished, and the file is still in the library. */
export function isDownloadableVideo(g: Generation): boolean {
  return g.type === "video" && g.status === "completed" && Boolean(g.output);
}
