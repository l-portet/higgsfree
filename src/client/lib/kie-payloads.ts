/**
 * Pure request builders for kie.ai: the app's options mapped onto each model family's fields
 * (`KieVideoRoute` / `KieImageRoute` in the catalog). kie takes inputs by url only, so the media
 * here are the urls the files were uploaded to (placeholders when only checking or pricing).
 * A request a family cannot take throws a 400, which also keeps a run off kie when another
 * provider can take it (`video-cost.ts`).
 */
import type { ImageAspectRatio, ImageModel, ImageSize, KieImageRoute, KieVideoRoute, VideoAspectRatio, VideoModel, VideoParams, VideoResolution } from "@shared/types";
import { snapDuration } from "@shared/models";
import { badRequest } from "./errors";
import { kieUpscaleImage, kieUpscaleVideo } from "./upscale";

export interface KiePayload {
  /** createTask `model`. */
  model: string;
  input: Record<string, unknown>;
  /** What `KIE_PRICES` is keyed by: the model id, or `model#tier`. */
  priceKey: string;
}

// ---------- video ----------

export interface KieVideoParams {
  prompt: string;
  duration: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  audio?: boolean;
  /** Upscalers: the scale, and the creative mode (none on kie.ai). */
  upscale?: number;
  creative?: boolean;
}

export interface KieVideoMedia {
  firstFrame?: string;
  lastFrame?: string;
  /** Style references. */
  references?: string[];
  /** Reference videos and audio (models with `caps.mediaReferences`). */
  referenceVideos?: string[];
  referenceAudios?: string[];
  /** How long the reference videos run together, when known (Wan 3.0 caps it plus the clip at 30 s). */
  referenceVideoSec?: number;
  /** The video being edited. */
  sourceVideo?: string;
}

export interface KieVideoPayload extends KiePayload {
  /** What was actually requested, stored with the generation. */
  params: VideoParams;
}

const range = (min: number, max: number): number[] => Array.from({ length: max - min + 1 }, (_, i) => min + i);

/** Each family's durations (seconds), aspect ratios and resolutions, as kie spells them. */
const VIDEO_LIMITS: Record<KieVideoRoute["family"], { durations?: number[]; aspects?: VideoAspectRatio[]; resolutions?: Partial<Record<VideoResolution, string>> }> = {
  veo: { durations: [4, 6, 8], aspects: ["16:9", "9:16"], resolutions: { "720p": "720p", "1080p": "1080p", "4K": "4k" } },
  kling3: { durations: range(3, 15), aspects: ["16:9", "9:16", "1:1"] },
  kling4: { durations: range(3, 30), aspects: ["16:9", "9:16", "1:1", "21:9"], resolutions: { "720p": "720p", "1080p": "1080p" } },
  seedance: { durations: range(4, 30), aspects: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"], resolutions: { "480p": "480p", "720p": "720p", "1080p": "1080p", "4K": "4k" } },
  "minimax-h3": { durations: range(4, 15), aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], resolutions: { "768p": "768P", "2K": "2K" } },
  wan3: { durations: range(2, 30), aspects: ["16:9", "4:3", "1:1", "3:4", "9:16"], resolutions: { "480p": "480P", "720p": "720P", "1080p": "1080P" } },
  wan27: { durations: range(2, 15), aspects: ["16:9", "9:16", "1:1", "4:3", "3:4"], resolutions: { "720p": "720p", "1080p": "1080p" } },
  grok: { durations: range(6, 30), aspects: ["2:3", "3:2", "1:1", "16:9", "9:16"], resolutions: { "480p": "480p", "720p": "720p", "1080p": "1080p" } },
  grok15: { durations: range(1, 15), aspects: ["1:1", "16:9", "9:16", "3:2", "2:3"], resolutions: { "480p": "480p", "720p": "720p", "1080p": "1080p" } },
  "gemini-omni": { durations: [4, 6, 8, 10], aspects: ["16:9", "9:16"], resolutions: { "720p": "720p", "1080p": "1080p", "4K": "4k" } },
  "gemini-omni12": { durations: range(3, 15), aspects: ["16:9", "9:16"], resolutions: { "720p": "720p", "1080p": "1080p", "4K": "4k" } },
  pixverse: { durations: range(1, 15), aspects: ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"], resolutions: { "720p": "720p", "1080p": "1080p" } },
  vidu: { durations: range(3, 16), resolutions: { "720p": "720p", "1080p": "1080p", "2K": "2k", "4K": "4k" } },
  magi2: { durations: range(4, 30), aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], resolutions: { "1080p": "1080p" } },
  "wan27-edit": { resolutions: { "720p": "720p", "1080p": "1080p" } },
  "topaz-video-upscale": {},
};

