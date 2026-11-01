/** Inputs go to OpenRouter as data URLs, read from the library right before the call. */
import type { GenerationInputs } from "@shared/types";
import { blobToDataUrl, parseDataUrl } from "../data-url";
import { detectImage } from "../image-meta";
import { getMediaBlob, mediaExists } from "../db/media";
import { badRequest } from "../errors";
import { mimeForId } from "../media-ids";
import { OPENROUTER_VIDEO_MIME, type VideoFormat } from "../video-meta";

/** 400 naming the input when a referenced image or video to edit is no longer in the library. */
export async function assertInputsExist(inputs: GenerationInputs): Promise<void> {
  const checks: [string, string | undefined][] = [
    ["First frame", inputs.firstFrame],
    ["Last frame", inputs.lastFrame],
    ["Video to edit", inputs.sourceVideo],
    ...(inputs.referenceImages ?? []).map((id, i): [string, string] => [`Reference image ${i + 1}`, id]),
    ...(inputs.referenceVideos ?? []).map((id, i): [string, string] => [`Reference video ${i + 1}`, id]),
    ...(inputs.referenceAudios ?? []).map((id, i): [string, string] => [`Reference audio ${i + 1}`, id]),
  ];
  for (const [label, id] of checks) {
    if (id && !(await mediaExists(id))) throw badRequest(`${label} is no longer in the library (${id})`);
  }
}

export async function inputDataUrl(id: string): Promise<string> {
  const blob = await getMediaBlob(id);
  if (!blob) throw badRequest(`Image ${id} is no longer in the library`);
  return blobToDataUrl(blob.type ? blob : new Blob([blob], { type: mimeForId(id) }));
}

export function inputDataUrls(ids: readonly string[]): Promise<string[]> {
  return Promise.all(ids.map(inputDataUrl));
}

/** A stored image's size, from its header (undefined when it cannot be read). */
export async function storedImageSize(id: string): Promise<{ width?: number; height?: number }> {
  const blob = await getMediaBlob(id);
  if (!blob) return {};
  const meta = detectImage(new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer()));
  return meta ? { width: meta.width, height: meta.height } : {};
}

/** An image data URL as PNG, for an endpoint that takes nothing else (Recraft Crisp on fal): redrawn on a canvas unless it is one already. */
export async function pngDataUrl(dataUrl: string): Promise<string> {
  if (dataUrl.startsWith("data:image/png")) return dataUrl;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw badRequest("The image could not be read");
  const bitmap = await createImageBitmap(new Blob([parsed.bytes], { type: parsed.mime }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return blobToDataUrl(await canvas.convertToBlob({ type: "image/png" }));
}

/** A stored video as a data URL, typed the way OpenRouter names the format (the id's extension was sniffed on the way in). */
export async function inputVideoDataUrl(id: string): Promise<string> {
  const blob = await getMediaBlob(id);
  if (!blob) throw badRequest(`Video ${id} is no longer in the library`);
  const ext = id.slice(id.lastIndexOf(".") + 1);
  const mime = Object.hasOwn(OPENROUTER_VIDEO_MIME, ext) ? OPENROUTER_VIDEO_MIME[ext as VideoFormat["ext"]] : blob.type || mimeForId(id);
  return blobToDataUrl(new Blob([blob], { type: mime }));
}
