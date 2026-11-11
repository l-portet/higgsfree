/**
 * Pure request builder for ByteDance's own Seedance models (BytePlus ModelArk): `{ model, content, resolution, ratio,
 * duration, generate_audio, watermark }`, checked against what the model takes (`BYTEDANCE_VIDEO_MODELS`). `content`
 * holds the prompt and the images (a first and last frame, or style references), inline as data URLs, or placeholders
 * when only checking or pricing. A request ByteDance cannot take from here throws a 400, which also keeps a run off
 * ByteDance when another provider can take it (`video-cost.ts`): a video (to edit, or as a reference), because
 * ModelArk takes videos by public link only and the browser has none to give; and reference audio, which the app sends
 * to kie.ai.
 */
import { BYTEDANCE_RATIOS, BYTEDANCE_VIDEO_MODELS, type BytedanceRatio, type BytedanceVideoModel } from "@shared/bytedance-prices";
import { snapDuration } from "@shared/models";
import type { VideoModel, VideoParams } from "@shared/types";
import { badRequest } from "./errors";
import type { KieVideoMedia, KieVideoParams } from "./kie-payloads";

export interface BytedanceVideoPayload {
  /** ModelArk's model id. */
  model: string;
  body: Record<string, unknown>;
  info: BytedanceVideoModel;
  params: VideoParams;
  /** The ratio sent; none when a frame sets the shape (ModelArk's `adaptive`). */
  ratio?: BytedanceRatio;
}

const isRatio = (r: string): r is BytedanceRatio => (BYTEDANCE_RATIOS as readonly string[]).includes(r);

const image = (url: string, role: "first_frame" | "last_frame" | "reference_image") => ({ type: "image_url", image_url: { url }, role });

export function buildBytedanceVideoPayload(model: VideoModel, req: KieVideoParams, media: KieVideoMedia): BytedanceVideoPayload {
  const id = model.bytedance?.model;
  const info = id ? BYTEDANCE_VIDEO_MODELS[id] : undefined;
  if (!id || !info || model.caps.upscale || model.caps.motionControl) throw badRequest(`${model.name} is not available on ByteDance`);
  const prompt = req.prompt.trim();
  const first = media.firstFrame;
  const last = media.lastFrame;
  const refs = media.references ?? [];
  const frames = Boolean(first || last);

  if (media.sourceVideo || model.caps.videoEdit || media.referenceVideos?.length) throw badRequest("Takes videos by public link only");
  if (media.referenceAudios?.length) throw badRequest("Takes no reference video or audio");
  if (last && !first) throw badRequest("Needs a first frame with the last frame");
  if (refs.length && frames) throw badRequest("Takes frames or style references, not both");
  if (refs.length > info.maxReferenceImages) throw badRequest(`Takes up to ${info.maxReferenceImages} reference images`);
  if (!prompt && !frames && !refs.length) throw badRequest("Needs a prompt");

  const duration = snapDuration(model, req.duration);
  if (duration < info.durations.min || duration > info.durations.max) throw badRequest(`Takes clips of ${info.durations.min}–${info.durations.max} s`);
  const resolution = req.resolution && model.resolutions.includes(req.resolution) ? req.resolution : model.defaultResolution;
  if (!resolution || !info.resolutions.includes(resolution)) throw badRequest(`Takes no ${resolution ?? "default resolution"}`);

  const body: Record<string, unknown> = { model: id, resolution: resolution === "4K" ? "4k" : resolution, duration, watermark: false };
  const params: VideoParams = { duration, resolution };
  let ratio: BytedanceRatio | undefined;
  // The ratio goes with a prompt or references: a frame sets the shape (Seedance 2.5 takes only `adaptive` then).
  if (!frames && req.aspectRatio) {
    if (!isRatio(req.aspectRatio)) throw badRequest(`Takes no ${req.aspectRatio}`);
    ratio = req.aspectRatio;
    body.ratio = ratio;
    params.aspectRatio = ratio;
  }
  if (model.caps.audio) {
    const sound = req.audio ?? true;
    body.generate_audio = sound;
    params.audio = sound;
  }

  const content: Record<string, unknown>[] = [];
  if (prompt) content.push({ type: "text", text: prompt });
  if (first) content.push(image(first, "first_frame"));
  if (last) content.push(image(last, "last_frame"));
  for (const url of refs) content.push(image(url, "reference_image"));
  body.content = content;

  const out: BytedanceVideoPayload = { model: id, body, info, params };
  if (ratio) out.ratio = ratio;
  return out;
}
