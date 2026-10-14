/**
 * Media ids: the keys of the `media` store and what records point at. Outputs are
 * `<generation id>.<ext>` (`gen_abc.png`, `gen_abc.mp4`), uploads `up_<id>.<ext>`.
 * The extension rides along so a name alone says what the bytes are.
 */
import type { GenerationInputs } from "@shared/types";
import { shortId } from "./uid";

export const MEDIA_ID = /^(gen|up)_[A-Za-z0-9_-]{8,32}\.(png|jpg|webp|mp4|mov|webm)$/;
export const GENERATION_ID = /^gen_[A-Za-z0-9_-]{8,32}$/;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Motion-control reference videos (fal's single-part upload limit). */
export const MAX_VIDEO_UPLOAD_BYTES = 90 * 1024 * 1024;

export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export type MediaKind = "output" | "upload";

export const newGenerationId = (): string => `gen_${shortId(12)}`;
export const newBatchId = (): string => `batch_${shortId(10)}`;
export const newUploadId = (ext: string): string => `up_${shortId(12)}.${ext}`;
export const outputMediaId = (generationId: string, ext: string): string => `${generationId}.${ext}`;

export function isMediaId(s: unknown): s is string {
  return typeof s === "string" && MEDIA_ID.test(s);
}

export function isGenerationId(s: unknown): s is string {
  return typeof s === "string" && GENERATION_ID.test(s);
}

export function mediaKind(id: string): MediaKind | undefined {
  if (!isMediaId(id)) return undefined;
  return id.startsWith("gen_") ? "output" : "upload";
}

/** The generation whose output this media is (`gen_abc.png` → `gen_abc`); undefined for uploads. */
export function ownerGenerationId(mediaId: string): string | undefined {
  return mediaKind(mediaId) === "output" ? mediaId.slice(0, mediaId.lastIndexOf(".")) : undefined;
}

export function mimeForId(id: string): string {
  return MIME_BY_EXT[id.slice(id.lastIndexOf(".") + 1)] ?? "application/octet-stream";
}

/** Every media id a record's inputs point at (uploads and other records' outputs), de-duplicated. */
export function inputMediaIds(inputs: GenerationInputs | undefined): string[] {
  if (!inputs) return [];
  const ids = new Set<string>();
  for (const id of [...(inputs.referenceImages ?? []), inputs.firstFrame, inputs.lastFrame, inputs.motionVideo]) if (id && isMediaId(id)) ids.add(id);
  return [...ids];
}
