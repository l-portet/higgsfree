/**
 * The model catalog the app actually uses: OpenRouter's live video and image catalogs merged
 * with the curated entries in `src/shared/models.ts`.
 *
 *  - Video: every option (durations, resolutions, aspect ratios, frames, audio) and the price
 *    come from `GET /api/v1/videos/models`. The curated entry adds the display name, featured
 *    flag, badges, description and the quirks OpenRouter does not publish (faces, references,
 *    aspect ratio on image-to-video). A slug with no curated entry is "discovered". Video editors
 *    are the exception: OpenRouter publishes no options for them, so a curated editor keeps its own
 *    and takes only the price.
 *  - Image: curated models keep their verified routes and options (chat completions and the
 *    OpenAI-style images endpoint do not take OpenRouter's catalog fields one to one). Every
 *    other model in `GET /api/v1/images/models` is discovered and served through the native
 *    `POST /api/v1/images`, whose fields are exactly what the catalog lists.
 *
 * Without a live snapshot (first visit offline, OpenRouter down) the curated catalog is used as is.
 */
import type { ImageAspectRatio, ImageModel, ImageSize, ModelProvider, VideoAspectRatio, VideoModel, VideoResolution } from "@shared/types";
import { findImageModel, findVideoModel, IMAGE_ASPECT_RATIOS, IMAGE_MODELS, PROVIDER_ALIASES, PROVIDER_LABEL, VIDEO_ASPECT_RATIOS, VIDEO_MODELS } from "@shared/models";
import { MAX_REFERENCE_IMAGES } from "./validate";
import { listLiveModels, liveSnapshot, type LiveImageSpec, type LiveModels, type LiveVideoSpec } from "./openrouter";

const VIDEO_RESOLUTIONS: VideoResolution[] = ["480p", "720p", "768p", "1080p", "2K", "4K"];
const IMAGE_SIZES: ImageSize[] = ["1K", "2K", "4K"];

const isKnownProvider = (p: string): p is ModelProvider => Object.hasOwn(PROVIDER_LABEL, p);

function providerOf(id: string): ModelProvider {
  const vendor = id.split("/")[0] ?? "";
  const resolved = PROVIDER_ALIASES[vendor] ?? vendor;
  return isKnownProvider(resolved) ? resolved : "openrouter";
}

/** "MiniMax: H3 Max" → "H3 Max"; falls back to the slug's model part. */
export function displayName(m: { id: string; name?: string }): string {
  const stripped = (m.name ?? "").replace(/^[^:]{1,40}:\s+/, "").trim();
  return stripped || m.id.split("/").pop() || m.id;
}

/** OpenRouter writes resolutions in either case (`4K`, `4k`); the app's names are canonical. */
function videoResolutions(values: string[]): VideoResolution[] {
  const wanted = new Set(values.map((v) => v.toLowerCase()));
  return VIDEO_RESOLUTIONS.filter((r) => wanted.has(r.toLowerCase()));
}

function ordered<T extends string>(known: readonly T[], values: string[]): T[] {
  return known.filter((k) => values.includes(k));
}

/** A contiguous run of integers becomes a range (a stepper); anything else stays a list. */
function durationsOf(list: number[]): VideoModel["durations"] {
  const ints = list.filter((d) => Number.isInteger(d));
  const contiguous = ints.length > 2 && ints.every((d, i) => i === 0 || d - (ints[i - 1] ?? d) === 1);
  const first = ints[0];
  const last = ints[ints.length - 1];
  if (contiguous && first !== undefined && last !== undefined) return { min: first, max: last, step: 1 };
  return { options: ints };
}

function nearest(list: number[], target: number): number | undefined {
  let best: number | undefined;
  for (const d of list) if (best === undefined || Math.abs(d - target) < Math.abs(best - target)) best = d;
  return best;
}

// ---------- prices ----------

/** Typical 16:9 frame per resolution, for SKUs priced per video token (Seedance). */
const FRAME_PIXELS: Record<VideoResolution, number> = {
  "480p": 854 * 480,
  "720p": 1280 * 720,
  "768p": 1366 * 768,
  "1080p": 1920 * 1080,
  "2K": 2560 * 1440,
  "4K": 3840 * 2160,
};
/** ByteDance's video tokens: width × height × 24 fps / 1024 per second. */
const tokensPerSecond = (res: VideoResolution): number => (FRAME_PIXELS[res] * 24) / 1024;