/** "4–15 s" or "4, 6 or 8 s". */
function durationsLabel(list: number[]): string {
  const first = list[0];
  const last = list[list.length - 1];
  const contiguous = list.every((d, i) => i === 0 || d - (list[i - 1] ?? d) === 1);
  if (contiguous && first !== undefined && last !== undefined) return `${first}–${last} s`;
  return `${list.slice(0, -1).join(", ")} or ${last} s`;
}

/** Families whose clips always have sound: a run with the sound off goes elsewhere. */
const ALWAYS_SOUND = new Set<KieVideoRoute["family"]>(["veo", "minimax-h3"]);
/** Families that take style references. */
const TAKES_REFERENCES = new Set<KieVideoRoute["family"]>(["seedance", "wan3", "kling4", "gemini-omni12", "magi2"]);
/** How many reference videos and audio clips each family takes (the rest take none). Seedance 2.5 takes more than 2.0. */
function mediaLimits(route: KieVideoRoute): { videos: number; audios: number } {
  switch (route.family) {
    case "wan3":
    case "magi2":
      return { videos: 5, audios: 5 };
    case "seedance":
      return route.model === "bytedance/seedance-2-5" ? { videos: 10, audios: 10 } : { videos: 3, audios: 3 };
    case "kling4":
      return { videos: 5, audios: 0 };
    default:
      return { videos: 0, audios: 0 };
  }
}

