/**
 * Pure request builders for fal: the app's options mapped onto each model's field names
 * (`FalImageRoute` / `FalVideoRoute` in the catalog). Inputs are urls fal can fetch: data URLs
 * for images, an uploaded file url for a video (motion control's reference, the video being edited).
 */
import type { FalVideoRoute, ImageAspectRatio, ImageModel, ImageSize, MotionOrientation, VideoAspectRatio, VideoModel, VideoParams, VideoResolution } from "@shared/types";
import { snapDuration } from "@shared/models";
import { badRequest } from "./errors";
import { falUpscaleImage, falUpscaleVideo } from "./upscale";

export interface FalPayload {
  endpoint: string;
  input: Record<string, unknown>;
}

/** fal's named sizes for the ratios they cover. */
export const FAL_SIZE_PRESETS: Partial<Record<ImageAspectRatio, string>> = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

/** Explicit sizes (about one megapixel, multiples of 64) for ratios without a preset. */
export const FAL_SIZE_DIMENSIONS: Partial<Record<ImageAspectRatio, { width: number; height: number }>> = {
  "2:3": { width: 832, height: 1216 },
  "3:2": { width: 1216, height: 832 },
  "4:5": { width: 896, height: 1152 },
  "5:4": { width: 1152, height: 896 },
  "21:9": { width: 1536, height: 640 },
};

/** Megapixels per size for `scaledSize` routes. */
const SCALED_AREA: Record<ImageSize, number> = { "1K": 1024 * 1024, "2K": 2048 * 2048, "4K": 4096 * 4096 };

/** An explicit size for the ratio with about the size's area, each side a multiple of 64. */
export function falScaledSize(aspectRatio: Exclude<ImageAspectRatio, "auto">, size: ImageSize): { width: number; height: number } {
  const [w = 1, h = 1] = aspectRatio.split(":").map(Number);
  const side = (v: number): number => Math.round(Math.sqrt(SCALED_AREA[size] * v) / 64) * 64;
  return { width: side(w / h), height: side(h / w) };
}

export interface FalImageParams {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
  /** Upscalers: the scale, and the creative mode. */
  upscale?: number;
  creative?: boolean;
}

export function buildFalImagePayload(model: ImageModel, req: FalImageParams, referenceUrls: string[]): FalPayload {
  const route = model.fal;
  if (!route) throw badRequest(`${model.name} is not available on fal`);
  if (model.caps.upscale) return falUpscaleImage(model, route, referenceUrls[0], req.upscale, req.creative);
  const edit = referenceUrls.length > 0;
  const endpoint = edit ? route.edit : route.textToImage;
  if (!endpoint) throw badRequest(edit ? `${model.name} on fal does not take reference images` : `${model.name} needs at least one reference image`);
  const input: Record<string, unknown> = { prompt: req.prompt, ...route.extra };
  if (edit) {
    if (route.refs === "image_url") input.image_url = referenceUrls[0];
    else input.image_urls = referenceUrls;
  }
  if (route.scaledSize) {
    const ratio = req.aspectRatio === "auto" ? (edit ? undefined : "1:1") : req.aspectRatio;
    if (ratio && model.aspectRatios.includes(req.aspectRatio) && model.sizes.includes(req.size)) input.image_size = falScaledSize(ratio, req.size);
  } else if (req.aspectRatio !== "auto" && model.aspectRatios.includes(req.aspectRatio)) {
    if (route.aspect === "aspect_ratio") input.aspect_ratio = req.aspectRatio;
    else if (route.aspect === "image_size") {
      const size = route.imageSizes?.[req.aspectRatio] ?? FAL_SIZE_PRESETS[req.aspectRatio] ?? FAL_SIZE_DIMENSIONS[req.aspectRatio];
      if (size) input.image_size = size;
    }
  }
  if (route.resolution && model.supportsImageSize && model.sizes.includes(req.size)) input.resolution = req.size;
  return { endpoint, input };
}

export interface FalVideoParams {
  prompt: string;
  duration: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  audio?: boolean;
  orientation?: MotionOrientation;
  /** Upscalers: the scale, and the creative mode. */
  upscale?: number;
  creative?: boolean;
}

export interface FalVideoMedia {
  /** Data URL of the first frame (motion control: the character). */
  firstFrame?: string;
  lastFrame?: string;
  /** Public url of the uploaded reference video (motion control). */
  motionVideo?: string;
  /** Public url of the uploaded video to edit (video editing). */
  sourceVideo?: string;
}

