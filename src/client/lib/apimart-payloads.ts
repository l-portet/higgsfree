/**
 * Pure request builders for APIMart: the app's options mapped onto each model family's fields
 * (`ApimartVideoRoute` / `ApimartImageRoute` in the catalog). APIMart takes images by url (uploaded first),
 * so the media here are those urls (placeholders when only checking or pricing). A request a family cannot
 * take throws a 400, which also keeps a run off APIMart when another provider can take it (`video-cost.ts`).
 */
import type { ApimartImageRoute, ApimartVideoRoute, ImageAspectRatio, ImageModel, ImageSize, VideoAspectRatio, VideoModel, VideoParams, VideoResolution } from "@shared/types";
import { snapDuration } from "@shared/models";
import { badRequest } from "./errors";

export interface ApimartPayload {
  /** `POST /v1/videos/generations` or `/v1/images/generations`. */
  kind: "videos" | "images";
  /** The request body: `model`, `prompt` and the family's fields. */
  body: Record<string, unknown>;
  /** What `APIMART_PRICES` is keyed by: the model id, or `model#tier`. */
  priceKey: string;
}

// ---------- video ----------

export interface ApimartVideoParams {
  prompt: string;
  duration: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  audio?: boolean;
}

export interface ApimartVideoMedia {
  firstFrame?: string;
  lastFrame?: string;
  references?: string[];
  /** Refused: the app uploads only images to APIMart, and a library file has no public url to give it. */
  referenceVideos?: string[];
  referenceAudios?: string[];
}

export interface ApimartVideoPayload extends ApimartPayload {
  params: VideoParams;
}

const range = (min: number, max: number): number[] => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const RATIOS: VideoAspectRatio[] = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

/** Each family's durations (seconds), aspect ratios and resolutions, as APIMart spells them. */
const VIDEO_LIMITS: Record<ApimartVideoRoute["family"], { durations: number[]; aspects?: VideoAspectRatio[]; resolutions?: Partial<Record<VideoResolution, string>> }> = {
  veo: { durations: [8], aspects: ["16:9", "9:16"], resolutions: { "720p": "720p", "1080p": "1080p", "4K": "4k" } },
  seedance: { durations: range(4, 30), aspects: RATIOS, resolutions: { "480p": "480p", "720p": "720p", "1080p": "1080p", "4K": "4k" } },
  seedance15: { durations: range(4, 12), aspects: RATIOS, resolutions: { "480p": "480p", "720p": "720p", "1080p": "1080p" } },
  "minimax-h3": { durations: range(4, 15), aspects: RATIOS, resolutions: { "480p": "480P", "768p": "768P", "1080p": "1080P", "2K": "2K" } },
  hailuo23: { durations: [6, 10], resolutions: { "768p": "768p", "1080p": "1080p" } },
  wan3: { durations: range(2, 30), aspects: ["16:9", "4:3", "1:1", "3:4", "9:16"], resolutions: { "480p": "480P", "720p": "720P", "1080p": "1080P" } },
  wan27: { durations: range(2, 15), aspects: ["16:9", "9:16", "1:1", "4:3", "3:4"], resolutions: { "720p": "720P", "1080p": "1080P" } },
  wan26: { durations: [5, 10, 15], aspects: ["16:9", "9:16", "1:1", "4:3", "3:4"], resolutions: { "720p": "720p", "1080p": "1080p" } },
  kling: { durations: range(3, 15), aspects: ["16:9", "9:16", "1:1"] },
  kling4: { durations: range(3, 30), aspects: ["16:9", "9:16", "1:1", "21:9"], resolutions: { "720p": "720p", "1080p": "1080p" } },
  pixverse: { durations: range(1, 15), aspects: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], resolutions: { "720p": "720p", "1080p": "1080p" } },
  "pixverse-max": { durations: range(1, 15), aspects: ["16:9", "9:16", "4:3", "3:4", "1:1", "2:3", "3:2", "21:9"], resolutions: { "720p": "720p", "1080p": "1080p" } },
  "gemini-omni": { durations: [4, 6, 8, 10], aspects: ["16:9", "9:16"], resolutions: { "720p": "720p", "1080p": "1080p", "4K": "4k" } },
  // No duration field (the prompt sets the length, about 3–10 s): it runs only at the catalog's default, 8 s, a placeholder.
  "gemini-omni12": { durations: [8], aspects: ["16:9", "9:16"], resolutions: { "720p": "720p", "1080p": "1080p", "4K": "4k" } },
  flux3: { durations: range(5, 20), aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], resolutions: { "720p": "hd", "1080p": "fhd" } },
  vidu: { durations: range(3, 16), resolutions: { "720p": "720p", "1080p": "1080p", "2K": "2K", "4K": "4K" } },
  // 1080p only; 21:9 on text- and reference-to-video only, and the app sends no ratio with frames anyway.
  magi2: { durations: range(4, 30), aspects: RATIOS, resolutions: { "1080p": "1080p" } },
};

