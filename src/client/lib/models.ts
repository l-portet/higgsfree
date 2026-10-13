/**
 * Catalog helpers shared by the pickers and panels: option lists for validating
 * persisted values, and display metadata derived from a model's constraints.
 */
import type { ImageAspectRatio, ImageParams, ImageSize, VideoAspectRatio, VideoModel, VideoParams, VideoResolution } from "@shared/types";
import { IMAGE_ASPECT_RATIOS, PROVIDER_LABEL, VIDEO_ASPECT_RATIOS, allowedDurations } from "@shared/models";

/** Human name for a provider slug (`google` → `Google`); unknown slugs are shown as-is. */
export function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider;
}

/** Narrow a generation's params: image params carry `size`, video params carry `duration`. */
export function isImageParams(p: ImageParams | VideoParams): p is ImageParams {
  return "size" in p;
}

export const IMAGE_SIZES: ImageSize[] = ["1K", "2K", "4K"];
/** Lowest → highest. */
export const VIDEO_RESOLUTIONS: VideoResolution[] = ["480p", "720p", "768p", "1080p", "2K", "4K"];

export function isImageAspectRatio(v: unknown): v is ImageAspectRatio {
  return typeof v === "string" && (IMAGE_ASPECT_RATIOS as string[]).includes(v);
}
export function isImageSize(v: unknown): v is ImageSize {
  return typeof v === "string" && (IMAGE_SIZES as string[]).includes(v);
}
export function isVideoAspectRatio(v: unknown): v is VideoAspectRatio {
  return typeof v === "string" && (VIDEO_ASPECT_RATIOS as string[]).includes(v);
}
export function isVideoResolution(v: unknown): v is VideoResolution {
  return typeof v === "string" && (VIDEO_RESOLUTIONS as string[]).includes(v);
}

/** Highest resolution a video model offers (e.g. "1080p"). */
export function maxResolution(m: VideoModel): VideoResolution | undefined {
  let best: VideoResolution | undefined;
  for (const r of m.resolutions) {
    if (!best || VIDEO_RESOLUTIONS.indexOf(r) > VIDEO_RESOLUTIONS.indexOf(best)) best = r;
  }
  return best;
}

/** "4s–30s" (or "5s" when only one duration is allowed). */
export function durationRange(m: VideoModel): string {
  const list = allowedDurations(m);
  const min = list[0];
  const max = list[list.length - 1];
  if (min === undefined || max === undefined) return "";
  return min === max ? `${min}s` : `${min}s–${max}s`;
}

/** "1080p · 4s–30s" for a model row's second line. */
export function modelMeta(m: VideoModel): string {
  return [maxResolution(m), durationRange(m)].filter(Boolean).join(" · ");
}