export function buildKieVideoPayload(model: VideoModel, req: KieVideoParams, media: KieVideoMedia): KieVideoPayload {
  const route = model.kie;
  if (!route) throw badRequest(`${model.name} is not available on kie.ai`);
  if (model.caps.upscale) return kieUpscaleVideo(model, route, req, media.sourceVideo);
  const on = `${model.name} on kie.ai`;
  const limits = VIDEO_LIMITS[route.family];
  const prompt = req.prompt.trim();
  const first = media.firstFrame;
  const last = media.lastFrame;
  const refs = media.references ?? [];
  const refVideos = media.referenceVideos ?? [];
  const refAudios = media.referenceAudios ?? [];
  const frames = Boolean(first || last);
  const takes = mediaLimits(route);

  if (Boolean(model.caps.videoEdit) !== (route.family === "wan27-edit")) throw badRequest(`${on} has no route for this kind of run`);
  if (last && !first) throw badRequest(`${on} needs a first frame with the last frame`);
  if (refs.length && !TAKES_REFERENCES.has(route.family)) throw badRequest("Takes no style references");
  if (refVideos.length > takes.videos) throw badRequest(takes.videos ? `Takes up to ${takes.videos} reference videos` : "Takes no reference video");
  if (refAudios.length > takes.audios) throw badRequest(takes.audios ? `Takes up to ${takes.audios} reference audio clips` : "Takes no reference audio");
  if ((refs.length || refVideos.length || refAudios.length) && frames) throw badRequest("Takes frames or references, not both");
  if (req.audio === false && ALWAYS_SOUND.has(route.family)) throw badRequest("Always adds sound");

  const params: VideoParams = { duration: model.caps.videoEdit ? 0 : snapDuration(model, req.duration) };
  if (limits.durations && !limits.durations.includes(params.duration)) throw badRequest(`Takes clips of ${durationsLabel(limits.durations)}`);
  const resolution = req.resolution && model.resolutions.includes(req.resolution) ? req.resolution : model.defaultResolution;
  let kieResolution: string | undefined;
  if (limits.resolutions && resolution) {
    kieResolution = limits.resolutions[resolution];
    if (!kieResolution) throw badRequest(`Takes no ${resolution}`);
    params.resolution = resolution;
  }
  // The ratio is sent for text-to-video (with a frame the clip follows it), and only one kie offers.
  const aspect = !frames && req.aspectRatio && limits.aspects?.includes(req.aspectRatio) ? req.aspectRatio : undefined;
  if (!frames && req.aspectRatio && limits.aspects && !aspect) throw badRequest(`Takes no ${req.aspectRatio}`);
  if (aspect) params.aspectRatio = aspect;
  const sound = (fallback: boolean): boolean => {
    const wanted = req.audio ?? fallback;
    if (model.caps.audio) params.audio = wanted;
    return wanted;
  };
  const input: Record<string, unknown> = {};
  let id = route.model;
  let priceKey = route.model;

  switch (route.family) {
    case "veo":
      Object.assign(input, { prompt, model: route.tier, generation_type: frames ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "TEXT_2_VIDEO", duration: params.duration, resolution: kieResolution });
      if (frames) input.image_urls = [first, last].filter(Boolean);
      input.aspect_ratio = aspect ?? (frames ? "Auto" : "16:9");
      sound(true);
      priceKey = `${route.model}#${route.tier}`;
      break;
    case "kling3":
      Object.assign(input, { prompt, sound: sound(true), duration: String(params.duration), mode: route.tier, multi_shots: false });
      if (frames) input.image_urls = [first, last].filter(Boolean);
      if (aspect) input.aspect_ratio = aspect;
      priceKey = `${route.model}#${route.tier}`;
      break;
    case "kling4":
      // Always with sound; frames go to the keyframe model, a text-only run and references to the other.
      if (!prompt) throw badRequest("Needs a prompt");
      Object.assign(input, { prompt, duration: params.duration, resolution: kieResolution });
      if (frames) {
        id = route.imageModel ?? route.model;
        if (first) input.first_frame_url = first;
        if (last) input.last_frame_url = last;
      } else {
        if (aspect) input.aspect_ratio = aspect;
        if (refs.length) input.image_urls = refs;
        if (refVideos.length) input.video_urls = refVideos;
      }
      priceKey = "kling-4.0";
      break;
    case "seedance":
      if (prompt.length < 3) throw badRequest("Needs a prompt of 3 characters or more");
      Object.assign(input, { prompt, generate_audio: sound(true), resolution: kieResolution, duration: params.duration, aspect_ratio: aspect ?? "adaptive" });
      if (first) input.first_frame_url = first;
      if (last) input.last_frame_url = last;
      if (refs.length) input.reference_image_urls = refs;
      // Seedance 2.0 takes reference audio only alongside an image or a video.
      if (refAudios.length && !refs.length && !refVideos.length && route.model !== "bytedance/seedance-2-5") throw badRequest("Takes reference audio with a reference image or video");
      if (refVideos.length) input.reference_video_urls = refVideos;
      if (refAudios.length) input.reference_audio_urls = refAudios;
      break;
    case "minimax-h3":
      if (!prompt) throw badRequest("Needs a prompt");
      Object.assign(input, { prompt, duration: params.duration, resolution: kieResolution });
      sound(true);
      if (frames) {
        id = route.imageModel ?? route.model;
        if (first) input.first_frame_url = first;
        if (last) input.last_frame_url = last;
      } else input.aspect_ratio = aspect ?? "16:9";
      priceKey = "minimax-h3";
      break;
    case "wan3":
      Object.assign(input, { prompt, resolution: kieResolution, duration: params.duration, aspect_ratio: aspect ?? "adaptive", audio: sound(true) });
      if (first) input.first_frame_url = first;
      if (last) input.last_frame_url = last;
      if (refs.length) input.reference_image_urls = refs;
      if (refVideos.length) input.reference_video_urls = refVideos;
      if (refAudios.length) input.reference_audio_urls = refAudios;
      // The reference videos and the clip together run 30 s at most.
      if (refVideos.length && media.referenceVideoSec !== undefined && media.referenceVideoSec + params.duration > 30.05) {
        throw badRequest(`Takes 30 s of reference video and clip together: make the clip ${Math.max(2, Math.floor(30 - media.referenceVideoSec))} s or shorter`);
      }
      break;
    case "wan27":
      if (!prompt) throw badRequest("Needs a prompt");
      Object.assign(input, { prompt, resolution: kieResolution, duration: params.duration });
      if (frames) {
        id = route.imageModel ?? route.model;
        if (first) input.first_frame_url = first;
        if (last) input.last_frame_url = last;
      } else input.ratio = aspect ?? "16:9";
      priceKey = "wan/2-7";
      break;
    case "grok":
      if (frames) {
        id = route.imageModel ?? route.model;
        Object.assign(input, { image_urls: [first], duration: String(params.duration) });
        if (prompt) input.prompt = prompt;
      } else {
        if (!prompt) throw badRequest("Needs a prompt");
        Object.assign(input, { prompt, duration: params.duration, aspect_ratio: aspect ?? "16:9" });
      }
      Object.assign(input, { mode: "normal", resolution: kieResolution });
      priceKey = "grok-imagine";
      break;
    case "grok15":
      Object.assign(input, { duration: params.duration, resolution: kieResolution, aspect_ratio: aspect ?? "auto" });
      if (prompt) input.prompt = prompt;
      else if (!frames) throw badRequest("Needs a prompt");
      if (first) input.image_urls = [first];
      break;
    case "gemini-omni":
      if (!prompt) throw badRequest("Needs a prompt");
      Object.assign(input, { prompt, duration: String(params.duration), resolution: kieResolution });
      if (aspect) input.aspect_ratio = aspect;
      if (first) input.first_frame_url = first;
      if (last) input.last_frame_url = last;
      break;
    case "gemini-omni12": {
      // Unlike 1.1: `duration` as a number, 3–10 s between two frames, references as `image_urls`, and the ratio
      // with a frame too (kie defaults it to 16:9). `seeds` and `video_list` (its video-edit mode) are not sent.
      if (!prompt) throw badRequest("Needs a prompt");
      if (last && params.duration > 10) throw badRequest("Takes clips of up to 10 s between two frames");
      const ratio = aspect ?? (req.aspectRatio && limits.aspects?.includes(req.aspectRatio) ? req.aspectRatio : undefined);
      Object.assign(input, { prompt, duration: params.duration, resolution: kieResolution });
      if (ratio) {
        input.aspect_ratio = ratio;
        params.aspectRatio = ratio;
      }
      if (first) input.first_frame_url = first;
      if (last) input.last_frame_url = last;
      if (refs.length) input.image_urls = refs;
      break;
    }
    case "pixverse": {
      // PixVerse 6 and 6 Max take the same fields; Max takes any prompt, 6 one of 3 characters or more.
      const max = route.model.startsWith("pixverse-v6-max/");
      if (max && !prompt) throw badRequest("Needs a prompt");
      if (!max && prompt.length < 3) throw badRequest("Needs a prompt of 3 characters or more");
      Object.assign(input, { prompt, quality: kieResolution, duration: params.duration, generate_audio_switch: sound(false) });
      if (frames) {
        id = route.imageModel ?? route.model;
        input.image_urls = [first];
      } else input.aspect_ratio = aspect ?? "16:9";
      priceKey = max ? "pixverse-v6-max" : "pixverse-v6";
      break;
    }
    case "magi2": {
      // Three models: frames go to image-to-video (the clip follows the image, the prompt is optional), any reference
      // image, video or audio to reference-to-video (which needs one), the rest to text-to-video. One price for all
      // three, with or without sound. `seed` is not sent.
      if (!prompt && !frames) throw badRequest("Needs a prompt");
      if (prompt) input.prompt = prompt;
      Object.assign(input, { duration: params.duration, resolution: kieResolution, generate_audio: sound(true) });
      if (frames) {
        id = route.imageModel ?? route.model;
        input.first_frame_url = first;
        if (last) input.last_frame_url = last;
      } else {
        input.aspect_ratio = aspect ?? "16:9";
        if (refs.length || refVideos.length || refAudios.length) id = route.referenceModel ?? route.model;
        if (refs.length) input.reference_image_urls = refs;
        if (refVideos.length) input.reference_video_urls = refVideos;
        if (refAudios.length) input.reference_audio_urls = refAudios;
      }
      priceKey = "magi-2";
      break;
    }
    case "vidu":
      if (!first) throw badRequest("Needs a first frame");
      Object.assign(input, { image_url: first, duration: params.duration, resolution: kieResolution, audio: sound(true) });
      if (prompt) input.prompt = prompt;
      break;
    case "wan27-edit":
      if (!media.sourceVideo) throw badRequest("Video editing needs a video to edit");
      Object.assign(input, { prompt, video_url: media.sourceVideo, resolution: kieResolution });
      break;
  }
  if (last && (route.family === "grok" || route.family === "grok15" || route.family === "pixverse" || route.family === "vidu")) throw badRequest("Takes no last frame");
  return { model: id, input, priceKey, params };
}