/** "4–15 s" or "6 or 10 s". */
function durationsLabel(list: number[]): string {
  const first = list[0];
  const last = list[list.length - 1];
  if (list.length === 1) return `${first} s`;
  const contiguous = list.every((d, i) => i === 0 || d - (list[i - 1] ?? d) === 1);
  if (contiguous && first !== undefined && last !== undefined) return `${first}–${last} s`;
  return `${list.slice(0, -1).join(", ")} or ${last} s`;
}

/** Families whose clips always have sound: a run with the sound off goes elsewhere. */
const ALWAYS_SOUND = new Set<ApimartVideoRoute["family"]>(["veo", "minimax-h3"]);
/** Families that take style references (as `reference_image` roles; Gemini Omni Flash 1.2 as `image_urls`). */
const TAKES_REFERENCES = new Set<ApimartVideoRoute["family"]>(["seedance", "wan3", "kling4", "gemini-omni12", "magi2"]);
/** Families that take a last frame with the first. */
const TAKES_LAST = new Set<ApimartVideoRoute["family"]>(["veo", "seedance", "seedance15", "minimax-h3", "wan3", "wan27", "kling", "kling4", "pixverse", "gemini-omni12", "magi2"]);

const roles = (first?: string, last?: string, refs: string[] = []): { url: string; role: string }[] => [
  ...(first ? [{ url: first, role: "first_frame" }] : []),
  ...(last ? [{ url: last, role: "last_frame" }] : []),
  ...refs.map((url) => ({ url, role: "reference_image" })),
];

