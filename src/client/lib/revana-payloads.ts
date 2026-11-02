/**
 * Pure request builders for Revana: one input shape for every model (`prompt`, `image_url`, `end_image_url`,
 * `image_urls`, `video_url`, `resolution`, `aspect_ratio`, `duration`, `audio`; Seedance 2.5 also `video_urls` and
 * `audio_urls`), checked against what the model takes (`REVANA_MODELS`). Media are urls (uploaded first, or
 * placeholders when only checking or pricing). A request the model cannot take throws a 400, which also keeps a run
 * off Revana when another provider can take it (`video-cost.ts`). Revana refuses unknown fields and values before
 * charging, so nothing is sent that its list does not offer.
 */
import type { ImageModel, VideoModel, VideoParams } from "@shared/types";
import { snapDuration } from "@shared/models";
import { REVANA_MODELS, type RevanaModelInfo } from "@shared/revana-models";
import { badRequest } from "./errors";
import type { KieImageParams, KieVideoMedia, KieVideoParams } from "./kie-payloads";

export interface RevanaPayload {
  /** Revana's model id. */
  model: string;
  input: Record<string, unknown>;
  info: RevanaModelInfo;
  /** The price key: the resolution as Revana spells it (or none for a flat price). */
  priceKey?: string;
}

export interface RevanaVideoPayload extends RevanaPayload {
  params: VideoParams;
}

/** Resolutions Revana names differently from the app. */
const RESOLUTION_ALIAS: Record<string, Record<string, string>> = {
  "flux-3-video": { "720p": "hd", "1080p": "fhd" },
};

/** Models that take reference videos and audio (`video_urls`, `audio_urls`): Seedance 2.5's own input. */
const TAKES_MEDIA_REFERENCES = new Set(["seedance-2.5"]);

function infoFor(model: ImageModel | VideoModel): { id: string; info: RevanaModelInfo } {
  const id = model.revana?.model;
  const info = id ? REVANA_MODELS[id] : undefined;
  if (!id || !info) throw badRequest(`${model.name} is not available on Revana`);
  return { id, info };
}

function durationOk(durations: RevanaModelInfo["options"]["durations"], d: number): boolean {
  if (!durations) return true;
  return Array.isArray(durations) ? durations.includes(d) : d >= durations.min && d <= durations.max;
}

function durationsLabel(durations: NonNullable<RevanaModelInfo["options"]["durations"]>): string {
  if (!Array.isArray(durations)) return `${durations.min}–${durations.max} s`;
  return durations.length > 1 ? `${durations.slice(0, -1).join(", ")} or ${durations[durations.length - 1]} s` : `${durations[0]} s`;
}

