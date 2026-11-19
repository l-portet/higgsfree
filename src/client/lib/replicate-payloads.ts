/**
 * Pure request builders for Replicate. Every Replicate model names its own input fields, so a request is built from
 * the model's entry in `REPLICATE_MODELS` (which field carries the frame, the ratio, the resolution…) and checked
 * against the values that entry lists. Images are data URIs, inline (or placeholders when only checking or pricing).
 * A request Replicate cannot take from here throws a 400, which also keeps a run off Replicate when another provider
 * can take it (`video-cost.ts`, `image-cost.ts`): any video input (to edit, upscale, or as a reference) and reference
 * audio, because the browser has no way to hand Replicate a file that large.
 */
import { snapDuration } from "@shared/models";
import { REPLICATE_MODELS, replicateKey, type ReplicateImageInfo, type ReplicateVideoInfo } from "@shared/replicate-models";
import type { ImageModel, VideoModel, VideoParams } from "@shared/types";
import { badRequest } from "./errors";
import type { KieImageParams, KieVideoMedia, KieVideoParams } from "./kie-payloads";

export interface ReplicateImagePayload {
  /** Replicate's `owner/name`. */
  model: string;
  input: Record<string, unknown>;
  info: ReplicateImageInfo;
}

export interface ReplicateVideoPayload {
  model: string;
  input: Record<string, unknown>;
  info: ReplicateVideoInfo;
  params: VideoParams;
}

