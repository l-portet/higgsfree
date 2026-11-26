/**
 * Shared types: the single source of truth for the UI ⇄ data-layer contract.
 * Everything runs in the browser; records live in IndexedDB. Keep it dependency-free.
 */

export type GenerationType = "image" | "video";
/** Who runs a generation. A model can be offered by several. */
export type ProviderId = "openrouter" | "fal" | "kie" | "apimart" | "revana" | "bytedance" | "replicate";
/** Motion control: whose orientation the character keeps (fal caps the reference video at 30 s for `video`, 10 s for `image`). */
export type MotionOrientation = "video" | "image";
export type GenerationStatus = "pending" | "running" | "completed" | "failed";

export type ImageAspectRatio =
  | "auto" | "1:1" | "3:4" | "4:3" | "2:3" | "3:2" | "9:16" | "16:9" | "5:4" | "4:5" | "21:9";
export type ImageSize = "1K" | "2K" | "4K";

export type VideoAspectRatio = "21:9" | "16:9" | "3:2" | "4:3" | "1:1" | "3:4" | "2:3" | "9:16" | "9:21";
export type VideoResolution = "480p" | "720p" | "768p" | "1080p" | "2K" | "4K";

/** A file in the local media store. */
export interface MediaRef {
  /** Media id in this browser's library (`gen_abc.png`, `gen_abc.mp4`, `up_xyz.jpg`); resolve with `useMediaUrl`. */
  id: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface ImageParams {
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
  /** Upscalers: how many times wider and taller the image comes back (absent for a model with no factor). */
  upscale?: number;
  /** Upscalers with a creative mode: it was on (generative detail rather than a faithful upscale). */
  creative?: boolean;
}

export interface VideoParams {
  duration: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  /** Whether native audio was requested (only meaningful for models with `audio: true`). */
  audio?: boolean;
  /** Motion control only. */
  orientation?: MotionOrientation;
  /** Upscalers: how many times wider and taller the clip comes back (absent for one that takes a target resolution). */
  upscale?: number;
  /** Upscalers with a creative mode: it was on (generative detail rather than a faithful upscale). */
  creative?: boolean;
}

export interface GenerationInputs {
  /** Reference / edit images (media ids). */
  referenceImages?: string[];
  /** Image-to-video anchor frames (media ids; an upload, or another record's output). Motion control: the character image. */
  firstFrame?: string;
  lastFrame?: string;
  /** Motion control: the reference video whose movement is copied (media id of an uploaded video). */
  motionVideo?: string;
  /** Video editing: the video being edited (media id of an upload, or another record's output). */
  sourceVideo?: string;
  /** Reference clips the model takes its cues from (media ids of uploaded videos, or other records' outputs). */
  referenceVideos?: string[];
  /** Reference audio: a voice, a song, sound effects (media ids of uploaded MP3 / WAV files). */
  referenceAudios?: string[];
}

export interface Generation {
  id: string;
  type: GenerationType;
  status: GenerationStatus;
  prompt: string;
  /** OpenRouter model slug, e.g. `google/gemini-3-pro-image` */
  model: string;
  /** Display name resolved from the catalog at creation time. */
  modelName: string;
  params: ImageParams | VideoParams;
  inputs?: GenerationInputs;
  output?: MediaRef;
  /** Provider or app error, surfaced verbatim when possible. */
  error?: string;
  /** Actual cost reported by OpenRouter (`usage.cost`), when available. */
  costUsd?: number;
  /** Provider job id (video), useful for support / debugging. */
  providerJobId?: string;
  /** Who ran it; absent on records made before fal support (= OpenRouter). */
  provider?: ProviderId;
  /** Groups the N images of one batch request. */
  batchId?: string;
  /** Position within the batch (0-based). */
  batchIndex?: number;
  /** A note written on this video; only present when non-empty. */
  note?: string;
  /** Kept by the user (the heart on a card); only present when true. */
  favorite?: boolean;
  /** The Favorites folder it is filed in (a `Folder` id); only on kept records. */
  folder?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  elapsedMs?: number;
}

// ---------- Favorites folders ----------

/** A folder on the Favorites view. A kept record is in at most one. */
export interface Folder {
  /** `fld_abc…` */
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** What a folder's tile shows: how many records it holds and the newest few, for the cover. */
export interface FolderSummary {
  count: number;
  /** Newest first, at most `FOLDER_COVER_COUNT`. */
  newest: Generation[];
}

export interface FoldersResponse {
  /** Newest first. */
  folders: Folder[];
  /** By folder id. */
  summaries: Record<string, FolderSummary>;
}

/** Create or rename a folder. */
export interface FolderRequest {
  name: string;
}

// ---------- Model catalog ----------

export type ModelProvider =
  | "google" | "openai" | "bytedance" | "kwaivgi" | "minimax" | "x-ai" | "alibaba"
  | "black-forest-labs" | "runway" | "krea" | "heygen" | "qwen" | "recraft" | "microsoft"
  | "meta" | "sourceful" | "tencent" | "pixverse" | "vidu" | "lightricks" | "luma" | "ideogram" | "topaz" | "sand-ai" | "fal" | "openrouter" | "kie" | "apimart" | "revana" | "replicate";

export type ModelBadge = "new" | "pro" | "fast" | "beta";

export interface ImageModel {
  kind: "image";
  /** OpenRouter slug */
  id: string;
  name: string;
  provider: ModelProvider;
  description: string;
  /**
   * Which OpenRouter endpoint serves this model: `chat` (chat completions with `image_config`),
   * `images` (the OpenAI-style `/images/generations`), or `native` (`POST /api/v1/images`, whose
   * options come straight from OpenRouter's image catalog). `fal` = not on OpenRouter at all (it runs on its
   * `fal`, `kie` or `apimart` route).
   */
  endpoint: "chat" | "images" | "native" | "fal";
  featured: boolean;
  badges: ModelBadge[];
  caps: {
    textToImage: boolean;
    imageToImage: boolean;
    /** Max reference images accepted (0 = none). */
    maxReferenceImages: number;
    /**
     * An upscaler: one image in (the reference), the same image larger out, no prompt. `factors`: the scales it
     * offers (empty = it picks its own); `creative`: it has a creative mode (generative detail), a toggle in the composer.
     */
    upscale?: { factors: number[]; creative?: boolean };
  };
  aspectRatios: ImageAspectRatio[];
  sizes: ImageSize[];
  /** Rough USD per image by size, shown as "~$0.13" before generating. */
  estCostUsd: Partial<Record<ImageSize, number>>;
  /** Rough USD for each reference image sent, on top of `estCostUsd` (OpenRouter's Seedream 5.5). */
  estCostPerReferenceUsd?: number;
  /** Whether the size choice is sent (`image_config.image_size` on chat, `resolution` on native). */
  supportsImageSize: boolean;
  /** True when this exact slug + payload shape has been verified end-to-end. */
  verified: boolean;
  /** Listed by OpenRouter but not in the curated catalog: options from OpenRouter, not tested here. */
  discovered?: boolean;
  /** fal serves it too. */
  fal?: FalImageRoute;
  /** kie.ai serves it too. */
  kie?: KieImageRoute;
  /** APIMart serves it too. */
  apimart?: ApimartImageRoute;
  /** Revana serves it too. */
  revana?: RevanaRoute;
  /** Replicate serves it too, through this site's server. */
  replicate?: ReplicateRoute;
  /** Not on OpenRouter: runs only on the providers its routes name (`fal`, `kie`, `apimart`, `revana`, `replicate`). */
  offOpenRouter?: boolean;
}

export interface VideoModel {
  kind: "video";
  id: string;
  name: string;
  provider: ModelProvider;
  description: string;
  featured: boolean;
  badges: ModelBadge[];
  caps: {
    textToVideo: boolean;
    imageToVideo: boolean;
    /** Supports `frame_type: "last_frame"` anchors. */
    lastFrame: boolean;
    /** Ships a native audio track. */
    audio: boolean;
    /** Known to accept real, recognizable human faces on i2v. false = known to reject; undefined = unknown. */
    realFaces?: boolean;
    /** Accepts `input_references` (style / character images). false = known to reject; undefined = supported. */
    references?: boolean;
    /** Motion control: a character image (`firstFrame`) and a reference video (`motionVideo`) are required. */
    motionControl?: boolean;
    /** Video editing: a source video (`sourceVideo`) and a prompt saying what to change are required; the clip keeps the source's length. */
    videoEdit?: boolean;
    /**
     * Takes reference videos and audio besides reference images (Wan 3.0, Seedance 2.0): how many of each, and how
     * long they may run together (seconds, per kind). Absent = image references only. Like images, never with frames.
     */
    mediaReferences?: { videos: number; audios: number; maxSec: number };
    /**
     * An upscaler (with `videoEdit`: a source video in, its length kept), no prompt. `factors`: the scales it offers;
     * empty = it takes a target resolution instead (`resolutions`).
     */
    upscale?: { factors: number[]; creative?: boolean };
  };
  /** Video editing: the provider's limits on the source video (absent = not known, left to the provider). */
  editSource?: {
    minSec?: number;
    maxSec?: number;
    /** Longer sources are cut to `maxSec` rather than refused (Grok Imagine keeps the first 8 s). */
    truncates?: boolean;
    maxMb?: number;
  };
  /** Either a contiguous integer range or an explicit list of allowed durations (seconds). */
  durations: { min: number; max: number; step?: number } | { options: number[] };
  defaultDuration: number;
  resolutions: VideoResolution[];
  defaultResolution?: VideoResolution;
  aspectRatios: VideoAspectRatio[];
  /** Model rejects `aspect_ratio` on image-to-video jobs (output follows the input frame). */
  omitAspectRatioOnI2v?: boolean;
  /** Rough USD per second by resolution (with the audio track, for a model that has one). */
  estCostPerSecUsd: Partial<Record<VideoResolution, number>>;
  /** USD per second with the audio track off, where that costs less (Kling 3.0, Veo 3.1 on OpenRouter). */
  estCostPerSecNoAudioUsd?: Partial<Record<VideoResolution, number>>;
  /** The provider's minimum charge per run, when it has one (Runway Aleph 2). */
  minCostUsd?: number;
  verified: boolean;
  /** Not selectable in the UI (upscaling, avatar models, etc.). */
  hidden?: boolean;
  /**
   * Listed by OpenRouter but not in the curated catalog: options and price come from
   * OpenRouter's video catalog, quirks (faces, references, i2v aspect) are unknown.
   */
  discovered?: boolean;
  /** fal serves it too. */
  fal?: FalVideoRoute;
  /** kie.ai serves it too. */
  kie?: KieVideoRoute;
  /** APIMart serves it too. */
  apimart?: ApimartVideoRoute;
  /** Revana serves it too. */
  revana?: RevanaRoute;
  /** ByteDance serves it too, on its own platform (BytePlus ModelArk). */
  bytedance?: BytedanceRoute;
  /** Replicate serves it too, through this site's server. */
  replicate?: ReplicateRoute;
  /** Not on OpenRouter: runs only on the providers its routes name (`fal`, `kie`, `apimart`, `revana`, `bytedance`, `replicate`). */
  offOpenRouter?: boolean;
}

export type CatalogModel = ImageModel | VideoModel;

/**
 * How fal serves an image model: one endpoint for text-to-image and one for edits (with
 * reference images), plus how the options are spelled. fal endpoints differ in field names,
 * so each model says which ones it takes.
 */
export interface FalImageRoute {
  textToImage?: string;
  edit?: string;
  /** Reference images: a list (`image_urls`) or a single image (`image_url`). */
  refs?: "image_urls" | "image_url";
  /** Aspect ratio as `aspect_ratio`, or as an `image_size` preset / explicit size. Absent = never sent. */
  aspect?: "aspect_ratio" | "image_size";
  /** Per-ratio `image_size` values when the model has its own list (otherwise fal's presets / explicit sizes). */
  imageSizes?: Partial<Record<ImageAspectRatio, string>>;
  /**
   * `image_size` is an explicit width × height for the ratio at the requested size (1K about 1 MP, 2K 4 MP, 4K 16 MP),
   * square for `auto` without references; with references, `auto` sends none and the output follows the first one.
   */
  scaledSize?: boolean;
  /** With `scaledSize`: fal's own `image_size` for `auto` at each size (Seedream 5.5's `auto_1K` / `auto_2K`), sent with or without references. */
  autoSizes?: Partial<Record<ImageSize, string>>;
  /** `resolution: "1K" | "2K" | "4K"` is accepted. */
  resolution?: boolean;
  /** Fixed fields sent with every request. */
  extra?: Record<string, string | number | boolean>;
  /**
   * An upscaler on `edit` (the image as `image_url`): the factor goes in `upscale_factor`; `png`: it takes PNG input only;
   * `creativeEdit`: the endpoint its creative mode runs on instead.
   */
  upscale?: { factor?: boolean; png?: boolean; creativeEdit?: string };
}

/** How fal serves a video model. Values are mapped from the app's options on the way out. */
export interface FalVideoRoute {
  textToVideo?: string;
  imageToVideo?: string;
  /** Character image + reference video (Kling Motion Control). */
  motionControl?: string;
  /** Source video + prompt (video editing), as `video_url` and `prompt`. */
  edit?: string;
  /** Field for the first frame: `image_url` (default) or `start_image_url`. */
  imageField?: "image_url" | "start_image_url";
  /** The last frame goes in `end_image_url`. */
  endImage?: boolean;
  /** The longest clip the endpoint makes with a last frame, when that is less than the model's longest (Gemini Omni Flash 1.2). */
  endImageMaxSec?: number;
  /**
   * Both frames go to this endpoint instead, as `start_image_url` and `end_image_url`, both required
   * (FLUX 3 splits first-frame and first-and-last-frame jobs). A last frame alone is refused.
   */
  firstLastFrameToVideo?: string;
  /** How `duration` is written: `5`, `"5"` or `"5s"`. Absent = never sent. */
  duration?: "number" | "string" | "seconds";
  /** Where `aspect_ratio` is accepted. Absent = never sent. */
  aspect?: "text" | "always";
  /** App resolution → fal's value. Absent = never sent. */
  resolutions?: Partial<Record<VideoResolution, string>>;
  /** Field that toggles the audio track. */
  audio?: "generate_audio" | "generate_audio_switch";
  /** An upscaler on `edit` (the video as `video_url`, no prompt): the scale as `upscale_factor`, or the target resolution as `target_resolution` or `resolution`. */
  upscale?: "upscale_factor" | "target_resolution" | "resolution";
  /** An upscaler's creative mode: another endpoint (`edit`), or a 0/1 field on the same one (`field`). */
  upscaleCreative?: { edit?: string; field?: string };
  extra?: Record<string, string | number | boolean>;
}

/**
 * How kie.ai serves a model: `POST /api/v1/jobs/createTask { model, input }`. kie spells the input
 * differently for every model family, so a route names its family (one builder each in
 * `kie-payloads.ts`), the createTask model ids and a tier inside the model.
 */
export interface KieVideoRoute {
  family: KieVideoFamily;
  /** createTask `model` (text-to-video, and image-to-video unless `imageModel` is set). */
  model: string;
  /** createTask `model` when a frame is attached, for families that split the two. */
  imageModel?: string;
  /** createTask `model` when reference images, videos or audio are attached, for families that split them off too (MAGI-2). */
  referenceModel?: string;
  /** A tier inside the model, sent in its own field: Veo's `model` (`veo3`, `veo3_fast`), Kling's `mode` (`std`, `pro`). */
  tier?: string;
}

export type KieVideoFamily =
  | "veo" | "kling3" | "kling4" | "seedance" | "minimax-h3" | "wan3" | "wan27" | "grok" | "grok15" | "gemini-omni" | "gemini-omni12" | "pixverse" | "vidu" | "magi2" | "wan27-edit" | "topaz-video-upscale";

export interface KieImageRoute {
  family: KieImageFamily;
  /** createTask `model` (text-to-image, and edits unless `editModel` is set). */
  model: string;
  /** createTask `model` with reference images, for families that split the two. */
  editModel?: string;
  /** A tier inside the model (FLUX.1 Kontext's `model`). */
  tier?: string;
}

export type KieImageFamily = "nano-banana" | "nano-banana-2" | "nano-banana-lite" | "gpt-image-2" | "gpt-image-economy" | "seedream" | "minimax-h3-image" | "kling-image" | "flux-kontext" | "z-image" | "topaz-upscale" | "recraft-upscale";

/**
 * How Revana serves a model: `POST /v1/generations` `{ model, input }`, one input shape for every model. `model` is
 * Revana's id; what it takes (resolutions, ratios, durations, inputs) and costs is in `REVANA_MODELS`.
 */
export interface RevanaRoute {
  model: string;
}

/**
 * How ByteDance serves its own video models (BytePlus ModelArk): `POST /contents/generations/tasks`
 * `{ model, content: [text, images…], ratio, duration, resolution, … }`. `model` is ModelArk's id; what it takes and
 * costs is in `BYTEDANCE_VIDEO_MODELS`. Videos only: ModelArk's image API does not take a key from a browser.
 */
export interface BytedanceRoute {
  model: string;
}

/**
 * How Replicate serves a model: `POST /v1/models/<model>/predictions` `{ input }`, one of its official models. `model`
 * is Replicate's `owner/name`; `variant` tells apart two catalog models on one Replicate model (Kling 3.0's `mode`).
 * Which fields the input takes, and what a run costs, is in `REPLICATE_MODELS`.
 */
export interface ReplicateRoute {
  model: string;
  variant?: string;
}

/**
 * How APIMart serves a model: `POST /v1/videos/generations` or `/v1/images/generations` with `{ model, prompt, … }`.
 * The fields differ by model family (one builder each in `apimart-payloads.ts`); `model` is APIMart's id.
 */
export interface ApimartVideoRoute {
  family: ApimartVideoFamily;
  model: string;
  /** A tier sent in its own field: Kling's `mode` (`std`, `pro`). */
  tier?: string;
}

export type ApimartVideoFamily =
  | "veo" | "seedance" | "seedance15" | "minimax-h3" | "hailuo23" | "wan3" | "wan27" | "wan26" | "kling" | "kling4" | "pixverse" | "pixverse-max" | "gemini-omni" | "gemini-omni12" | "flux3" | "vidu";

export interface ApimartImageRoute {
  family: ApimartImageFamily;
  model: string;
}

export type ApimartImageFamily = "gemini" | "gpt-image-2" | "flux-kontext" | "z-image" | "seedream" | "minimax-h3-image";

export interface ModelsResponse {
  image: ImageModel[];
  video: VideoModel[];
  /** Live availability from OpenRouter's public catalogs (fetched with or without a key). */
  live?: {
    checkedAt: string;
    /** Slugs currently listed by OpenRouter (image + video endpoints). */
    available: string[];
  };
}

// ---------- API request / response shapes ----------

export interface ImageGenerateRequest {
  prompt: string;
  model: string;
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
  /** 1–4 images generated in parallel. */
  count: number;
  /** Media ids of stored uploads (see `upload`). */
  referenceImages?: string[];
  /** Run on this provider (picked in the composer) when it has a key and takes the request; otherwise the usual choice. */
  provider?: ProviderId;
  /** Upscalers: the scale (one of the model's `caps.upscale.factors`). */
  upscale?: number;
  /** Upscalers with `caps.upscale.creative`: the creative mode. */
  creative?: boolean;
}

export interface VideoGenerateRequest {
  prompt: string;
  model: string;
  duration: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  audio?: boolean;
  /** Media ids: a stored upload, or an image record's output. */
  firstFrame?: string;
  lastFrame?: string;
  /** Style / character references (no frame lock). */
  references?: string[];
  /** Reference videos (media ids), for models with `caps.mediaReferences`. */
  referenceVideos?: string[];
  /** Reference audio (media ids), for models with `caps.mediaReferences`. */
  referenceAudios?: string[];
  /** Motion control: media id of the reference video (an upload). */
  motionVideo?: string;
  orientation?: MotionOrientation;
  /** Video editing: media id of the video to edit (an upload, or a video record's output). */
  sourceVideo?: string;
  /** Run on this provider (picked in the composer) when it has a key and takes the request; otherwise the cheapest. */
  provider?: ProviderId;
  /** Upscalers: the scale (one of the model's `caps.upscale.factors`). */
  upscale?: number;
  /** Upscalers with `caps.upscale.creative`: the creative mode. */
  creative?: boolean;
}

export interface GenerateResponse {
  generations: Generation[];
}

export interface ListGenerationsQuery {
  type?: GenerationType;
  status?: GenerationStatus;
  /** Only kept (hearted) runs. */
  favorite?: boolean;
  /** Only the records filed in this Favorites folder; `null`: only the ones in no folder. */
  folder?: string | null;
  limit?: number;
  /** Opaque cursor (createdAt of the last item). */
  cursor?: string;
}

export interface ListGenerationsResponse {
  items: Generation[];
  nextCursor?: string;
}

/** The fields the UI may change on an existing record. */
export interface UpdateGenerationRequest {
  favorite?: boolean;
  /** File it in a folder (keeping it if it was not), or `null` to take it out of its folder. */
  folder?: string | null;
  /** A note on a video, or `null` to remove it. */
  note?: string | null;
}

export interface UploadResponse {
  media: MediaRef;
}

export interface SettingsResponse {
  /** An OpenRouter key is stored. */
  hasKey: boolean;
  /** e.g. `sk-or-v1-…a1b2` */
  keyMasked?: string;
  /** Every provider with a stored key, masked (`sk-or-v1-…a1b2`). */
  keys: Partial<Record<ProviderId, string>>;
}

export interface UpdateSettingsRequest {
  /** Pass a new OpenRouter key, or `""` to clear the stored one. */
  apiKey?: string;
  /** A new key for each provider given, or `""` to clear it. */
  keys?: Partial<Record<ProviderId, string>>;
}

export interface CreditsResponse {
  /** Total credits purchased (USD). */
  total: number;
  /** Total usage (USD). */
  used: number;
  remaining: number;
  /** From `/api/v1/key`: key label and optional spend limit. */
  key?: { label?: string; limit?: number | null; usage?: number; isFreeTier?: boolean };
}

/** Per-type counts for the Library card. */
export interface TypeStats {
  count: number;
  completed: number;
  bytes: number;
}

export interface StorageStats {
  image: TypeStats;
  video: TypeStats;
  uploads: { count: number; bytes: number };
}

/** Change-feed events: every local write dispatches one, and other tabs receive it over a BroadcastChannel. */
export type ChangeEvent =
  | { type: "generation"; generation: Generation }
  /** A record was removed (explicit delete, or a failed record replaced by a retry). */
  | { type: "generation-deleted"; id: string }
  /** A Favorites folder was created or renamed. */
  | { type: "folder"; folder: Folder }
  /** A Favorites folder was deleted (its records stay kept; each is announced too). */
  | { type: "folder-deleted"; id: string }
  /** The feed is up (library opened). */
  | { type: "hello"; pendingJobs: number }
  /** The whole library changed underneath (import, clear): drop everything and refetch. */
  | { type: "reset" };

export interface ApiError {
  error: string;
  /** HTTP-like status (OpenRouter's own, or 0 when nothing answered). */
  status: number;
  /** Raw provider body when OpenRouter returned one (helps read "supported values" messages). */
  provider?: unknown;
}