export function buildRevanaVideoPayload(model: VideoModel, req: KieVideoParams, media: KieVideoMedia): RevanaVideoPayload {
  const { id, info } = infoFor(model);
  const tasks = new Set<string>(info.tasks);
  const o = info.options;
  const prompt = req.prompt.trim();
  const first = media.firstFrame;
  const last = media.lastFrame;
  const refs = media.references ?? [];
  const refVideos = media.referenceVideos ?? [];
  const refAudios = media.referenceAudios ?? [];
  const source = media.sourceVideo;
  const frames = Boolean(first || last);

  if (model.caps.upscale || model.caps.motionControl) throw badRequest(`${model.name} is not available on Revana`);
  if (source && !tasks.has("video_to_video")) throw badRequest("Takes no video to edit");
  if (last && !first) throw badRequest("Needs a first frame with the last frame");
  if (last && !tasks.has("first_last_frame")) throw badRequest("Takes no last frame");
  if (first && !tasks.has("image_to_video")) throw badRequest("Takes no first frame");
  if (refs.length && (!tasks.has("reference_to_video") || !o.maxImages)) throw badRequest("Takes no style references");
  if (refs.length && o.maxImages && refs.length > o.maxImages) throw badRequest(`Takes up to ${o.maxImages} reference images`);
  if (refs.length && frames) throw badRequest("Takes frames or style references, not both");
  if ((refVideos.length || refAudios.length) && !TAKES_MEDIA_REFERENCES.has(id)) throw badRequest("Takes no reference video or audio");
  if ((refVideos.length || refAudios.length) && frames) throw badRequest("Reference videos and audio do not go with frames");
  if (!source && !frames && !refs.length && !refVideos.length && !tasks.has("text_to_video")) throw badRequest("Needs a first frame");
  if (!prompt && !first && !source) throw badRequest("Needs a prompt");

  const input: Record<string, unknown> = {};
  if (prompt) input.prompt = prompt;
  const params: VideoParams = { duration: snapDuration(model, req.duration) };

  // An edit keeps the source's length: no duration.
  if (!source && o.durations) {
    if (!durationOk(o.durations, params.duration)) throw badRequest(`Takes clips of ${durationsLabel(o.durations)}`);
    input.duration = params.duration;
  }

  const resolution = req.resolution && model.resolutions.includes(req.resolution) ? req.resolution : model.defaultResolution;
  const spelled = resolution ? (RESOLUTION_ALIAS[id]?.[resolution] ?? resolution) : undefined;
  if (o.resolutions && spelled) {
    if (!o.resolutions.includes(spelled)) throw badRequest(`Takes no ${resolution}`);
    input.resolution = spelled;
  }
  if (resolution) params.resolution = resolution;

  // The ratio goes with a prompt alone: a frame or a source sets the shape. A model with no list takes its default, 16:9.
  if (!frames && !source && req.aspectRatio) {
    if (o.aspectRatios) {
      if (!o.aspectRatios.includes(req.aspectRatio)) throw badRequest(`Takes no ${req.aspectRatio}`);
      input.aspect_ratio = req.aspectRatio;
      params.aspectRatio = req.aspectRatio;
    } else if (req.aspectRatio !== "16:9") throw badRequest("Takes 16:9 only");
  }

  if (o.audio && model.caps.audio) {
    const sound = req.audio ?? true;
    input.audio = sound;
    params.audio = sound;
  }

  if (first) input.image_url = first;
  if (last) input.end_image_url = last;
  if (refs.length) input.image_urls = refs;
  if (refVideos.length) input.video_urls = refVideos;
  if (refAudios.length) input.audio_urls = refAudios;
  if (source) input.video_url = source;

  const out: RevanaVideoPayload = { model: id, input, info, params };
  if (spelled) out.priceKey = spelled;
  return out;
}

export function buildRevanaImagePayload(model: ImageModel, req: KieImageParams, referenceUrls: string[]): RevanaPayload {
  const { id, info } = infoFor(model);
  const tasks = new Set<string>(info.tasks);
  const o = info.options;
  const input: Record<string, unknown> = {};

  if (model.caps.upscale) {
    if (!tasks.has("upscale")) throw badRequest("Takes no upscale");
    const [image, ...more] = referenceUrls;
    if (!image) throw badRequest(`${model.name} needs an image to upscale`);
    if (more.length) throw badRequest("Takes one image to upscale");
    input.image_url = image;
    return { model: id, input, info };
  }

  const max = o.maxImages ?? model.caps.maxReferenceImages;
  if (referenceUrls.length && !tasks.has("image_to_image")) throw badRequest("Takes no reference images");
  if (referenceUrls.length > max) throw badRequest(`Takes up to ${max} reference images`);
  if (!referenceUrls.length && !tasks.has("text_to_image")) throw badRequest("Needs a reference image");
  input.prompt = req.prompt;
  if (referenceUrls.length) input.image_urls = referenceUrls;

  let priceKey: string | undefined;
  if (o.resolutions) {
    if (!o.resolutions.includes(req.size)) throw badRequest(`Takes no ${req.size}`);
    input.resolution = req.size;
    priceKey = req.size;
  }
  // `auto` is Revana's default too (the model picks, or follows the reference).
  if (req.aspectRatio !== "auto") {
    if (!o.aspectRatios?.includes(req.aspectRatio)) throw badRequest(`Takes no ${req.aspectRatio}`);
    input.aspect_ratio = req.aspectRatio;
  }
  const out: RevanaPayload = { model: id, input, info };
  if (priceKey) out.priceKey = priceKey;
  return out;
}
