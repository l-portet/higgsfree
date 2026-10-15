/**
 * Pure payload builders for OpenRouter: the verified shapes from docs/OPENROUTER.md.
 * Kept side-effect free so they can be unit tested.
 */
import type { ImageAspectRatio, ImageModel, ImageSize, VideoAspectRatio, VideoModel, VideoResolution } from "@shared/types";
import { snapDuration } from "@shared/models";

// ---------- images ----------

export type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatImageBody {
  model: string;
  messages: [{ role: "user"; content: string | ChatContentPart[] }];
  modalities: ["image", "text"];
  image_config?: { aspect_ratio?: ImageAspectRatio; image_size?: ImageSize };
  /** Ask OpenRouter to include `usage.cost` in the response. */
  usage: { include: true };
}

export interface ImagesGenerationsBody {
  model: string;
  prompt: string;
  size?: string;
  image?: string[];
  input_fidelity?: "high";
}

/** `POST /api/v1/images`: options as OpenRouter's image catalog names them. */
export interface NativeImageBody {
  model: string;
  prompt: string;
  aspect_ratio?: ImageAspectRatio;
  resolution?: ImageSize;
  /** Models whose catalog entry lists `quality` (GPT Image); only the prompt editor's preview sends it. */
  quality?: "low" | "medium" | "high";
  input_references?: { type: "image_url"; image_url: { url: string } }[];
}

// ---------- text ----------

/** A user message part for a text completion: text, or a video for a model that watches one (docs/OPENROUTER.md). */
export type ChatTextPart =
  | { type: "text"; text: string }
  | {
      type: "video_url";
      /** `processing`: Gemini's mode; `static` samples a short clip in one pass (fastest), `agentic` navigates a long one. */
      video_url: { url: string; processing?: "static" | "agentic" };
    };

/** `POST /api/v1/chat/completions` for text, streamed (the prompt editor). */
export interface ChatTextBody {
  model: string;
  messages: { role: "system" | "user"; content: string | ChatTextPart[] }[];
  stream: true;
  max_tokens: number;
  /** Little thinking for a short rewrite, and none of it in the stream. */
  reasoning: { effort: "low"; exclude: true };
  usage: { include: true };
}

export type ImagePayload =
  | { endpoint: "chat"; body: ChatImageBody }
  | { endpoint: "images"; body: ImagesGenerationsBody }
  | { endpoint: "native"; body: NativeImageBody };

/** `size` values for the OpenAI-style images endpoint, by aspect ratio. */
export const IMAGES_SIZE_BY_ASPECT: Partial<Record<ImageAspectRatio, string>> = {
  "1:1": "1024x1024",
  "2:3": "1024x1536",
  "3:2": "1536x1024",
};

export interface ImageRequestParams {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
}

export function buildImagePayload(model: ImageModel, req: ImageRequestParams, referenceDataUrls: string[]): ImagePayload {
  if (model.endpoint === "native") {
    const body: NativeImageBody = { model: model.id, prompt: req.prompt };
    if (req.aspectRatio !== "auto" && model.aspectRatios.includes(req.aspectRatio)) body.aspect_ratio = req.aspectRatio;
    if (model.supportsImageSize && model.sizes.includes(req.size)) body.resolution = req.size;
    if (referenceDataUrls.length > 0) body.input_references = referenceDataUrls.map((url) => ({ type: "image_url", image_url: { url } }));
    return { endpoint: "native", body };
  }
  if (model.endpoint === "images") {
    const body: ImagesGenerationsBody = { model: model.id, prompt: req.prompt };
    // Only send `size` when the model actually offers an aspect choice (Krea is 1:1 only).
    const size = req.aspectRatio !== "auto" && model.aspectRatios.length > 1 ? IMAGES_SIZE_BY_ASPECT[req.aspectRatio] : undefined;
    if (size) body.size = size;
    if (referenceDataUrls.length > 0) {
      body.image = referenceDataUrls;
      body.input_fidelity = "high";
    }
    return { endpoint: "images", body };
  }

  const content: string | ChatContentPart[] =
    referenceDataUrls.length === 0
      ? req.prompt
      : [{ type: "text", text: req.prompt }, ...referenceDataUrls.map((url): ChatContentPart => ({ type: "image_url", image_url: { url } }))];

  const body: ChatImageBody = {
    model: model.id,
    messages: [{ role: "user", content }],
    modalities: ["image", "text"],
    usage: { include: true },
  };
  const imageConfig: NonNullable<ChatImageBody["image_config"]> = {};
  if (req.aspectRatio !== "auto") imageConfig.aspect_ratio = req.aspectRatio;
  if (model.supportsImageSize) imageConfig.image_size = req.size;
  if (Object.keys(imageConfig).length > 0) body.image_config = imageConfig;
  return { endpoint: "chat", body };
}

// ---------- videos ----------

export interface FrameImage {
  type: "image_url";
  image_url: { url: string };
  frame_type: "first_frame" | "last_frame";
}
export interface InputReference {
  type: "image_url";
  image_url: { url: string };
}

export interface VideoBody {
  model: string;
  prompt: string;
  duration: number;
  aspect_ratio?: VideoAspectRatio;
  resolution?: VideoResolution;
  frame_images?: FrameImage[];
  input_references?: InputReference[];
  /** Native audio track on/off; only meaningful for models with `caps.audio` (OpenRouter defaults to on). */
  generate_audio?: boolean;
}

export interface VideoRequestParams {
  prompt: string;
  duration: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  audio?: boolean;
}

export interface VideoFrames {
  firstFrame?: string;
  lastFrame?: string;
}

export interface VideoPayload {
  body: VideoBody;
  /** The values actually sent (duration snapped, aspect/resolution possibly omitted). */
  effective: { duration: number; aspectRatio?: VideoAspectRatio; resolution?: VideoResolution };
}

export function buildVideoPayload(model: VideoModel, req: VideoRequestParams, frames: VideoFrames, referenceDataUrls: string[] = []): VideoPayload {
  const duration = snapDuration(model, req.duration);
  const body: VideoBody = { model: model.id, prompt: req.prompt, duration };
  const effective: VideoPayload["effective"] = { duration };

  const frameImages: FrameImage[] = [];
  if (frames.firstFrame) frameImages.push({ type: "image_url", image_url: { url: frames.firstFrame }, frame_type: "first_frame" });
  if (frames.lastFrame) frameImages.push({ type: "image_url", image_url: { url: frames.lastFrame }, frame_type: "last_frame" });
  if (frameImages.length > 0) body.frame_images = frameImages;
  if (referenceDataUrls.length > 0) body.input_references = referenceDataUrls.map((url) => ({ type: "image_url", image_url: { url } }));

  const omitAspect = Boolean(model.omitAspectRatioOnI2v) && frameImages.length > 0;
  if (req.aspectRatio && !omitAspect) {
    body.aspect_ratio = req.aspectRatio;
    effective.aspectRatio = req.aspectRatio;
  }

  // Only send `resolution` if the model lists it (Hailuo 3 accepts exactly one value: 2K).
  // An unlisted request falls back to the model default; if nothing is listed, omit it.
  const resolution = [req.resolution, model.defaultResolution].find((r) => r !== undefined && model.resolutions.includes(r));
  if (resolution) {
    body.resolution = resolution;
    effective.resolution = resolution;
  }

  // `generate_audio` is only sent when the model has an audio track to switch and the user chose explicitly.
  if (model.caps.audio && req.audio !== undefined) body.generate_audio = req.audio;
  return { body, effective };
}