export function buildApimartVideoPayload(model: VideoModel, req: ApimartVideoParams, media: ApimartVideoMedia): ApimartVideoPayload {
  const route = model.apimart;
  if (!route) throw badRequest(`${model.name} is not available on APIMart`);
  const limits = VIDEO_LIMITS[route.family];
  const prompt = req.prompt.trim();
  const first = media.firstFrame;
  const last = media.lastFrame;
  const refs = media.references ?? [];
  const frames = Boolean(first || last);

  if (last && !first) throw badRequest(`${model.name} on APIMart needs a first frame with the last frame`);
  if (last && !TAKES_LAST.has(route.family)) throw badRequest("Takes no last frame");
  if (refs.length && !TAKES_REFERENCES.has(route.family)) throw badRequest("Takes no style references");
  if (refs.length && frames) throw badRequest("Takes frames or style references, not both");
  if (media.referenceVideos?.length || media.referenceAudios?.length) throw badRequest("Takes no uploaded video or audio");
  if (req.audio === false && ALWAYS_SOUND.has(route.family) && model.caps.audio) throw badRequest("Always adds sound");

  const params: VideoParams = { duration: snapDuration(model, req.duration) };
  if (!limits.durations.includes(params.duration)) throw badRequest(`Takes clips of ${durationsLabel(limits.durations)}`);
  const resolution = req.resolution && model.resolutions.includes(req.resolution) ? req.resolution : model.defaultResolution;
  let res: string | undefined;
  if (limits.resolutions && resolution) {
    res = limits.resolutions[resolution];
    if (!res) throw badRequest(`Takes no ${resolution}`);
    params.resolution = resolution;
  }
  // The ratio is sent for text-to-video (with a frame the clip follows it), and only one APIMart offers.
  const aspect = !frames && req.aspectRatio && limits.aspects?.includes(req.aspectRatio) ? req.aspectRatio : undefined;
  if (!frames && req.aspectRatio && limits.aspects && !aspect) throw badRequest(`Takes no ${req.aspectRatio}`);
  if (aspect) params.aspectRatio = aspect;
  const sound = (fallback: boolean): boolean => {
    const wanted = req.audio ?? fallback;
    if (model.caps.audio) params.audio = wanted;
    return wanted;
  };
  const needsPrompt = (): void => {
    if (!prompt) throw badRequest("Needs a prompt");
  };
  const body: Record<string, unknown> = { model: route.model, prompt };
  let priceKey = route.model;

  switch (route.family) {
    case "veo":
      if (frames && route.model === "veo3.1-lite") throw badRequest("Takes no frames");
      needsPrompt();
      Object.assign(body, { duration: params.duration, resolution: res, aspect_ratio: aspect ?? "16:9" });
      if (frames) Object.assign(body, { generation_type: "frame", image_urls: [first, last].filter(Boolean) });
      sound(true);
      break;
    case "seedance":
      if (!frames || route.model === "seedance-2.5") needsPrompt();
      Object.assign(body, { size: aspect ?? "adaptive", resolution: res, duration: params.duration, generate_audio: sound(true) });
      if (frames || refs.length) body.image_with_roles = roles(first, last, refs);
      break;
    case "seedance15":
      needsPrompt();
      Object.assign(body, { aspect_ratio: aspect ?? "16:9", resolution: res, duration: params.duration, audio: sound(true) });
      if (frames) body.image_urls = [first, last].filter(Boolean);
      break;
    case "minimax-h3":
      needsPrompt();
      Object.assign(body, { duration: params.duration, resolution: res });
      sound(true);
      if (first) body.first_frame_image = first;
      if (last) body.last_frame_image = last;
      if (!frames) body.aspect_ratio = aspect ?? "16:9";
      break;
    case "hailuo23":
      needsPrompt();
      if (res === "1080p" && params.duration !== 6) throw badRequest("Takes 6 s clips at 1080p");
      Object.assign(body, { duration: params.duration, resolution: res });
      if (first) body.first_frame_image = first;
      break;
    case "wan3":
      if (!frames && !refs.length) needsPrompt();
      Object.assign(body, { resolution: res, size: aspect ?? "adaptive", duration: params.duration, audio: sound(true) });
      if (frames || refs.length) body.image_with_roles = roles(first, last, refs);
      break;
    case "wan27":
      if (!frames) needsPrompt();
      Object.assign(body, { resolution: res, duration: params.duration });
      if (frames) body.image_urls = [first, last].filter(Boolean);
      else body.size = aspect ?? "16:9";
      break;
    case "wan26":
      needsPrompt();
      Object.assign(body, { resolution: res, duration: params.duration, audio: sound(true) });
      if (first) body.image_urls = [first];
      else body.aspect_ratio = aspect ?? "16:9";
      break;
    case "kling":
      needsPrompt();
      Object.assign(body, { mode: route.tier, duration: params.duration });
      if (aspect) body.aspect_ratio = aspect;
      if (route.model === "kling-video-o1") {
        if (frames) body.image_with_roles = roles(first, last);
      } else {
        body.audio = sound(true);
        if (frames) body.image_urls = [first, last].filter(Boolean);
      }
      priceKey = `${route.model}#${route.tier}`;
      break;
    case "kling4":
      // Always with sound (`audio: false` is refused, so it is never sent); no `mode`, the resolution says it.
      if (!frames) needsPrompt();
      Object.assign(body, { duration: params.duration, resolution: res });
      if (aspect) body.aspect_ratio = aspect;
      if (frames) body.image_urls = [first, last].filter(Boolean);
      else if (refs.length) body.image_with_roles = roles(undefined, undefined, refs);
      break;
    case "pixverse":
      needsPrompt();
      if (last && params.duration !== 5 && params.duration !== 8) throw badRequest("Takes 5 or 8 s clips between two frames");
      Object.assign(body, { resolution: res, duration: params.duration, audio: sound(false) });
      if (last) Object.assign(body, { first_frame_image: first, last_frame_image: last });
      else if (first) body.image_urls = [first];
      else body.size = aspect ?? "16:9";
      break;
    case "pixverse-max":
      // Unlike PixVerse 6: `aspect_ratio` (not `size`), one frame only, and no prompt needed with it.
      if (!first) needsPrompt();
      Object.assign(body, { resolution: res, duration: params.duration, audio: sound(false) });
      if (first) body.image_urls = [first];
      else body.aspect_ratio = aspect ?? "16:9";
      break;
    case "gemini-omni":
      needsPrompt();
      Object.assign(body, { duration: params.duration, resolution: res, aspect_ratio: aspect ?? "16:9" });
      if (first) Object.assign(body, { generation_type: "frame", image_urls: [first] });
      break;
    case "gemini-omni12": {
      // Unlike 1.1: no `duration`, frames in their own fields, references as `image_urls`; `metadata.task` is left
      // out so APIMart picks the task. The ratio goes with a frame too: APIMart defaults it to 16:9 otherwise.
      needsPrompt();
      const ratio = aspect ?? (req.aspectRatio && limits.aspects?.includes(req.aspectRatio) ? req.aspectRatio : undefined);
      body.resolution = res;
      if (ratio) {
        body.aspect_ratio = ratio;
        params.aspectRatio = ratio;
      }
      if (first) body.first_frame_image = first;
      if (last) body.last_frame_image = last;
      if (refs.length) body.image_urls = refs;
      break;
    }
    case "flux3":
      needsPrompt();
      Object.assign(body, { duration: params.duration, resolution: res, aspect_ratio: aspect ?? "auto", audio: sound(true) });
      if (first) body.image_urls = [first];
      break;
    case "vidu":
      if (!first) throw badRequest("Needs a first frame");
      Object.assign(body, { first_frame_image: first, duration: params.duration, resolution: res, audio: sound(true) });
      break;
    case "magi2":
      // One model for all three modes, picked by the inputs: frames in their own fields (no ratio: the clip follows
      // the first), reference images as `reference_image` roles with the reference task named (bare `image_urls`
      // would be read as frames), the rest text to video. A prompt in every mode, unlike kie. `seed` and
      // `nsfw_check` (off by default) are not sent.
      needsPrompt();
      Object.assign(body, { duration: params.duration, resolution: res, generate_audio: sound(true) });
      if (frames) {
        body.first_frame_image = first;
        if (last) body.last_frame_image = last;
      } else {
        body.aspect_ratio = aspect ?? "16:9";
        if (refs.length) Object.assign(body, { image_with_roles: roles(undefined, undefined, refs), omni_reference_task_type: "reference" });
      }
      break;
  }
  return { kind: "videos", body, priceKey, params };
}