function infoFor(model: ImageModel | VideoModel): { slug: string; info: ReplicateImageInfo | ReplicateVideoInfo } {
  const info = model.replicate ? REPLICATE_MODELS[replicateKey(model.replicate)] : undefined;
  if (!model.replicate || !info || info.kind !== model.kind) throw badRequest(`${model.name} is not available on Replicate`);
  return { slug: model.replicate.model, info };
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export function buildReplicateImagePayload(model: ImageModel, req: KieImageParams, referenceUrls: string[]): ReplicateImagePayload {
  const { slug, info } = infoFor(model) as { slug: string; info: ReplicateImageInfo };
  const input: Record<string, unknown> = { ...info.extra };

  if (model.caps.upscale || info.upscale) {
    if (!model.caps.upscale || !info.upscale || !info.refs) throw badRequest(`${model.name} is not available on Replicate`);
    const [image, ...more] = referenceUrls;
    if (!image) throw badRequest(`${model.name} needs an image to upscale`);
    if (more.length) throw badRequest("Takes one image to upscale");
    input[info.refs.field] = image;
    return { model: slug, input, info };
  }

  const max = info.refs ? (info.refs.max ?? model.caps.maxReferenceImages) : 0;
  if (referenceUrls.length && !info.refs) throw badRequest("Takes no reference images");
  if (referenceUrls.length > max) throw badRequest(`Takes up to ${plural(max, "reference image")}`);
  if (!referenceUrls.length && info.needsRef) throw badRequest("Needs a reference image");
  input.prompt = req.prompt;
  if (referenceUrls.length && info.refs) input[info.refs.field] = info.refs.list ? referenceUrls : referenceUrls[0];

  if (info.sizes) {
    const size = info.sizes[req.size];
    if (!size) throw badRequest(`Takes no ${req.size}`);
    input.resolution = size;
  }
  // `auto`: the model's own word for it when it has one, else the field is left out and Replicate's default applies.
  if (req.aspectRatio === "auto") {
    if (info.aspect?.auto) input.aspect_ratio = info.aspect.auto;
  } else {
    if (!info.aspect?.values.includes(req.aspectRatio)) throw badRequest(`Takes no ${req.aspectRatio}`);
    input.aspect_ratio = req.aspectRatio;
  }
  return { model: slug, input, info };
}

function durationOk(values: NonNullable<ReplicateVideoInfo["duration"]>["values"], d: number): boolean {
  return Array.isArray(values) ? values.includes(d) : d >= values.min && d <= values.max;
}

function durationsLabel(values: NonNullable<ReplicateVideoInfo["duration"]>["values"]): string {
  if (!Array.isArray(values)) return `${values.min}–${values.max} s`;
  return values.length > 1 ? `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]} s` : `${values[0]} s`;
}

export function buildReplicateVideoPayload(model: VideoModel, req: KieVideoParams, media: KieVideoMedia): ReplicateVideoPayload {
  const { slug, info } = infoFor(model) as { slug: string; info: ReplicateVideoInfo };
  const prompt = req.prompt.trim();
  const first = media.firstFrame;
  const last = media.lastFrame;
  const refs = media.references ?? [];
  const frames = Boolean(first || last);

  if (model.caps.upscale || model.caps.motionControl) throw badRequest(`${model.name} is not available on Replicate`);
  if (media.sourceVideo || model.caps.videoEdit || media.referenceVideos?.length) throw badRequest("Takes no video from here");
  if (media.referenceAudios?.length) throw badRequest("Takes no reference video or audio");
  if (last && !first) throw badRequest("Needs a first frame with the last frame");
  if (first && !info.firstFrame && !info.frameList) throw badRequest("Takes no first frame");
  if (last && !info.lastFrame && info.frameList?.max !== 2) throw badRequest("Takes no last frame");
  if (refs.length && !info.references) throw badRequest("Takes no style references");
  if (info.references && refs.length > info.references.max) throw badRequest(`Takes up to ${plural(info.references.max, "reference image")}`);
  if (refs.length && frames) throw badRequest("Takes frames or style references, not both");
  if (!first && info.imageOnly) throw badRequest("Needs a first frame");
  if (!prompt) throw badRequest("Needs a prompt");

  const input: Record<string, unknown> = { prompt, ...info.extra };
  const params: VideoParams = { duration: snapDuration(model, req.duration) };

  if (info.duration) {
    if (!durationOk(info.duration.values, params.duration)) throw badRequest(`Takes clips of ${durationsLabel(info.duration.values)}`);
    input.duration = info.duration.string ? String(params.duration) : params.duration;
  }
  if (last && info.lastFrameMaxSec && params.duration > info.lastFrameMaxSec) throw badRequest(`Takes clips of up to ${info.lastFrameMaxSec} s between two frames`);
  if (refs.length && info.references?.onlySec && params.duration !== info.references.onlySec) throw badRequest(`Takes style references on ${info.references.onlySec} s clips only`);

  const resolution = req.resolution && model.resolutions.includes(req.resolution) ? req.resolution : model.defaultResolution;
  if (info.resolution) {
    const spelled = resolution ? info.resolution.values[resolution] : undefined;
    if (!spelled) throw badRequest(`Takes no ${resolution ?? "default resolution"}`);
    input[info.resolution.field] = spelled;
  }
  if (resolution) params.resolution = resolution;
  // A clip billed as a whole exists only at the lengths its price list has for the resolution.
  if (info.price.unit === "video" && info.price.usd[`${resolution}/${params.duration}`] === undefined) throw badRequest(`Takes no ${params.duration} s clip at ${resolution ?? "its resolution"}`);

  if (info.aspect) {
    const { field, values, always } = info.aspect;
    if (frames && !always) {
      // A frame sets the shape; some models want to be told so.
      if (info.aspect.frames) input[field] = info.aspect.frames;
    } else if (req.aspectRatio) {
      if (!values.includes(req.aspectRatio)) throw badRequest(`Takes no ${req.aspectRatio}`);
      input[field] = req.aspectRatio;
      params.aspectRatio = req.aspectRatio;
    }
  }

  if (info.audio && model.caps.audio) {
    const sound = req.audio ?? true;
    input[info.audio] = sound;
    params.audio = sound;
  }

  if (info.frameList) {
    const list = [first, last].filter((u): u is string => Boolean(u));
    if (list.length) input[info.frameList.field] = list;
  } else {
    if (first && info.firstFrame) input[info.firstFrame] = first;
    if (last && info.lastFrame) input[info.lastFrame] = last;
  }
  if (refs.length && info.references) input[info.references.field] = refs;

  return { model: slug, input, info, params };
}