// ---------- images ----------

export interface KieImageParams {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
  /** Upscalers: the scale, and the creative mode (none on kie.ai). */
  upscale?: number;
  creative?: boolean;
}

/** Each family's aspect ratios (`auto` = kie's own default) and how many reference images it takes. */
const IMAGE_LIMITS: Record<KieImageRoute["family"], { aspects: ImageAspectRatio[]; maxRefs: number; sizes?: boolean }> = {
  "nano-banana": { aspects: ["auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"], maxRefs: 10 },
  "nano-banana-2": { aspects: ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], maxRefs: 8, sizes: true },
  "nano-banana-lite": { aspects: ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], maxRefs: 10 },
  // GPT Image 2.6 Flare and Sunburst too: the same fields and limits, under their own model ids.
  "gpt-image-2": { aspects: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "21:9"], maxRefs: 16, sizes: true },
  // GPT Image 2.6 Economy: fewer ratios than Flare and Sunburst (no 3:4), and no `resolution`, since it generates at 1K only.
  "gpt-image-economy": { aspects: ["auto", "1:1", "3:2", "2:3", "4:3", "16:9", "9:16", "21:9"], maxRefs: 16 },
  // Seedream 5.5: `auto` on edits only (text to image sends 1:1 for it), and 10 references (the app sends 8 at most).
  seedream: { aspects: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"], maxRefs: 10, sizes: true },
  // MiniMax H3 Image: every ratio the app has, and 16 references (the app sends 8 at most).
  "minimax-h3-image": { aspects: ["auto", "1:1", "5:4", "4:3", "3:2", "16:9", "21:9", "4:5", "3:4", "2:3", "9:16"], maxRefs: 16, sizes: true },
  // Kling Image 4.0: no 4:5 nor 5:4, and 10 references (the app sends 8 at most). 2K and 4K only (no 1K).
  "kling-image": { aspects: ["auto", "9:16", "2:3", "3:4", "1:1", "4:3", "3:2", "16:9", "21:9"], maxRefs: 10, sizes: true },
  "flux-kontext": { aspects: ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], maxRefs: 1 },
  "z-image": { aspects: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"], maxRefs: 0 },
  "topaz-upscale": { aspects: ["auto"], maxRefs: 1 },
  "recraft-upscale": { aspects: ["auto"], maxRefs: 1 },
};