/**
 * USD per second of output at `res`, read from OpenRouter's `pricing_skus`. Audio is on by
 * default on OpenRouter, so a with-audio price wins when there is one; text-to-video is the
 * reference when the two differ. `audio: false` reads the without-audio SKUs instead (a price
 * for the resolution beats a flat one). Undefined when no SKU applies.
 */
export function perSecondUsd(pricing: Record<string, string>, res: VideoResolution, audio = true): number | undefined {
  const r = res.toLowerCase();
  const usd = (key: string, scale = 1): number | undefined => {
    const v = Number.parseFloat(pricing[key] ?? "");
    return Number.isFinite(v) && v > 0 ? v * scale : undefined;
  };
  const tokens = (key: string): number | undefined => {
    const v = usd(key);
    return v === undefined ? undefined : v * tokensPerSecond(res);
  };
  const round = (v: number): number => Math.round(v * 10_000) / 10_000;
  const atRes =
    usd(`duration_seconds_${r}`) ??
    usd(`text_to_video_duration_seconds_${r}`) ??
    usd(`cents_per_video_output_second_${r}`, 0.01) ??
    usd(`cents_per_second_output_${r}`, 0.01);
  const flat = usd("duration_seconds") ?? usd("cents_per_second_output", 0.01);
  const perSecond = audio
    ? (usd(`duration_seconds_with_audio_${r}`) ?? usd("duration_seconds_with_audio") ?? atRes ?? flat ?? tokens(`video_tokens_${r}`) ?? tokens("video_tokens"))
    : (usd(`duration_seconds_without_audio_${r}`) ??
      atRes ??
      usd("duration_seconds_without_audio") ??
      flat ??
      tokens(`video_tokens_without_audio_${r}`) ??
      tokens(`video_tokens_${r}`) ??
      tokens("video_tokens_without_audio") ??
      tokens("video_tokens"));
  return perSecond === undefined ? undefined : round(perSecond);
}

/** The provider's minimum charge per run in `pricing_skus` (Runway Aleph 2), in USD. */
export function minimumUsd(pricing: Record<string, string>): number | undefined {
  const cents = Number.parseFloat(pricing.minimum_cents_per_generation ?? "");
  return Number.isFinite(cents) && cents > 0 ? cents / 100 : undefined;
}

// ---------- video ----------

const DISCOVERED_VIDEO_DESCRIPTION = "New on OpenRouter. Not tested in this app yet.";

/** A spec with no durations: editing, upscaling, avatars. Only a curated editor is driven. */
const isGenerative = (s: LiveVideoSpec): boolean => s.durations.length > 0;

/** A curated video editor: its options stay curated, the price (per second, and any minimum) is OpenRouter's. */
function buildEditModel(spec: LiveVideoSpec, curated: VideoModel): VideoModel {
  const estCostPerSecUsd: VideoModel["estCostPerSecUsd"] = {};
  for (const res of curated.resolutions) {
    const per = perSecondUsd(spec.pricing, res) ?? curated.estCostPerSecUsd[res];
    if (per !== undefined) estCostPerSecUsd[res] = per;
  }
  const model: VideoModel = { ...curated, estCostPerSecUsd };
  const min = minimumUsd(spec.pricing);
  if (min !== undefined) model.minCostUsd = min;
  else delete model.minCostUsd;
  return model;
}

