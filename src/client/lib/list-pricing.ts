/**
 * List prices (`ListPrice`) in dollars for one request: what the payload sends (its duration, resolution and
 * audio) picks the amount, which `unitUsd` turns into dollars (kie.ai credits are $0.005; APIMart prices are dollars).
 */
import type { Amount, ListPrice } from "@shared/list-prices";
import type { ImageSize, VideoModel, VideoParams, VideoResolution } from "@shared/types";

const at = (amount: Amount | undefined, res: VideoResolution | undefined): number | undefined =>
  typeof amount === "number" ? amount : res && amount ? amount[res] : undefined;

/**
 * USD for one clip. `params` is what the payload sends; `resolution` the requested one, for a payload that sends none
 * (the model's own); `seconds` the clip's length (the source's, for an edit). `inputVideoSec`: reference videos are
 * attached and run this long together (`null` while their length is not known), billed too unless the price says
 * `referencesFree`. Undefined when no amount applies.
 */
export function videoListUsd(
  price: ListPrice | undefined, model: VideoModel, params: VideoParams, resolution: VideoResolution | undefined, seconds: number | undefined, unitUsd: number,
  inputVideoSec?: number | null,
): number | undefined {
  const res = params.resolution ?? (resolution && model.resolutions.includes(resolution) ? resolution : model.defaultResolution);
  if (price?.unit === "video") {
    if (inputVideoSec !== undefined) return undefined;
    const amount = at(price.byDuration?.[params.duration] ?? price.amount, res);
    return amount === undefined ? undefined : amount * unitUsd;
  }
  if (price?.unit !== "second" || !seconds) return undefined;
  if (inputVideoSec !== undefined && !price.referencesFree) {
    const rate = at(price.videoInputAmount ?? price.amount, res);
    return rate === undefined || inputVideoSec === null ? undefined : rate * (seconds + inputVideoSec) * unitUsd;
  }
  const base = at(price.amount, res);
  const perSecond = params.audio === false ? base : (at(price.audioAmount, res) ?? base);
  return perSecond === undefined ? undefined : perSecond * seconds * unitUsd;
}

/** USD for `count` images at `size`. */
export function imageListUsd(price: ListPrice | undefined, size: ImageSize, count: number, unitUsd: number, inputImages = 0): number | undefined {
  if (price?.unit !== "image") return undefined;
  const per = typeof price.amount === "number" ? price.amount : (price.amount[size] ?? price.amount["1K"]);
  return per === undefined ? undefined : (per + inputImages * (price.inputImageAmount ?? 0)) * unitUsd * count;
}
