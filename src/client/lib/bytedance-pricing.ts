/**
 * Cost estimates for runs on ByteDance (BytePlus ModelArk), from `BYTEDANCE_VIDEO_MODELS`: the tokens of the clip
 * (seconds × width × height × 24 / 1024, at the frame size ModelArk lists for the resolution and ratio) at the
 * model's rate for the resolution. A request is priced by building the payload it would send, so the estimate follows
 * the same model, resolution, ratio and duration as the run. `undefined` when ByteDance would refuse the request.
 */
import { BYTEDANCE_FRAMES, tokensPerSecond } from "@shared/bytedance-prices";
import type { VideoModel } from "@shared/types";
import { buildBytedanceVideoPayload, type BytedanceVideoPayload } from "./bytedance-payloads";
import type { KieVideoEstimate } from "./kie-pricing";

/** The payload ByteDance would get for `req` (placeholder images); throws when ByteDance would refuse it. */
export function bytedanceVideoPayloadFor(model: VideoModel, req: KieVideoEstimate): BytedanceVideoPayload {
  return buildBytedanceVideoPayload(
    model,
    { ...req, prompt: req.prompt ?? "" },
    model.caps.videoEdit
      ? { sourceVideo: "https://video" }
      : {
          firstFrame: req.firstFrame ? "https://frame" : undefined,
          lastFrame: req.lastFrame ? "https://frame" : undefined,
          references: req.references ? ["https://ref"] : [],
          referenceVideos: req.referenceVideos ? ["https://video"] : [],
          referenceAudios: req.referenceAudios ? ["https://audio"] : [],
        },
  );
}

/** Estimated USD for one clip of `req` on ByteDance. */
export function estimateBytedanceVideoCost(model: VideoModel, req: KieVideoEstimate): number | undefined {
  let payload: BytedanceVideoPayload;
  try {
    payload = bytedanceVideoPayloadFor(model, req);
  } catch {
    return undefined;
  }
  const { info, params } = payload;
  const rate = params.resolution ? info.usdPerMTokens[params.resolution] : undefined;
  // A frame leaves the shape to the image (and no ratio to the model): priced at 16:9, the shape of ModelArk's examples.
  const frame = params.resolution ? BYTEDANCE_FRAMES[info.family][params.resolution]?.[payload.ratio ?? "16:9"] : undefined;
  if (rate === undefined || !frame) return undefined;
  return (params.duration * tokensPerSecond(frame) * rate) / 1_000_000;
}
