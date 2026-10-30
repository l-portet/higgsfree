/**
 * Cost estimates for runs on kie.ai, from kie's list prices (`KIE_PRICES`, credits at $0.005). A request is
 * priced by building the payload it would send, so the estimate follows the same model, tier, resolution,
 * duration and audio as the run. `undefined` when kie would refuse the request or the price is not known.
 */
import { KIE_PRICES } from "@shared/kie-prices";
import { editedLength } from "@shared/models";
import type { ImageModel, VideoModel } from "@shared/types";
import { KIE_CREDIT_USD } from "./kie";
import { buildKieImagePayload, buildKieVideoPayload, type KieImageParams, type KieVideoParams, type KieVideoPayload } from "./kie-payloads";
import { imageListUsd, videoListUsd } from "./list-pricing";

export interface KieVideoEstimate extends Omit<KieVideoParams, "prompt"> {
  prompt?: string;
  firstFrame?: boolean;
  lastFrame?: boolean;
  references?: boolean;
  referenceVideos?: boolean;
  referenceAudios?: boolean;
  /** How long the reference videos run together; they are billed too. Unknown: no estimate. */
  referenceVideoSec?: number;
  /** Video editing: the source's length, which is the clip's. Unknown: no estimate. */
  videoSec?: number;
}

/** The payload kie would get for `req` (placeholder urls); throws when kie would refuse it. */
export function kieVideoPayloadFor(model: VideoModel, req: KieVideoEstimate): KieVideoPayload {
  return buildKieVideoPayload(
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
          referenceVideoSec: req.referenceVideoSec,
        },
  );
}

/** Estimated USD for one clip of `req` on kie.ai. */
export function estimateKieVideoCost(model: VideoModel, req: KieVideoEstimate): number | undefined {
  let payload;
  try {
    payload = kieVideoPayloadFor(model, req);
  } catch {
    return undefined;
  }
  const seconds = model.caps.videoEdit ? req.videoSec && editedLength(model, req.videoSec) : payload.params.duration;
  const inputVideoSec = req.referenceVideos ? (req.referenceVideoSec ?? null) : undefined;
  return videoListUsd(KIE_PRICES[payload.priceKey], model, payload.params, req.resolution, seconds, KIE_CREDIT_USD, inputVideoSec);
}

/** Estimated USD for `count` images of `req` on kie.ai, with or without reference images. */
export function estimateKieImageCost(model: ImageModel, req: Omit<KieImageParams, "prompt">, count: number, withRefs: boolean): number | undefined {
  let payload;
  try {
    payload = buildKieImagePayload(model, { ...req, prompt: "" }, withRefs ? ["https://ref"] : []);
  } catch {
    return undefined;
  }
  return imageListUsd(KIE_PRICES[payload.priceKey], req.size, count, KIE_CREDIT_USD);
}