/** Curated entry (if any) with every option and the price replaced by what OpenRouter publishes now. */
export function buildVideoModel(spec: LiveVideoSpec, curated?: VideoModel): VideoModel {
  if (curated?.caps.videoEdit) return buildEditModel(spec, curated);
  if (!isGenerative(spec)) {
    // Upscaling, avatars, editors the app has no entry for: listed (so the slug is known) but never offered.
    return {
      ...(curated ?? {
        kind: "video",
        id: spec.id,
        name: displayName(spec),
        provider: providerOf(spec.id),
        description: "Needs a video or avatar input, which this app does not send",
        featured: false,
        badges: [],
        caps: { textToVideo: false, imageToVideo: false, lastFrame: false, audio: false },
        durations: { options: [5] },
        defaultDuration: 5,
        resolutions: [],
        aspectRatios: ["16:9"],
        estCostPerSecUsd: {},
        verified: false,
        discovered: true,
      }),
      hidden: true,
    };
  }
  const resolutions = videoResolutions(spec.resolutions);
  const aspectRatios = ordered<VideoAspectRatio>(VIDEO_ASPECT_RATIOS, spec.aspectRatios);
  const durations = durationsOf(spec.durations);
  const durationList = "options" in durations ? durations.options : spec.durations;
  const estCostPerSecUsd: VideoModel["estCostPerSecUsd"] = {};
  const estCostPerSecNoAudioUsd: NonNullable<VideoModel["estCostPerSecNoAudioUsd"]> = {};
  for (const res of resolutions) {
    const per = perSecondUsd(spec.pricing, res) ?? curated?.estCostPerSecUsd[res];
    if (per !== undefined) estCostPerSecUsd[res] = per;
    const silent = spec.audio ? perSecondUsd(spec.pricing, res, false) : undefined;
    if (silent !== undefined && silent !== per) estCostPerSecNoAudioUsd[res] = silent;
  }
  const defaultDuration =
    curated && durationList.includes(curated.defaultDuration) ? curated.defaultDuration : (nearest(durationList, 5) ?? curated?.defaultDuration ?? 5);
  const defaultResolution =
    curated?.defaultResolution && resolutions.includes(curated.defaultResolution)
      ? curated.defaultResolution
      : (["720p", "1080p", "768p"] as VideoResolution[]).find((r) => resolutions.includes(r)) ?? resolutions[0];

  const base: VideoModel = curated ?? {
    kind: "video",
    id: spec.id,
    name: displayName(spec),
    provider: providerOf(spec.id),
    description: DISCOVERED_VIDEO_DESCRIPTION,
    featured: false,
    badges: ["new"],
    caps: { textToVideo: true, imageToVideo: false, lastFrame: false, audio: false, references: false },
    durations,
    defaultDuration,
    resolutions,
    aspectRatios,
    estCostPerSecUsd,
    verified: false,
    discovered: true,
  };
  const model: VideoModel = {
    ...base,
    caps: {
      ...base.caps,
      imageToVideo: spec.frames.includes("first_frame"),
      lastFrame: spec.frames.includes("first_frame") && spec.frames.includes("last_frame"),
      audio: spec.audio,
    },
    durations,
    defaultDuration,
    resolutions,
    aspectRatios: aspectRatios.length > 0 ? aspectRatios : base.aspectRatios,
    estCostPerSecUsd,
  };
  if (defaultResolution) model.defaultResolution = defaultResolution;
  else delete model.defaultResolution;
  if (Object.keys(estCostPerSecNoAudioUsd).length > 0) model.estCostPerSecNoAudioUsd = estCostPerSecNoAudioUsd;
  else delete model.estCostPerSecNoAudioUsd;
  if (!(model.caps.textToVideo || model.caps.imageToVideo)) model.hidden = true;
  return model;
}

// ---------- image ----------

const DISCOVERED_IMAGE_DESCRIPTION = "New on OpenRouter. Not tested in this app yet.";
const RASTER_FORMATS = ["png", "jpeg", "jpg", "webp"];

/** A model the native image API serves, shaped for the composer. Undefined when the app cannot use it (vector only, no image output). */
export function buildImageModel(spec: LiveImageSpec, curated?: ImageModel): ImageModel | undefined {
  if (curated && curated.endpoint !== "native") return curated; // verified route: keep its options
  if (!spec.outputModalities.includes("image")) return undefined;
  if (spec.outputFormats && !spec.outputFormats.some((f) => RASTER_FORMATS.includes(f))) return undefined; // SVG only: not displayable here
  const aspectRatios: ImageAspectRatio[] = ["auto", ...ordered<ImageAspectRatio>(IMAGE_ASPECT_RATIOS, spec.aspectRatios).filter((a) => a !== "auto")];
  const sizes = ordered<ImageSize>(IMAGE_SIZES, spec.resolutions);
  const maxRefs = Math.min(spec.references?.max ?? 0, MAX_REFERENCE_IMAGES);
  const base: ImageModel = curated ?? {
    kind: "image",
    id: spec.id,
    name: displayName(spec),
    provider: providerOf(spec.id),
    description: DISCOVERED_IMAGE_DESCRIPTION,
    endpoint: "native",
    featured: false,
    badges: ["new"],
    caps: { textToImage: true, imageToImage: false, maxReferenceImages: 0 },
    aspectRatios,
    sizes: ["1K"],
    estCostUsd: {},
    supportsImageSize: false,
    verified: false,
    discovered: true,
  };
  return {
    ...base,
    caps: { textToImage: (spec.references?.min ?? 0) === 0, imageToImage: maxRefs > 0, maxReferenceImages: maxRefs },
    aspectRatios,
    sizes: sizes.length > 0 ? sizes : ["1K"],
    supportsImageSize: sizes.length > 0,
    estCostUsd: Object.fromEntries(Object.entries(base.estCostUsd).filter(([size]) => sizes.includes(size as ImageSize))),
  };
}

