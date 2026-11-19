/**
 * What each Replicate model the catalog routes to takes and costs. Replicate has no shared input shape: every model
 * names its own fields, so each entry says which field carries what, and which values it accepts. Read from the
 * models' public pages on 19 Nov 2026 (the input schema and the price tiers embedded in `replicate.com/<owner>/<name>`;
 * docs/REPLICATE.md says how to refresh them). Official models only: always on, one stable input, billed per image or
 * per second of video instead of by run time.
 *
 * Keyed by `owner/name`, or `owner/name:variant` when the catalog routes two models to one Replicate model (Kling 3.0
 * Standard and Pro, FLUX.3 Video and its draft): see `replicateKey`.
 */
import type { ImageSize, ReplicateRoute, VideoResolution } from "./types";

type Extra = Record<string, string | number | boolean>;

export interface ReplicateImageInfo {
  kind: "image";
  /** Reference images: the field, whether it is a list or one image, and how many (absent: the catalog's limit). No `refs`: text only. */
  refs?: { field: string; list: boolean; max?: number };
  /** It edits or upscales: at least one reference image is required. */
  needsRef?: boolean;
  /** An upscaler: the image in `refs.field`, no prompt. */
  upscale?: boolean;
  /** `aspect_ratio` values. For the app's `auto`, `auto` is sent when set; otherwise the field is left out (Replicate's default). */
  aspect?: { values: string[]; auto?: string };
  /** `resolution` by the app's size. Absent: the model has no size field. */
  sizes?: Partial<Record<ImageSize, string>>;
  /** Fixed fields sent with every request. */
  extra?: Extra;
  /** USD per image: one amount, or by size. */
  usd: number | Partial<Record<ImageSize, number>>;
}

export interface ReplicateVideoInfo {
  kind: "video";
  /** No text-to-video: a first frame is required (Grok Imagine 1.5). */
  imageOnly?: boolean;
  /** The first and last frame's fields. Absent: not taken. */
  firstFrame?: string;
  lastFrame?: string;
  /** Frames go in one list instead, first then last (`max` 1: a first frame only). */
  frameList?: { field: string; max: 1 | 2 };
  /** The longest clip between two frames, when shorter than the model's longest. */
  lastFrameMaxSec?: number;
  /** Style references: the field, how many, and the only clip length that takes them (Veo 3.1: 8 s). */
  references?: { field: string; max: number; onlySec?: number };
  /** `duration` values (seconds); `string`: written as `"5"`. Absent: never sent. */
  duration?: { values: number[] | { min: number; max: number }; string?: boolean };
  /** The resolution's field and Replicate's value for each of the app's. Absent: never sent (the route's variant sets it). */
  resolution?: { field: string; values: Partial<Record<VideoResolution, string>> };
  /**
   * The ratio's field and values. It goes with a prompt or references; with a frame it is left out (the frame sets the
   * shape) unless `frames` gives the value to send then (Seedance's `adaptive`) or `always` sends the chosen one anyway.
   */
  aspect?: { field: string; values: string[]; frames?: string; always?: boolean };
  /** The field that turns the audio track on and off. */
  audio?: string;
  /** Fixed fields sent with every request. */
  extra?: Extra;
  /**
   * `second`: USD per second of video, one amount or by resolution, with `usdAudio` when sound costs more.
   * `video`: USD per clip by `"<resolution>/<seconds>"`; a combination with no price is one the model does not make.
   */
  price: { unit: "second"; usd: number | Partial<Record<VideoResolution, number>>; usdAudio?: number | Partial<Record<VideoResolution, number>> } | { unit: "video"; usd: Record<string, number> };
}

export type ReplicateModelInfo = ReplicateImageInfo | ReplicateVideoInfo;

/** The entry a route points to. */
export function replicateKey(route: ReplicateRoute): string {
  return route.variant ? `${route.model}:${route.variant}` : route.model;
}

const GEMINI_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const GPT_IMAGE_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"];
const FLUX_RATIOS = ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "3:4", "4:3", "9:16"];
const KREA_RATIOS = ["1:1", "4:3", "3:2", "16:9", "4:5", "2:3", "9:16"];
const SEEDANCE_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
const GROK_RATIOS = ["16:9", "4:3", "1:1", "9:16", "3:4", "3:2", "2:3"];
const WAN_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const HD = { "720p": "720p", "1080p": "1080p" } as const;
const SD_HD = { "480p": "480p", "720p": "720p" } as const;
const PIXVERSE_DURATIONS = [5, 8, 10, 15];

