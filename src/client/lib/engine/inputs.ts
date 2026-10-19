/** Inputs go to OpenRouter as data URLs, read from the library right before the call. */
import type { GenerationInputs } from "@shared/types";
import { blobToDataUrl } from "../data-url";
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

/** A stored video as a data URL, typed the way OpenRouter names the format (the id's extension was sniffed on the way in). */
export async function inputVideoDataUrl(id: string): Promise<string> {
  const blob = await getMediaBlob(id);
  if (!blob) throw badRequest(`Video ${id} is no longer in the library`);
  const ext = id.slice(id.lastIndexOf(".") + 1);
  const mime = Object.hasOwn(OPENROUTER_VIDEO_MIME, ext) ? OPENROUTER_VIDEO_MIME[ext as VideoFormat["ext"]] : blob.type || mimeForId(id);
  return blobToDataUrl(new Blob([blob], { type: mime }));
}
