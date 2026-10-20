/**
 * Cost estimates for runs on kie.ai, from kie's list prices (`KIE_PRICES`, credits at $0.005). A request is
 * priced by building the payload it would send, so the estimate follows the same model, tier, resolution,
 * duration and audio as the run. `undefined` when kie would refuse the request or the price is not known.
 */
import { KIE_PRICES, type CreditsByResolution } from "@shared/kie-prices";
import { editedLength } from "@shared/models";
import type { ImageModel, VideoModel, VideoResolution } from "@shared/types";
import { KIE_CREDIT_USD } from "./kie";
import { buildKieImagePayload, buildKieVideoPayload, type KieImageParams, type KieVideoParams, type KieVideoPayload } from "./kie-payloads";

const at = (credits: CreditsByResolution | undefined, res: VideoResolution | undefined): number | undefined =>
  typeof credits === "number" ? credits : res && credits ? credits[res] : undefined;

export interface KieVideoEstimate extends Omit<KieVideoParams, "prompt"> {
  prompt?: string;
  firstFrame?: boolean;
  lastFrame?: boolean;
  references?: boolean;
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
      : { firstFrame: req.firstFrame ? "https://frame" : undefined, lastFrame: req.lastFrame ? "https://frame" : undefined, references: req.references ? ["https://ref"] : [] },
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
  const price = KIE_PRICES[payload.priceKey];
  const res = payload.params.resolution ?? (req.resolution && model.resolutions.includes(req.resolution) ? req.resolution : model.defaultResolution);
  if (price?.unit === "video") {
    const credits = at(price.byDuration?.[payload.params.duration] ?? price.credits, res);
    return credits === undefined ? undefined : credits * KIE_CREDIT_USD;
  }
  if (price?.unit !== "second") return undefined;
  const seconds = model.caps.videoEdit ? req.videoSec && editedLength(model, req.videoSec) : payload.params.duration;
  if (!seconds) return undefined;
  const base = at(price.credits, res);
  const perSecond = payload.params.audio === false ? base : (at(price.audioCredits, res) ?? base);
  return perSecond === undefined ? undefined : perSecond * seconds * KIE_CREDIT_USD;
}

/** Estimated USD for `count` images of `req` on kie.ai, with or without reference images. */
export function estimateKieImageCost(model: ImageModel, req: Omit<KieImageParams, "prompt">, count: number, withRefs: boolean): number | undefined {
  let payload;
  try {
    payload = buildKieImagePayload(model, { ...req, prompt: "" }, withRefs ? ["https://ref"] : []);
  } catch {
    return undefined;
  }
  const price = KIE_PRICES[payload.priceKey];
  if (price?.unit !== "image") return undefined;
  const per = typeof price.credits === "number" ? price.credits : (price.credits[req.size] ?? price.credits["1K"]);
  return per === undefined ? undefined : per * KIE_CREDIT_USD * count;
}