export interface FalVideoPayload extends FalPayload {
  /** What was actually requested, stored with the generation. */
  params: VideoParams;
}

/** The requested resolution if the model lists it, else its default, with fal's value for it; undefined when the route sends none. */
function falResolution(model: VideoModel, route: FalVideoRoute, requested: VideoResolution | undefined): { app: VideoResolution; fal: string } | undefined {
  const app = requested && model.resolutions.includes(requested) ? requested : model.defaultResolution;
  const fal = app ? route.resolutions?.[app] : undefined;
  return app && fal ? { app, fal } : undefined;
}

export function buildFalVideoPayload(model: VideoModel, req: FalVideoParams, media: FalVideoMedia): FalVideoPayload {
  const route = model.fal;
  if (!route) throw badRequest(`${model.name} is not available on fal`);
  const prompt = req.prompt.trim();

  if (model.caps.upscale) return falUpscaleVideo(model, route, req, media.sourceVideo);
  if (model.caps.videoEdit) {
    if (!route.edit) throw badRequest(`${model.name} has no video-edit endpoint on fal`);
    if (!media.sourceVideo) throw badRequest("Video editing needs a video to edit");
    const input: Record<string, unknown> = { prompt, video_url: media.sourceVideo, ...route.extra };
    // The clip is as long as the source (or what the model keeps of it); the duration is read from the result.
    const params: VideoParams = { duration: 0 };
    const res = falResolution(model, route, req.resolution);
    if (res) {
      input.resolution = res.fal;
      params.resolution = res.app;
    }
    return { endpoint: route.edit, input, params };
  }

  if (model.caps.motionControl) {
    if (!route.motionControl) throw badRequest(`${model.name} has no motion-control endpoint on fal`);
    if (!media.firstFrame || !media.motionVideo) throw badRequest("Motion control needs a character image and a reference video");
    const orientation: MotionOrientation = req.orientation ?? "video";
    const input: Record<string, unknown> = { image_url: media.firstFrame, video_url: media.motionVideo, character_orientation: orientation, ...route.extra };
    if (prompt) input.prompt = prompt;
    // The clip is as long as the reference video; the duration is read from the result.
    return { endpoint: route.motionControl, input, params: { duration: 0, orientation } };
  }

  const hasFrames = Boolean(media.firstFrame || media.lastFrame);
  const bothFrames = Boolean(route.firstLastFrameToVideo && media.lastFrame);
  if (bothFrames && !media.firstFrame) throw badRequest(`${model.name} on fal needs a first frame with the last frame`);
  const endpoint = bothFrames ? route.firstLastFrameToVideo : hasFrames ? route.imageToVideo : route.textToVideo;
  if (!endpoint) throw badRequest(hasFrames ? `${model.name} on fal does not take a first frame` : `${model.name} on fal needs a first frame`);
  const input: Record<string, unknown> = { prompt, ...route.extra };
  const params: VideoParams = { duration: snapDuration(model, req.duration) };

  if (route.duration) {
    input.duration = route.duration === "number" ? params.duration : route.duration === "seconds" ? `${params.duration}s` : String(params.duration);
  }
  if (bothFrames) {
    input.start_image_url = media.firstFrame;
    input.end_image_url = media.lastFrame;
  } else if (hasFrames) {
    if (media.firstFrame) input[route.imageField ?? "image_url"] = media.firstFrame;
    if (media.lastFrame) {
      if (!route.endImage) throw badRequest(`${model.name} on fal does not take a last frame`);
      if (route.endImageMaxSec && params.duration > route.endImageMaxSec) throw badRequest(`Takes clips of up to ${route.endImageMaxSec} s between two frames`);
      input.end_image_url = media.lastFrame;
    }
  }
  const aspectSent = Boolean(req.aspectRatio) && (route.aspect === "always" || (route.aspect === "text" && !hasFrames)) && !(model.omitAspectRatioOnI2v && hasFrames);
  if (aspectSent && req.aspectRatio) {
    input.aspect_ratio = req.aspectRatio;
    params.aspectRatio = req.aspectRatio;
  }
  const res = falResolution(model, route, req.resolution);
  if (res) {
    input.resolution = res.fal;
    params.resolution = res.app;
  }
  if (model.caps.audio && route.audio && req.audio !== undefined) {
    input[route.audio] = req.audio;
    params.audio = req.audio;
  }
  return { endpoint, input, params };
}
