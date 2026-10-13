/**
 * Image inputs attached in the composers (reference images, first / last frames). A frame is a
 * media id in the local library: storing a file is one IndexedDB write, so there is no preview
 * data URL and no upload-in-flight state. Thumbnails resolve the id with `useMediaUrl`.
 */
import { toast } from "sonner";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { validateImageFile } from "@/lib/files";
import { uid } from "@/lib/uid";

export interface Frame {
  id: string;
  name: string;
  /** Media id in the library (`up_xyz.jpg`, `gen_abc.png`). */
  mediaId: string;
  width?: number;
  height?: number;
}

/** Wrap an already-stored media id (Animate hand-off, Reuse prompt). */
export function frameFromMedia(mediaId: string, name = "image"): Frame {
  return { id: uid(), name, mediaId };
}

/** Value sent with a generate request. */
export function frameInput(f: Frame): string {
  return f.mediaId;
}

/**
 * Validate and store the file in the library. Resolves `null` (after a toast) when the file was
 * rejected or could not be stored (unsupported type, over the limit, storage full).
 */
export async function loadFrame(file: File): Promise<Frame | null> {
  const problem = validateImageFile(file);
  if (problem) {
    toast.error(problem);
    return null;
  }
  try {
    const res = await api.upload(file);
    return { id: uid(), name: file.name, mediaId: res.media.id, width: res.media.width, height: res.media.height };
  } catch (err) {
    toast.error("Couldn't store the image", { description: describeApiError(err) });
    return null;
  }
}
