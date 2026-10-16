/**
 * Shared types: the single source of truth for the UI ⇄ data-layer contract.
 * Everything runs in the browser; records live in IndexedDB. Keep it dependency-free.
 */

export type GenerationType = "image" | "video";
/** Who runs a generation. A model can be offered by one or both. */
export type ProviderId = "openrouter" | "fal";
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
}

export interface VideoParams {
  duration: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  /** Whether native audio was requested (only meaningful for models with `audio: true`). */
  audio?: boolean;
  /** Motion control only. */
  orientation?: MotionOrientation;
}

export interface GenerationInputs {
  /** Reference / edit images (media ids). */
  referenceImages?: string[];
  /** Image-to-video anchor frames (media ids; an upload, or another record's output). Motion control: the character image. */
  firstFrame?: string;
  lastFrame?: string;
  /** Motion control: the reference video whose movement is copied (media id of an uploaded video). */
  motionVideo?: string;
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
  | "meta" | "sourceful" | "tencent" | "pixverse" | "vidu" | "lightricks" | "luma" | "ideogram" | "fal" | "openrouter";

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
   * options come straight from OpenRouter's image catalog). `fal` = not on OpenRouter at all.
   */
  endpoint: "chat" | "images" | "native" | "fal";
  featured: boolean;
  badges: ModelBadge[];
  caps: {
    textToImage: boolean;
    imageToImage: boolean;
    /** Max reference images accepted (0 = none). */
    maxReferenceImages: number;
  };
  aspectRatios: ImageAspectRatio[];
  sizes: ImageSize[];
  /** Rough USD per image by size, shown as "~$0.13" before generating. */
  estCostUsd: Partial<Record<ImageSize, number>>;
  /** Whether the size choice is sent (`image_config.image_size` on chat, `resolution` on native). */
  supportsImageSize: boolean;
  /** True when this exact slug + payload shape has been verified end-to-end. */
  verified: boolean;
  /** Listed by OpenRouter but not in the curated catalog: options from OpenRouter, not tested here. */
  discovered?: boolean;
  /** fal serves it too (or only fal does, with `falOnly`). */
  fal?: FalImageRoute;
  /** Not on OpenRouter: needs a fal key. */
  falOnly?: boolean;
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
  };
  /** Either a contiguous integer range or an explicit list of allowed durations (seconds). */
  durations: { min: number; max: number; step?: number } | { options: number[] };
  defaultDuration: number;
  resolutions: VideoResolution[];
  defaultResolution?: VideoResolution;
  aspectRatios: VideoAspectRatio[];
  /** Model rejects `aspect_ratio` on image-to-video jobs (output follows the input frame). */
  omitAspectRatioOnI2v?: boolean;
  /** Rough USD per second by resolution. */
  estCostPerSecUsd: Partial<Record<VideoResolution, number>>;
  verified: boolean;
  /** Not selectable in the UI (video-to-video, avatar models, etc.). */
  hidden?: boolean;
  /**
   * Listed by OpenRouter but not in the curated catalog: options and price come from
   * OpenRouter's video catalog, quirks (faces, references, i2v aspect) are unknown.
   */
  discovered?: boolean;
  /** fal serves it too (or only fal does, with `falOnly`). */
  fal?: FalVideoRoute;
  /** Not on OpenRouter: needs a fal key. */
  falOnly?: boolean;
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
  /** `resolution: "1K" | "2K" | "4K"` is accepted. */
  resolution?: boolean;
  /** Fixed fields sent with every request. */
  extra?: Record<string, string | number | boolean>;
}

/** How fal serves a video model. Values are mapped from the app's options on the way out. */
export interface FalVideoRoute {
  textToVideo?: string;
  imageToVideo?: string;
  /** Character image + reference video (Kling Motion Control). */
  motionControl?: string;
  /** Field for the first frame: `image_url` (default) or `start_image_url`. */
  imageField?: "image_url" | "start_image_url";
  /** The last frame goes in `end_image_url`. */
  endImage?: boolean;
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
  extra?: Record<string, string | number | boolean>;
}

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
  /** Motion control: media id of the reference video (an upload). */
  motionVideo?: string;
  orientation?: MotionOrientation;
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
  hasFalKey: boolean;
  falKeyMasked?: string;
  /** Which provider runs a model both offer (when both keys are set). */
  preferredProvider: ProviderId;
}

export interface UpdateSettingsRequest {
  /** Pass a new OpenRouter key, or `""` to clear the stored one. */
  apiKey?: string;
  /** Pass a new fal key, or `""` to clear the stored one. */
  falKey?: string;
  preferredProvider?: ProviderId;
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