export const REPLICATE_MODELS: Record<string, ReplicateModelInfo> = {
  // ---------- images ----------
  "google/nano-banana-pro": { kind: "image", refs: { field: "image_input", list: true, max: 14 }, aspect: { values: GEMINI_RATIOS }, sizes: { "1K": "1K", "2K": "2K", "4K": "4K" }, usd: { "1K": 0.15, "2K": 0.15, "4K": 0.3 } },
  "google/nano-banana-2": { kind: "image", refs: { field: "image_input", list: true, max: 14 }, aspect: { values: GEMINI_RATIOS }, sizes: { "1K": "1K", "2K": "2K", "4K": "4K" }, usd: { "1K": 0.067, "2K": 0.101, "4K": 0.151 } },
  "google/nano-banana-2-lite": { kind: "image", refs: { field: "image_input", list: true, max: 14 }, aspect: { values: GEMINI_RATIOS }, usd: 0.034 },
  "google/nano-banana": { kind: "image", refs: { field: "image_input", list: true }, aspect: { values: GEMINI_RATIOS }, usd: 0.039 },
  // GPT Image: `quality` is left at Replicate's default (`auto`), which is the tier priced here. GPT Image 2.6 Flare and
  // Sunburst are on Replicate too ($0.25 an image at `auto`) but not routed: every other provider bills them by token,
  // with no per-image price to compare, so the one priced route would take every run.
  "openai/gpt-image-2": { kind: "image", refs: { field: "input_images", list: true }, aspect: { values: GPT_IMAGE_RATIOS, auto: "auto" }, usd: 0.128 },
  "openai/gpt-image-1.5": { kind: "image", refs: { field: "input_images", list: true }, aspect: { values: ["1:1", "3:2", "2:3"] }, usd: 0.136 },
  // Krea 2: its images are style references, which the app's edit mode is not; text to image only.
  "krea/krea-2-large": { kind: "image", aspect: { values: KREA_RATIOS }, usd: 0.06 },
  "krea/krea-2-medium": { kind: "image", aspect: { values: KREA_RATIOS }, usd: 0.03 },
  "black-forest-labs/flux-kontext-pro": { kind: "image", refs: { field: "input_image", list: false, max: 1 }, aspect: { values: [...FLUX_RATIOS, "9:21", "2:1", "1:2"] }, usd: 0.04 },
  "black-forest-labs/flux-1.1-pro-ultra": { kind: "image", aspect: { values: [...FLUX_RATIOS, "9:21"] }, usd: 0.06 },
  "black-forest-labs/flux-dev": { kind: "image", aspect: { values: [...FLUX_RATIOS, "9:21"] }, usd: 0.025 },
  "black-forest-labs/flux-schnell": { kind: "image", aspect: { values: [...FLUX_RATIOS, "9:21"] }, usd: 0.003 },
  "qwen/qwen-image-edit-2511": { kind: "image", refs: { field: "image", list: true }, needsRef: true, aspect: { values: ["1:1", "16:9", "9:16", "4:3", "3:4"] }, usd: 0.03 },
  "recraft-ai/recraft-crisp-upscale": { kind: "image", refs: { field: "image", list: false, max: 1 }, needsRef: true, upscale: true, usd: 0.006 },

  // ---------- videos ----------
  // Seedance: a frame needs `adaptive`. The prices are for runs with no video attached, the only ones sent from here.
  "bytedance/seedance-2.5": {
    kind: "video", firstFrame: "image", lastFrame: "last_frame_image", references: { field: "reference_images", max: 30 },
    duration: { values: { min: 4, max: 30 } }, resolution: { field: "resolution", values: SD_HD },
    aspect: { field: "aspect_ratio", values: SEEDANCE_RATIOS, frames: "adaptive" }, audio: "generate_audio",
    price: { unit: "second", usd: { "480p": 0.1028, "720p": 0.2312 } },
  },
  "bytedance/seedance-2.0": {
    kind: "video", firstFrame: "image", lastFrame: "last_frame_image", references: { field: "reference_images", max: 9 },
    duration: { values: { min: 4, max: 15 } }, resolution: { field: "resolution", values: { "480p": "480p", "720p": "720p", "1080p": "1080p", "4K": "4k" } },
    aspect: { field: "aspect_ratio", values: [...SEEDANCE_RATIOS, "9:21"], frames: "adaptive" }, audio: "generate_audio",
    price: { unit: "second", usd: { "480p": 0.08, "720p": 0.18, "1080p": 0.45, "4K": 1 } },
  },
  "bytedance/seedance-2.0-fast": {
    kind: "video", firstFrame: "image", lastFrame: "last_frame_image", references: { field: "reference_images", max: 9 },
    duration: { values: { min: 4, max: 15 } }, resolution: { field: "resolution", values: SD_HD },
    aspect: { field: "aspect_ratio", values: [...SEEDANCE_RATIOS, "9:21"], frames: "adaptive" }, audio: "generate_audio",
    price: { unit: "second", usd: { "480p": 0.07, "720p": 0.15 } },
  },
  "bytedance/seedance-2.0-mini": {
    kind: "video", firstFrame: "image", lastFrame: "last_frame_image", references: { field: "reference_images", max: 9 },
    duration: { values: { min: 4, max: 15 } }, resolution: { field: "resolution", values: SD_HD },
    aspect: { field: "aspect_ratio", values: [...SEEDANCE_RATIOS, "9:21"], frames: "adaptive" }, audio: "generate_audio",
    price: { unit: "second", usd: { "480p": 0.04, "720p": 0.09 } },
  },
  // MiniMax H3: its reference images are public links only (no file input), so none are sent.
  "minimax/h3": {
    kind: "video", firstFrame: "first_frame_image", lastFrame: "last_frame_image",
    duration: { values: { min: 4, max: 15 } }, resolution: { field: "resolution", values: { "768p": "768P", "2K": "2K" } },
    aspect: { field: "ratio", values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], frames: "adaptive" },
    price: { unit: "second", usd: { "768p": 0.08, "2K": 0.13 } },
  },
  // Hailuo 2.3 is billed per clip; 10 s exists at 768p only.
  "minimax/hailuo-2.3": {
    kind: "video", firstFrame: "first_frame_image",
    duration: { values: [6, 10] }, resolution: { field: "resolution", values: { "768p": "768p", "1080p": "1080p" } },
    price: { unit: "video", usd: { "768p/6": 0.28, "768p/10": 0.56, "1080p/6": 0.49 } },
  },
  // Kling 3.0: `mode` is the tier (`standard` renders 720p, `pro` 1080p).
  "kwaivgi/kling-v3-video:standard": {
    kind: "video", firstFrame: "start_image", lastFrame: "end_image",
    duration: { values: { min: 3, max: 15 } }, aspect: { field: "aspect_ratio", values: ["16:9", "9:16", "1:1"] }, audio: "generate_audio",
    extra: { mode: "standard" }, price: { unit: "second", usd: 0.168, usdAudio: 0.252 },
  },
  "kwaivgi/kling-v3-video:pro": {
    kind: "video", firstFrame: "start_image", lastFrame: "end_image",
    duration: { values: { min: 3, max: 15 } }, aspect: { field: "aspect_ratio", values: ["16:9", "9:16", "1:1"] }, audio: "generate_audio",
    extra: { mode: "pro" }, price: { unit: "second", usd: 0.224, usdAudio: 0.336 },
  },
  // Kling 4.0: up to 10 images in all; the app sends frames or references, never both.
  "kwaivgi/kling-v4.0": {
    kind: "video", firstFrame: "start_image", lastFrame: "end_image", references: { field: "reference_images", max: 10 },
    duration: { values: { min: 3, max: 30 } }, resolution: { field: "resolution", values: HD },
    aspect: { field: "aspect_ratio", values: ["16:9", "9:16", "1:1", "21:9"] },
    price: { unit: "second", usd: { "720p": 0.157, "1080p": 0.235 } },
  },
  "xai/grok-imagine-video": {
    kind: "video", firstFrame: "image",
    duration: { values: { min: 1, max: 15 } }, resolution: { field: "resolution", values: SD_HD },
    aspect: { field: "aspect_ratio", values: GROK_RATIOS },
    price: { unit: "second", usd: { "480p": 0.05, "720p": 0.07 } },
  },
  "xai/grok-imagine-video-1.5": {
    kind: "video", imageOnly: true, firstFrame: "image",
    duration: { values: { min: 1, max: 15 } }, resolution: { field: "resolution", values: SD_HD },
    aspect: { field: "aspect_ratio", values: GROK_RATIOS },
    price: { unit: "second", usd: 0.08 },
  },
  "alibaba/wan-3": {
    kind: "video", firstFrame: "image",
    duration: { values: { min: 2, max: 30 } }, resolution: { field: "resolution", values: { "480p": "480p", ...HD } },
    aspect: { field: "aspect_ratio", values: WAN_RATIOS },
    price: { unit: "second", usd: { "480p": 0.035, "720p": 0.07, "1080p": 0.14 } },
  },
  "alibaba/wan-3-prime": {
    kind: "video", firstFrame: "image",
    duration: { values: { min: 2, max: 30 } }, resolution: { field: "resolution", values: { "480p": "480p", ...HD } },
    aspect: { field: "aspect_ratio", values: WAN_RATIOS },
    price: { unit: "second", usd: { "480p": 0.068, "720p": 0.14, "1080p": 0.28 } },
  },
  // Veo 3.1: one rate at 720p and 1080p, doubled by sound; references on 8 s clips only.
  "google/veo-3.1": {
    kind: "video", firstFrame: "image", lastFrame: "last_frame", references: { field: "reference_images", max: 3, onlySec: 8 },
    duration: { values: [4, 6, 8] }, resolution: { field: "resolution", values: HD },
    aspect: { field: "aspect_ratio", values: ["16:9", "9:16"], always: true }, audio: "generate_audio",
    price: { unit: "second", usd: 0.2, usdAudio: 0.4 },
  },
  "google/veo-3.1-fast": {
    kind: "video", firstFrame: "image", lastFrame: "last_frame",
    duration: { values: [4, 6, 8] }, resolution: { field: "resolution", values: HD },
    aspect: { field: "aspect_ratio", values: ["16:9", "9:16"], always: true }, audio: "generate_audio",
    price: { unit: "second", usd: 0.1, usdAudio: 0.15 },
  },
  "alibaba/happyhorse-1.0": {
    kind: "video", firstFrame: "image",
    duration: { values: { min: 3, max: 15 } }, resolution: { field: "resolution", values: HD },
    aspect: { field: "aspect_ratio", values: WAN_RATIOS },
    price: { unit: "second", usd: { "720p": 0.14, "1080p": 0.28 } },
  },
  // HappyHorse 1.1: one image in `images` is the first frame (several would be references, which are not sent).
  "alibaba/happyhorse-1.1": {
    kind: "video", frameList: { field: "images", max: 1 },
    duration: { values: { min: 3, max: 15 } }, resolution: { field: "resolution", values: HD },
    aspect: { field: "aspect_ratio", values: WAN_RATIOS },
    price: { unit: "second", usd: { "720p": 0.14, "1080p": 0.18 } },
  },
  "runwayml/gen-4.5": {
    kind: "video", firstFrame: "image",
    duration: { values: [5, 10] }, aspect: { field: "aspect_ratio", values: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"], always: true },
    price: { unit: "second", usd: 0.12 },
  },
  // Gemini Omni Flash 1.2: two frames make clips of up to 10 s.
  "google/gemini-omni-1.2-flash": {
    kind: "video", firstFrame: "image", lastFrame: "last_frame", lastFrameMaxSec: 10, references: { field: "reference_images", max: 6 },
    duration: { values: { min: 3, max: 15 } }, resolution: { field: "resolution", values: { ...HD, "4K": "4k" } },
    aspect: { field: "aspect_ratio", values: ["16:9", "9:16"], always: true },
    price: { unit: "second", usd: { "720p": 0.105, "1080p": 0.155, "4K": 0.31 } },
  },
  // PixVerse: the resolution is `quality`; 360p and 540p exist too, but the app has no name for them.
  "pixverse/pixverse-v6": {
    kind: "video", firstFrame: "image", lastFrame: "last_frame_image",
    duration: { values: PIXVERSE_DURATIONS }, resolution: { field: "quality", values: HD },
    aspect: { field: "aspect_ratio", values: ["16:9", "9:16", "1:1"] }, audio: "generate_audio_switch",
    price: { unit: "second", usd: { "720p": 0.09, "1080p": 0.18 }, usdAudio: { "720p": 0.12, "1080p": 0.23 } },
  },
  "pixverse/pixverse-v6-max": {
    kind: "video", firstFrame: "image",
    duration: { values: PIXVERSE_DURATIONS }, resolution: { field: "quality", values: HD },
    aspect: { field: "aspect_ratio", values: ["16:9", "9:16", "1:1"] }, audio: "generate_audio_switch",
    price: { unit: "second", usd: { "720p": 0.11, "1080p": 0.22 }, usdAudio: { "720p": 0.15, "1080p": 0.28 } },
  },
  // FLUX.3 Video: frames go in `images` (one opens the clip, two start and end it), the duration is a string.
  "black-forest-labs/flux-3": {
    kind: "video", frameList: { field: "images", max: 2 },
    duration: { values: { min: 5, max: 20 }, string: true }, resolution: { field: "resolution", values: HD },
    aspect: { field: "aspect_ratio", values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] }, audio: "generate_audio",
    price: { unit: "second", usd: { "720p": 0.17, "1080p": 0.29 } },
  },
  "black-forest-labs/flux-3:draft": {
    kind: "video", frameList: { field: "images", max: 2 },
    duration: { values: { min: 5, max: 20 }, string: true }, resolution: { field: "resolution", values: { "720p": "720p" } },
    aspect: { field: "aspect_ratio", values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] }, audio: "generate_audio",
    extra: { draft: true }, price: { unit: "second", usd: { "720p": 0.06 } },
  },
};
