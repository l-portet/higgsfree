/**
 * Cost estimates for runs on APIMart, from its prices (`APIMART_PRICES`, USD). A request is priced by building
 * the payload it would send, so the estimate follows the same model, tier, resolution, duration and audio as the
 * run. `undefined` when APIMart would refuse the request or the price is not known.
 */
import { APIMART_PRICES } from "@shared/apimart-prices";
import type { ImageModel, VideoModel } from "@shared/types";
import { buildApimartImagePayload, buildApimartVideoPayload, type ApimartImageParams, type ApimartVideoParams, type ApimartVideoPayload } from "./apimart-payloads";
import { imageListUsd, videoListUsd } from "./list-pricing";

export interface ApimartVideoEstimate extends Omit<ApimartVideoParams, "prompt"> {
  prompt?: string;
  firstFrame?: boolean;
  lastFrame?: boolean;
  references?: boolean;
}

/** The payload APIMart would get for `req` (placeholder urls); throws when APIMart would refuse it. */
export function apimartVideoPayloadFor(model: VideoModel, req: ApimartVideoEstimate): ApimartVideoPayload {
  return buildApimartVideoPayload(
    model,
    { ...req, prompt: req.prompt ?? "" },
    { firstFrame: req.firstFrame ? "https://frame" : undefined, lastFrame: req.lastFrame ? "https://frame" : undefined, references: req.references ? ["https://ref"] : [] },
  );
}

/** Estimated USD for one clip of `req` on APIMart. */
export function estimateApimartVideoCost(model: VideoModel, req: ApimartVideoEstimate): number | undefined {
  let payload;
  try {
    payload = apimartVideoPayloadFor(model, req);
  } catch {
    return undefined;
  }
  return videoListUsd(APIMART_PRICES[payload.priceKey], model, payload.params, req.resolution, payload.params.duration, 1);
}

/** Estimated USD for `count` images of `req` on APIMart, with or without reference images. */
export function estimateApimartImageCost(model: ImageModel, req: Omit<ApimartImageParams, "prompt">, count: number, withRefs: boolean): number | undefined {
  let payload;
  try {
    payload = buildApimartImagePayload(model, { ...req, prompt: "" }, withRefs ? ["https://ref"] : []);
  } catch {
    return undefined;
  }
  return imageListUsd(APIMART_PRICES[payload.priceKey], req.size, count, 1);
}