// ---------- images ----------

export interface ApimartImageParams {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
}

const IMAGE_LIMITS: Record<ApimartImageRoute["family"], { aspects: ImageAspectRatio[]; maxRefs: number }> = {
  gemini: { aspects: ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], maxRefs: 14 },
  // GPT Image 2.6, 2.6 Flare and 2.6 Sunburst too: 2.6's catalog entry leaves out 21:9, and all three take 16 references (the app sends 8 at most).
  "gpt-image-2": { aspects: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "21:9"], maxRefs: 15 },
  "flux-kontext": { aspects: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"], maxRefs: 4 },
  "z-image": { aspects: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"], maxRefs: 0 },
  // Seedream 5.5: also 2:1 and 1:2, which the app has no option for, and 10 references (the app sends 8 at most).
  seedream: { aspects: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"], maxRefs: 10 },
  // MiniMax H3 Image: any ratio from 1:3 to 3:1 (so every one the app has), and 16 references (the app sends 8 at most).
  "minimax-h3-image": { aspects: ["auto", "1:1", "5:4", "4:3", "3:2", "16:9", "21:9", "4:5", "3:4", "2:3", "9:16"], maxRefs: 16 },
};

export function buildApimartImagePayload(model: ImageModel, req: ApimartImageParams, referenceUrls: string[]): ApimartPayload {
  const route = model.apimart;
  if (!route) throw badRequest(`${model.name} is not available on APIMart`);
  const limits = IMAGE_LIMITS[route.family];
  if (referenceUrls.length > limits.maxRefs) throw badRequest(limits.maxRefs ? `Takes up to ${limits.maxRefs} reference images` : "Takes no reference images");
  if (!limits.aspects.includes(req.aspectRatio)) throw badRequest(`Takes no ${req.aspectRatio}`);
  const body: Record<string, unknown> = { model: route.model, prompt: req.prompt, n: 1 };
  if (referenceUrls.length) body.image_urls = referenceUrls;
  switch (route.family) {
    case "gemini":
    case "minimax-h3-image":
      // `resolution` always goes: MiniMax H3 Image's default on APIMart is 4K. `auto` lets the model pick the ratio.
      Object.assign(body, { size: req.aspectRatio, resolution: req.size });
      break;
    case "seedream":
      // `size: "auto"` is 2K whatever `resolution` says; the tier alone as `size` lets the model pick the ratio at that size.
      Object.assign(body, req.aspectRatio === "auto" ? { size: req.size } : { size: req.aspectRatio, resolution: req.size });
      break;
    case "gpt-image-2":
      Object.assign(body, { size: req.aspectRatio, resolution: req.size.toLowerCase() });
      break;
    case "flux-kontext":
      Object.assign(body, { size: req.aspectRatio, output_format: "png" });
      break;
    case "z-image":
      Object.assign(body, { size: req.aspectRatio === "auto" ? "1:1" : req.aspectRatio, resolution: "1K", prompt_extend: false });
      break;
  }
  return { kind: "images", body, priceKey: route.model };
}
