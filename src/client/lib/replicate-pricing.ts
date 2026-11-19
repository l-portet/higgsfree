/**
 * Cost estimates for runs on Replicate, from the price tiers of its official models (`REPLICATE_MODELS`, USD): per
 * image, per second of video (dearer with sound on some models) or per clip. A request is priced by building the
 * payload it would send, so the estimate follows the same model, resolution, duration and sound as the run.
 * `undefined` when Replicate would refuse the request. Replicate's API does not say what a run cost, so the estimate
 * is all the app has: nothing is recorded on the run itself.
 */
import type { ImageModel, VideoModel } from "@shared/types";
import type { KieImageParams } from "./kie-payloads";
import type { KieVideoEstimate } from "./kie-pricing";
import { buildReplicateImagePayload, buildReplicateVideoPayload, type ReplicateVideoPayload } from "./replicate-payloads";

/** The payload Replicate would get for `req` (placeholder images); throws when Replicate would refuse it. */
export function replicateVideoPayloadFor(model: VideoModel, req: KieVideoEstimate): ReplicateVideoPayload {
  return buildReplicateVideoPayload(
    model,
    // Replicate's models need a prompt; while the composer has not said what it is, the request is priced as if it had one.
    { ...req, prompt: req.prompt ?? "a" },
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

/** Estimated USD for one clip of `req` on Replicate. */
export function estimateReplicateVideoCost(model: VideoModel, req: KieVideoEstimate): number | undefined {
  let payload: ReplicateVideoPayload;
  try {
    payload = replicateVideoPayloadFor(model, req);
  } catch {
    return undefined;
  }
  const { price } = payload.info;
  const { duration, resolution, audio } = payload.params;
  if (price.unit === "video") return price.usd[`${resolution}/${duration}`];
  const list = audio && price.usdAudio !== undefined ? price.usdAudio : price.usd;
  const rate = typeof list === "number" ? list : resolution ? list[resolution] : undefined;
  return rate === undefined ? undefined : rate * duration;
}

/** Estimated USD for `count` images of `req` on Replicate, with or without reference images. */
export function estimateReplicateImageCost(model: ImageModel, req: Omit<KieImageParams, "prompt">, count: number, withRefs: boolean): number | undefined {
  let payload;
  try {
    payload = buildReplicateImagePayload(model, { ...req, prompt: "" }, withRefs || model.caps.upscale ? ["https://ref"] : []);
  } catch {
    return undefined;
  }
  const { usd } = payload.info;
  const per = typeof usd === "number" ? usd : usd[req.size];
  return per === undefined ? undefined : per * count;
}