export function buildKieImagePayload(model: ImageModel, req: KieImageParams, referenceUrls: string[]): KiePayload {
  const route = model.kie;
  if (!route) throw badRequest(`${model.name} is not available on kie.ai`);
  if (model.caps.upscale) return kieUpscaleImage(model, route, referenceUrls[0], req.upscale, req.creative);
  const limits = IMAGE_LIMITS[route.family];
  if (referenceUrls.length > limits.maxRefs) throw badRequest(limits.maxRefs ? `Takes up to ${limits.maxRefs} reference image${limits.maxRefs > 1 ? "s" : ""}` : "Takes no reference images");
  if (!limits.aspects.includes(req.aspectRatio)) throw badRequest(`Takes no ${req.aspectRatio}`);
  const edit = referenceUrls.length > 0;
  const input: Record<string, unknown> = { prompt: req.prompt };
  let id = route.model;
  let priceKey = route.model;
  switch (route.family) {
    case "nano-banana":
      if (edit) {
        id = route.editModel ?? route.model;
        input.image_urls = referenceUrls;
      }
      Object.assign(input, { aspect_ratio: req.aspectRatio, output_format: "png" });
      priceKey = "google/nano-banana";
      break;
    case "nano-banana-2":
      Object.assign(input, { aspect_ratio: req.aspectRatio, resolution: req.size, output_format: "png" });
      if (edit) input.image_input = referenceUrls;
      break;
    case "nano-banana-lite":
      input.aspect_ratio = req.aspectRatio;
      if (edit) input.image_urls = referenceUrls;
      break;
    case "gpt-image-2":
      Object.assign(input, { aspect_ratio: req.aspectRatio, resolution: req.size });
      if (edit) {
        id = route.editModel ?? route.model;
        input.input_urls = referenceUrls;
      }
      break;
    case "gpt-image-economy":
      input.aspect_ratio = req.aspectRatio;
      if (edit) {
        id = route.editModel ?? route.model;
        input.input_urls = referenceUrls;
      }
      break;
    case "seedream":
      // Text to image requires a ratio and has no `auto`; edits default to `auto`.
      Object.assign(input, { aspect_ratio: req.aspectRatio === "auto" && !edit ? "1:1" : req.aspectRatio, size: req.size });
      if (edit) {
        id = route.editModel ?? route.model;
        input.image_urls = referenceUrls;
      }
      break;
    case "minimax-h3-image":
      // `auto` is kie's default: the prompt rewriter's pick on text to image, the first reference's ratio on an edit.
      Object.assign(input, { aspect_ratio: req.aspectRatio, resolution: req.size });
      if (edit) {
        id = route.editModel ?? route.model;
        input.image_urls = referenceUrls;
      }
      break;
    case "kling-image":
      // One model for both: references make it an edit. kie spells the sizes in lower case (`2k`, `4k`; also `8k`).
      if (req.size === "1K") throw badRequest("Takes no 1K");
      Object.assign(input, { aspect_ratio: req.aspectRatio, resolution: req.size.toLowerCase() });
      if (edit) input.image_urls = referenceUrls;
      break;
    case "flux-kontext":
      Object.assign(input, { model: route.tier, output_format: "png" });
      if (req.aspectRatio !== "auto") input.aspect_ratio = req.aspectRatio;
      if (edit) input.input_image = referenceUrls[0];
      priceKey = `${route.model}#${route.tier}`;
      break;
    case "z-image":
      input.aspect_ratio = req.aspectRatio === "auto" ? "1:1" : req.aspectRatio;
      break;
  }
  if (limits.sizes === undefined && req.size !== "1K" && model.supportsImageSize) throw badRequest(`Takes no ${req.size}`);
  return { model: id, input, priceKey };
}