// ---------- the merged catalogs (memoized per snapshot) ----------

interface Merged {
  video: VideoModel[];
  image: ImageModel[];
}

let memoSnapshot: LiveModels | undefined;
let memo: Merged | undefined;

/** Curated order first (the picker lists them in that order), then discovered models newest first. */
function merge(live: LiveModels): Merged {
  const videoSpecs = new Map(live.video.map((s) => [s.id, s]));
  const video: VideoModel[] = [];
  for (const curated of VIDEO_MODELS) {
    const spec = curated.offOpenRouter ? undefined : videoSpecs.get(curated.id);
    if (spec) video.push(buildVideoModel(spec, curated));
    else if (curated.fal || curated.kie || curated.apimart || curated.revana) video.push(curated.offOpenRouter ? curated : { ...curated, offOpenRouter: true }); // another provider still serves it
    // a curated OpenRouter-only slug OpenRouter dropped is gone
  }
  const newestFirst = <T extends { created?: number }>(a: T, b: T): number => (b.created ?? 0) - (a.created ?? 0);
  for (const spec of [...live.video].sort(newestFirst)) if (!findVideoModel(spec.id)) video.push(buildVideoModel(spec));

  const imageSpecs = new Map(live.image.map((s) => [s.id, s]));
  const image: ImageModel[] = [];
  for (const curated of IMAGE_MODELS) {
    const spec = imageSpecs.get(curated.id);
    if (!spec || curated.offOpenRouter) {
      // Verified routes and fal-only models do not depend on OpenRouter's image catalog.
      if (curated.endpoint !== "native") image.push(curated);
      continue;
    }
    const m = buildImageModel(spec, curated);
    if (m) image.push(m);
  }
  for (const spec of [...live.image].sort(newestFirst)) {
    if (findImageModel(spec.id)) continue;
    const m = buildImageModel(spec);
    if (m) image.push(m);
  }
  return { video, image };
}

function merged(): Merged | undefined {
  const live = liveSnapshot();
  if (!live) return undefined;
  if (live !== memoSnapshot || !memo) {
    memoSnapshot = live;
    memo = merge(live);
  }
  return memo;
}

/** Every video model the app knows right now, hidden ones included. */
export function videoCatalog(): VideoModel[] {
  return merged()?.video ?? VIDEO_MODELS;
}

/** Every image model the app can generate with right now. */
export function imageCatalog(): ImageModel[] {
  return merged()?.image ?? IMAGE_MODELS;
}

/** Video models OpenRouter lists that the curated catalog does not. */
export function discoveredVideoModels(): VideoModel[] {
  return videoCatalog().filter((m) => m.discovered);
}

/** Catalog entry for `id`, from what is cached right now. */
export function resolveVideoModel(id: string): VideoModel | undefined {
  return videoCatalog().find((m) => m.id === id);
}

export function resolveImageModel(id: string): ImageModel | undefined {
  return imageCatalog().find((m) => m.id === id);
}

/**
 * Same as `resolve*Model`, but first refreshes the live snapshot (a no-op while it is fresh),
 * so a request is validated against what OpenRouter accepts today.
 */
export async function lookupVideoModel(id: string, key: string | undefined): Promise<VideoModel | undefined> {
  await listLiveModels(key);
  return resolveVideoModel(id);
}

export async function lookupImageModel(id: string, key: string | undefined): Promise<ImageModel | undefined> {
  await listLiveModels(key);
  return resolveImageModel(id);
}
