/**
 * Cost estimates for runs on Revana, from its list (`REVANA_MODELS`, USD). A request is priced by building the payload
 * it would send, so the estimate follows the same model, resolution, duration and sound as the run. Per-second prices
 * have a `+audio` rate (sound on) and a `+video_input` rate (a video attached: billed for its seconds and the clip's).
 * `undefined` when Revana would refuse the request or the price is not known.
 */
import { editedLength } from "@shared/models";
import type { RevanaModelInfo } from "@shared/revana-models";
import type { ImageModel, VideoModel } from "@shared/types";
import type { KieImageParams } from "./kie-payloads";
import type { KieVideoEstimate } from "./kie-pricing";
import { buildRevanaImagePayload, buildRevanaVideoPayload, type RevanaVideoPayload } from "./revana-payloads";

const amount = (usd: RevanaModelInfo["price"]["usd"], key: string | undefined): number | undefined =>
  typeof usd === "number" ? usd : key !== undefined ? usd[key] : undefined;

/** The payload Revana would get for `req` (placeholder urls); throws when Revana would refuse it. */
export function revanaVideoPayloadFor(model: VideoModel, req: KieVideoEstimate): RevanaVideoPayload {
  return buildRevanaVideoPayload(
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

/** Estimated USD for one clip of `req` on Revana. */
export function estimateRevanaVideoCost(model: VideoModel, req: KieVideoEstimate): number | undefined {
  let payload: RevanaVideoPayload;
  try {
    payload = revanaVideoPayloadFor(model, req);
  } catch {
    return undefined;
  }
  const { usd, unit } = payload.info.price;
  if (unit === "job") return amount(usd, payload.priceKey);
  if (unit !== "second") return undefined;
  // A model priced by resolution that takes no resolution field still renders at the catalog's.
  const key = payload.priceKey ?? payload.params.resolution;
  const edit = Boolean(model.caps.videoEdit);
  const seconds = edit ? (req.videoSec === undefined ? undefined : editedLength(model, req.videoSec)) : payload.params.duration;
  if (!seconds) return undefined;
  const inputSec = edit ? req.videoSec : req.referenceVideos ? req.referenceVideoSec : undefined;
  if (edit || req.referenceVideos) {
    const withInput = typeof usd === "number" || key === undefined ? undefined : usd[`${key}+video_input`];
    if (withInput !== undefined) return inputSec === undefined ? undefined : withInput * (seconds + inputSec);
  }
  const base = amount(usd, key);
  const sound = payload.params.audio && typeof usd !== "number" && key !== undefined ? usd[`${key}+audio`] : undefined;
  const rate = sound ?? base;
  return rate === undefined ? undefined : rate * seconds;
}

/** Estimated USD for `count` images of `req` on Revana, with or without reference images. */
export function estimateRevanaImageCost(model: ImageModel, req: Omit<KieImageParams, "prompt">, count: number, withRefs: boolean): number | undefined {
  let payload;
  try {
    payload = buildRevanaImagePayload(model, { ...req, prompt: "" }, withRefs || model.caps.upscale ? ["https://ref"] : []);
  } catch {
    return undefined;
  }
  if (payload.info.price.unit !== "image") return undefined;
  const per = amount(payload.info.price.usd, payload.priceKey ?? "1K");
  return per === undefined ? undefined : per * count;
}
