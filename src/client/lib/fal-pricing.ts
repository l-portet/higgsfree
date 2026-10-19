/**
 * Cost estimates for runs on fal, from fal's list prices (`FAL_PRICES`). A request is priced by building
 * the payload it would send, so the estimate follows the same endpoint, resolution, duration and audio
 * choices as the run itself. `undefined` when the request would be refused or the price is not known.
 */
import { type ByResolution, FAL_PRICES } from "@shared/fal-prices";
import { editedLength } from "@shared/models";
import type { ImageModel, VideoModel, VideoResolution } from "@shared/types";
import { buildFalImagePayload, buildFalVideoPayload, type FalImageParams, type FalVideoParams } from "./fal-payloads";

/** fal's named sizes in pixels. */
const PRESET_PIXELS: Record<string, number> = {
  square_hd: 1024 * 1024,
  square: 512 * 512,
  portrait_4_3: 768 * 1024,
  portrait_16_9: 576 * 1024,
  landscape_4_3: 1024 * 768,
  landscape_16_9: 1024 * 576,
};

/** fal bills a started megapixel (1024 x 1024 pixels) as a whole one. Unknown size (fal's default, an edit following its input): one. */
function megapixels(size: unknown): number {
  let px: number | undefined;
  if (typeof size === "string") px = PRESET_PIXELS[size];
  else if (size && typeof size === "object") {
    const { width, height } = size as { width?: number; height?: number };
    if (width && height) px = width * height;
  }
  return px ? Math.max(1, Math.ceil(px / (1024 * 1024))) : 1;
}

const at = (usd: ByResolution | undefined, res: VideoResolution | undefined): number | undefined =>
  typeof usd === "number" ? usd : res && usd ? usd[res] : undefined;

/** Estimated USD for `count` images of `req` on fal, with or without reference images. */
export function estimateFalImageCost(model: ImageModel, req: Omit<FalImageParams, "prompt">, count: number, withRefs: boolean): number | undefined {
  let payload;
  try {
    payload = buildFalImagePayload(model, { ...req, prompt: "" }, withRefs ? ["ref"] : []);
  } catch {
    return undefined;
  }
  const price = FAL_PRICES[payload.endpoint];
  if (!price) return undefined;
  if (price.unit === "megapixel") return price.usd * megapixels(payload.input.image_size) * count;
  if (price.unit !== "image") return undefined;
  // A ratio the payload does not carry leaves fal on its default size.
  const aspect = "image_size" in payload.input || "aspect_ratio" in payload.input ? req.aspectRatio : "auto";
  const per = price.byAspect?.[aspect] ?? (typeof price.usd === "number" ? price.usd : (price.usd[req.size] ?? price.usd["1K"]));
  return per === undefined ? undefined : per * count;
}

export interface FalVideoEstimate extends Omit<FalVideoParams, "prompt"> {
  /** Which frames are attached (they decide the endpoint, and so the price). */
  firstFrame?: boolean;
  lastFrame?: boolean;
  /** Motion control and video editing: the input video's length, which sets the clip's. Unknown: no estimate. */
  videoSec?: number;
}

/** Estimated USD for one clip of `req` on fal. `now` picks promotional rates (tests pass a date). */
export function estimateFalVideoCost(model: VideoModel, req: FalVideoEstimate, now = new Date()): number | undefined {
  const motion = Boolean(model.caps.motionControl);
  const edit = Boolean(model.caps.videoEdit);
  let payload;
  try {
    payload = buildFalVideoPayload(
      model,
      { ...req, prompt: "" },
      motion
        ? { firstFrame: "frame", motionVideo: "video" }
        : edit
          ? { sourceVideo: "video" }
          : { firstFrame: req.firstFrame ? "frame" : undefined, lastFrame: req.lastFrame ? "frame" : undefined },
    );
  } catch {
    return undefined;
  }
  const price = FAL_PRICES[payload.endpoint];
  if (!price || price.unit !== "second") return undefined;
  const seconds = motion ? req.videoSec : edit ? req.videoSec && editedLength(model, req.videoSec) : payload.params.duration;
  if (!seconds) return undefined;
  // The resolution sent, or, when fal takes none, the one the model renders at.
  const res = payload.params.resolution ?? (req.resolution && model.resolutions.includes(req.resolution) ? req.resolution : model.defaultResolution);
  const promo = price.promo && now.toISOString().slice(0, 10) <= price.promo.until ? price.promo.usd : undefined;
  const base = at(promo ?? price.usd, res);
  // Audio is on unless it was turned off: fal's endpoints default to it.
  const perSecond = payload.params.audio === false ? base : (at(price.audioUsd, res) ?? base);
  return perSecond === undefined ? undefined : perSecond * seconds;
}
