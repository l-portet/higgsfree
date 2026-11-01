/** Request validation against the catalog entry, plus the plain limits the old zod schemas enforced. */
import type { ImageGenerateRequest, ImageModel, VideoGenerateRequest, VideoModel } from "@shared/types";
import { badRequest, UnsupportedOptionError } from "./errors";
import { isMediaId } from "./media-ids";

export const MAX_PROMPT_CHARS = 8000;
export const MAX_IMAGE_COUNT = 4;
export const MAX_REFERENCE_IMAGES = 8;

function assertMediaIds(ids: readonly (string | undefined)[], label: string, what = "image"): void {
  for (const id of ids) if (id !== undefined && !isMediaId(id)) throw badRequest(`${label} must be a stored ${what}`);
}

/** An upscaler: one image, no prompt, one run, a scale it offers. */
function validateImageUpscale(model: ImageModel, req: ImageGenerateRequest): void {
  const refs = req.referenceImages ?? [];
  assertMediaIds(refs, "The image to upscale");
  if (refs.length !== 1) throw badRequest(`${model.name} upscales one image at a time`);
  if (req.count !== 1) throw badRequest(`${model.name} makes one image per run`);
  const factors = model.caps.upscale?.factors ?? [];
  if (req.upscale !== undefined && !factors.includes(req.upscale)) {
    throw badRequest(factors.length ? `${model.name} upscales ${factors.map((f) => `${f}x`).join(" or ")}` : `${model.name} picks its own scale. Leave it unset.`);
  }
}

export function validateImageRequest(model: ImageModel, req: ImageGenerateRequest): void {
  if (model.caps.upscale) return validateImageUpscale(model, req);
  if (req.upscale !== undefined) throw badRequest(`${model.name} does not upscale`);
  if (!req.prompt.trim()) throw badRequest("Prompt is required");
  if (req.prompt.length > MAX_PROMPT_CHARS) throw badRequest(`Prompt is longer than ${MAX_PROMPT_CHARS} characters`);
  if (!Number.isInteger(req.count) || req.count < 1 || req.count > MAX_IMAGE_COUNT) throw badRequest(`count must be between 1 and ${MAX_IMAGE_COUNT}`);
  // `auto` means "don't send an aspect ratio" and is valid for every model.
  if (req.aspectRatio !== "auto" && !model.aspectRatios.includes(req.aspectRatio)) {
    throw new UnsupportedOptionError(model.name, "aspect ratio", req.aspectRatio, model.aspectRatios);
  }
  if (!model.sizes.includes(req.size)) throw new UnsupportedOptionError(model.name, "size", req.size, model.sizes);
  const refs = req.referenceImages ?? [];
  if (refs.length > MAX_REFERENCE_IMAGES) throw badRequest(`At most ${MAX_REFERENCE_IMAGES} reference images`);
  assertMediaIds(refs, "referenceImages");
  if (refs.length > 0 && !model.caps.imageToImage) throw badRequest(`${model.name} does not accept reference images`);
  if (refs.length === 0 && !model.caps.textToImage) throw badRequest(`${model.name} needs at least one reference image`);
  if (refs.length > model.caps.maxReferenceImages) {
    throw badRequest(`${model.name} accepts at most ${model.caps.maxReferenceImages} reference image(s)`);
  }
}

/**
 * Video editing: why the source video is outside the model's limits (its length and size, when known), or
 * undefined. The composer shows it before a run, the engine refuses with it before anything is uploaded.
 */
export function sourceVideoProblem(model: VideoModel, durationSec: number | undefined, bytes: number | undefined): string | undefined {
  const limits = model.editSource;
  if (!limits) return undefined;
  if (bytes !== undefined && limits.maxMb !== undefined && bytes > limits.maxMb * 1024 * 1024) {
    return `The video is ${Math.round(bytes / 1024 / 1024)} MB. ${model.name} takes up to ${limits.maxMb} MB.`;
  }
  if (durationSec === undefined) return undefined;
  if (limits.minSec !== undefined && durationSec < limits.minSec) return `The video is ${durationSec.toFixed(1)} s. ${model.name} needs at least ${limits.minSec} s.`;
  if (limits.maxSec !== undefined && !limits.truncates && durationSec > limits.maxSec + 0.05) {
    return `The video is ${Math.round(durationSec)} s. ${model.name} takes up to ${limits.maxSec} s.`;
  }
  return undefined;
}

export function validateVideoRequest(model: VideoModel, req: VideoGenerateRequest, prompt: string): void {
  if (prompt.length > MAX_PROMPT_CHARS) throw badRequest(`Prompt is longer than ${MAX_PROMPT_CHARS} characters`);
  if (model.caps.upscale) {
    assertMediaIds([req.sourceVideo], "The video to upscale", "video");
    if (!req.sourceVideo) throw badRequest(`${model.name} needs a video to upscale`);
    if (req.firstFrame || req.lastFrame || req.references?.length || req.referenceVideos?.length || req.referenceAudios?.length || req.motionVideo) {
      throw badRequest(`${model.name} takes a video only`);
    }
    const factors = model.caps.upscale.factors;
    if (req.upscale !== undefined && !factors.includes(req.upscale)) {
      throw badRequest(factors.length ? `${model.name} upscales ${factors.map((f) => `${f}x`).join(" or ")}` : `${model.name} takes a target resolution, not a scale`);
    }
    if (req.resolution !== undefined && !model.resolutions.includes(req.resolution)) {
      if (model.resolutions.length === 0) throw badRequest(`${model.name} takes a scale, not a resolution. Leave it unset.`);
      throw new UnsupportedOptionError(model.name, "resolution", req.resolution, model.resolutions);
    }
    return;
  }
  if (req.upscale !== undefined) throw badRequest(`${model.name} does not upscale`);
  if (model.caps.videoEdit) {
    assertMediaIds([req.sourceVideo], "The video to edit", "video");
    if (!req.sourceVideo) throw badRequest(`${model.name} needs a video to edit`);
    if (!prompt) throw badRequest("Say what to change in the video");
    if (req.firstFrame || req.lastFrame || req.references?.length || req.referenceVideos?.length || req.referenceAudios?.length || req.motionVideo) {
      throw badRequest(`${model.name} takes a video and a prompt only`);
    }
    if (req.resolution !== undefined && !model.resolutions.includes(req.resolution)) {
      if (model.resolutions.length === 0) throw badRequest(`${model.name} keeps the video's resolution. Leave it unset.`);
      throw new UnsupportedOptionError(model.name, "resolution", req.resolution, model.resolutions);
    }
    return;
  }
  if (req.sourceVideo) throw badRequest(`${model.name} does not edit videos`);
  if (model.caps.motionControl) {
    assertMediaIds([req.firstFrame, req.motionVideo], "The character image and the reference video");
    if (!req.firstFrame) throw badRequest(`${model.name} needs a character image`);
    if (!req.motionVideo) throw badRequest(`${model.name} needs a reference video`);
    if (req.orientation !== undefined && req.orientation !== "video" && req.orientation !== "image") throw badRequest("orientation must be video or image");
    if (req.references?.length || req.referenceVideos?.length || req.referenceAudios?.length) throw badRequest(`${model.name} takes a character image and a reference video only`);
    return;
  }
  const refVideos = req.referenceVideos ?? [];
  const refAudios = req.referenceAudios ?? [];
  if (req.motionVideo || (refVideos.length && !model.caps.mediaReferences)) throw badRequest(`${model.name} does not take a reference video`);
  if (refAudios.length && !model.caps.mediaReferences) throw badRequest(`${model.name} does not take reference audio`);
  if (!(req.duration > 0) || req.duration > 120) throw badRequest("duration must be between 1 and 120 seconds");
  const media = model.caps.mediaReferences;
  if (media) {
    assertMediaIds(refVideos, "Reference videos", "video");
    assertMediaIds(refAudios, "Reference audio", "audio clip");
    if (refVideos.length > media.videos) throw badRequest(`${model.name} takes at most ${media.videos} reference videos`);
    if (refAudios.length > media.audios) throw badRequest(`${model.name} takes at most ${media.audios} reference audio clips`);
    if ((refVideos.length || refAudios.length) && (req.firstFrame || req.lastFrame)) throw badRequest("Reference videos and audio do not go with frames. Remove the frames, or add the images as references.");
  }
  const refs = req.references ?? [];
  if (refs.length > MAX_REFERENCE_IMAGES) throw badRequest(`At most ${MAX_REFERENCE_IMAGES} references`);
  assertMediaIds([req.firstFrame, req.lastFrame, ...refs], "Frames and references");
  const hasFrames = Boolean(req.firstFrame || req.lastFrame);
  if (hasFrames && !model.caps.imageToVideo) throw badRequest(`${model.name} does not support image-to-video`);
  if (!hasFrames && !model.caps.textToVideo) throw badRequest(`${model.name} is image-to-video only. Add a first frame.`);
  if (req.lastFrame && !model.caps.lastFrame) throw badRequest(`${model.name} does not support a last-frame anchor`);
  if (refs.length > 0 && model.caps.references === false) throw badRequest(`${model.name} does not accept style references`);
  if (!hasFrames && !prompt) throw badRequest("Prompt is required for text-to-video");
  // aspect_ratio is dropped on i2v for `omitAspectRatioOnI2v` models, so only validate it when it will be sent.
  const aspectUsed = req.aspectRatio !== undefined && !(model.omitAspectRatioOnI2v && hasFrames);
  if (aspectUsed && req.aspectRatio && !model.aspectRatios.includes(req.aspectRatio)) {
    throw new UnsupportedOptionError(model.name, "aspect ratio", req.aspectRatio, model.aspectRatios);
  }
  if (req.resolution !== undefined && !model.resolutions.includes(req.resolution)) {
    // Discovered models list no resolutions at all: the provider picks, so there is nothing to allow.
    if (model.resolutions.length === 0) throw badRequest(`${model.name} does not accept a resolution. Leave it unset.`);
    throw new UnsupportedOptionError(model.name, "resolution", req.resolution, model.resolutions);
  }
}
