/**
 * Upscalers (`caps.upscale`): one image or video in, the same one larger out, no prompt. Their requests and prices
 * share nothing with the generators', so the provider builders (`fal-payloads.ts`, `kie-payloads.ts`) and pricers
 * hand an upscaler over to this file. Prices are each provider's list prices, read on 2 Nov 2026 from fal's model
 * pages (`fal.ai/models/<endpoint>/llms.txt`), OpenRouter's video catalog and kie.ai's pricing API. A creative mode
 * (`caps.upscale.creative`: Topaz's generative models, FLUX's creative detail) is fal's and OpenRouter's only.
 */
import type { FalImageRoute, FalVideoRoute, ImageModel, KieImageRoute, KieVideoRoute, ProviderId, VideoModel, VideoParams, VideoResolution } from "@shared/types";
import { badRequest } from "./errors";
import { KIE_CREDIT_USD } from "./kie";

type Upscaler = { name: string; caps: { upscale?: { factors: number[]; creative?: boolean } } };

/** The scale sent: the one asked for when the model offers it, else its first; undefined for a model that offers none. */
export function upscaleFactor(model: Upscaler, requested: number | undefined): number | undefined {
  const factors = model.caps.upscale?.factors ?? [];
  if (factors.length === 0) return undefined;
  return requested !== undefined && factors.includes(requested) ? requested : factors[0];
}

/** "4x" (the scale), or "" when the model picks its own. */
export function factorLabel(factor: number | undefined): string {
  return factor ? `${factor}x` : "";
}

// ---------- requests ----------

/** The creative mode asked for on a model that has one, or refused on one that does not. */
function creativeOn(model: Upscaler, creative: boolean | undefined): boolean {
  if (creative && !model.caps.upscale?.creative) throw badRequest(`${model.name} has no creative mode`);
  return Boolean(creative);
}

export function falUpscaleImage(
  model: ImageModel, route: FalImageRoute, imageUrl: string | undefined, factor: number | undefined, creative?: boolean,
): { endpoint: string; input: Record<string, unknown> } {
  const endpoint = creativeOn(model, creative) ? route.upscale?.creativeEdit : route.edit;
  if (!endpoint) throw badRequest(`${model.name} is not available on fal`);
  if (!imageUrl) throw badRequest(`${model.name} needs an image to upscale`);
  const input: Record<string, unknown> = { image_url: imageUrl };
  const f = upscaleFactor(model, factor);
  if (route.upscale?.factor && f) input.upscale_factor = f;
  return { endpoint, input };
}

export function kieUpscaleImage(
  model: ImageModel, route: KieImageRoute, imageUrl: string | undefined, factor: number | undefined, creative?: boolean,
): { model: string; input: Record<string, unknown>; priceKey: string } {
  if (creativeOn(model, creative)) throw badRequest("Takes no creative upscale");
  if (!imageUrl) throw badRequest(`${model.name} needs an image to upscale`);
  const f = upscaleFactor(model, factor);
  switch (route.family) {
    case "topaz-upscale":
      return { model: route.model, input: { image_url: imageUrl, upscale_factor: String(f ?? 2) }, priceKey: route.model };
    case "recraft-upscale":
      return { model: route.model, input: { image: imageUrl }, priceKey: route.model };
    default:
      throw badRequest(`${model.name} on kie.ai has no route for this kind of run`);
  }
}

/** The upscaled clip keeps the source's length, read from the result (`duration: 0` until then). */
export function falUpscaleVideo(
  model: VideoModel, route: FalVideoRoute, req: { upscale?: number; resolution?: VideoResolution; creative?: boolean }, videoUrl: string | undefined,
): { endpoint: string; input: Record<string, unknown>; params: VideoParams } {
  const creative = creativeOn(model, req.creative);
  const endpoint = creative && route.upscaleCreative?.edit ? route.upscaleCreative.edit : route.edit;
  if (!endpoint) throw badRequest(`${model.name} is not available on fal`);
  if (!videoUrl) throw badRequest(`${model.name} needs a video to upscale`);
  const input: Record<string, unknown> = { ...route.extra, video_url: videoUrl };
  const params: VideoParams = { duration: 0 };
  // A creative mode on the same endpoint is a 0/1 field, sent either way.
  if (route.upscaleCreative?.field) input[route.upscaleCreative.field] = creative ? 1 : 0;
  if (creative) params.creative = true;
  if (route.upscale === "upscale_factor") {
    const f = upscaleFactor(model, req.upscale);
    if (f) {
      input.upscale_factor = f;
      params.upscale = f;
    }
  } else {
    const res = req.resolution && model.resolutions.includes(req.resolution) ? req.resolution : model.defaultResolution;
    const value = res ? route.resolutions?.[res] : undefined;
    if (!res || !value) throw badRequest(`${model.name} needs a target resolution`);
    input.target_resolution = value;
    params.resolution = res;
  }
  return { endpoint, input, params };
}

export function kieUpscaleVideo(
  model: VideoModel, route: KieVideoRoute, req: { upscale?: number; creative?: boolean }, videoUrl: string | undefined,
): { model: string; input: Record<string, unknown>; priceKey: string; params: VideoParams } {
  if (creativeOn(model, req.creative)) throw badRequest("Takes no creative upscale");
  if (route.family !== "topaz-video-upscale") throw badRequest(`${model.name} on kie.ai has no route for this kind of run`);
  if (!videoUrl) throw badRequest(`${model.name} needs a video to upscale`);
  const f = upscaleFactor(model, req.upscale) ?? 2;
  return { model: route.model, input: { video_url: videoUrl, upscale_factor: String(f) }, priceKey: route.model, params: { duration: 0, upscale: f } };
}

// ---------- prices ----------

/** The input's size, when known (it sets the output's, which some providers bill by). */
export interface UpscaleInput {
  width?: number;
  height?: number;
}

/** Megapixels out: the input's size times the scale on each side (undefined while the size is not known). */
function outputMp(input: UpscaleInput, f: number | undefined): number | undefined {
  if (!f || !input.width || !input.height) return undefined;
  return (input.width * f * input.height * f) / 1_000_000;
}

/** The output's short side, by which fal bills Topaz and FLUX video upscales. */
function outputShortSide(input: UpscaleInput, f: number | undefined): number | undefined {
  if (!f || !input.width || !input.height) return undefined;
  return Math.min(input.width, input.height) * f;
}

/**
 * USD for one upscaled image. Topaz on fal: $0.08 per started 24 MP of output (so the input's size is needed), or, in
 * its creative mode (Wonder 3), per started 8 MP. SeedVR2: $0.001 per megapixel of output. Topaz on kie.ai: 10 credits
 * at 2x, 20 at 4x (kie lists them as its 2K and 4K tiers). Recraft Crisp: $0.004 on fal, 0.5 credits on kie.
 */
export function upscaleImageUsd(provider: ProviderId, model: ImageModel, factor: number | undefined, input: UpscaleInput, creative?: boolean): number | undefined {
  const f = upscaleFactor(model, factor);
  if (provider === "fal") {
    if (model.fal?.upscale?.png) return 0.004;
    const mp = outputMp(input, f);
    if (mp === undefined) return undefined;
    if (model.id === SEEDVR_IMAGE) return 0.001 * mp;
    return 0.08 * Math.max(1, Math.ceil(mp / (creative ? 8 : 24)));
  }
  if (provider === "kie") {
    if (model.kie?.family === "recraft-upscale") return 0.5 * KIE_CREDIT_USD;
    if (model.kie?.family === "topaz-upscale") return (f === 4 ? 20 : 10) * KIE_CREDIT_USD;
  }
  return undefined;
}

/** fal's Topaz precision rates per second (30 fps), by the output's short side: up to 720p, up to 1080p, above (its 4K rate). */
function topazFalPerSecond(shortSide: number): number {
  return shortSide <= 720 ? 0.01 : shortSide <= 1080 ? 0.02 : 0.06;
}

/** fal's Topaz Starlight (the creative mode) per second at 30 fps: up to 1080p, above. */
function starlightFalPerSecond(shortSide: number): number {
  return shortSide <= 1080 ? 0.12 : 0.26;
}

/** fal's FLUX Video Upscale per second of output, by its short side (1080p, 2K, 4K tiers), precise or creative. */
function fluxFalPerSecond(shortSide: number, creative: boolean): number {
  const tier = shortSide <= 1080 ? 0 : shortSide <= 1440 ? 1 : 2;
  return (creative ? [0.12, 0.21, 0.474] : [0.084, 0.15, 0.33])[tier] ?? 0.33;
}

/** The catalog's ids for the upscalers priced here by name. */
export const SEEDVR_IMAGE = "bytedance/seedvr2-upscale";
export const SEEDVR_VIDEO = "bytedance/seedvr2-video-upscale";
export const FLUX_VIDEO_UPSCALE = "black-forest-labs/flux-video-upscale";

/** SeedVR2 bills each output frame's megapixels; the source's frame rate is not read, so 30 fps is assumed. */
const ASSUMED_FPS = 30;

/** ByteDance's standard tier at 30 fps, per second, by the target resolution. */
const BYTEDANCE_PER_SECOND: Partial<Record<VideoResolution, number>> = { "1080p": 0.0072, "2K": 0.0144, "4K": 0.0288 };

/**
 * USD for one upscaled clip of `seconds`. Topaz on fal: by the output's resolution (the source's short side times the
 * scale, so it needs the source's size); on kie.ai 8 credits a second up to 2x, 14 at 4x. ByteDance on fal: by the
 * target resolution. Undefined while the length (or a size it needs) is not known.
 */
export function upscaleVideoUsd(
  provider: ProviderId, model: VideoModel, req: { upscale?: number; resolution?: VideoResolution; creative?: boolean }, seconds: number | undefined, input: UpscaleInput,
): number | undefined {
  if (!seconds) return undefined;
  const f = upscaleFactor(model, req.upscale);
  const creative = Boolean(req.creative && model.caps.upscale?.creative);
  // OpenRouter's FLUX Video Upscale: 3.5 cents per output megapixel-second, 5 in the creative mode.
  if (provider === "openrouter") {
    const mp = outputMp(input, f);
    return mp === undefined ? undefined : (creative ? 0.05 : 0.035) * mp * seconds;
  }
  if (provider === "fal") {
    if (model.fal?.upscale === "target_resolution") {
      const res = req.resolution && model.resolutions.includes(req.resolution) ? req.resolution : model.defaultResolution;
      const rate = res ? BYTEDANCE_PER_SECOND[res] : undefined;
      return rate === undefined ? undefined : rate * seconds;
    }
    if (model.id === SEEDVR_VIDEO) {
      const mp = outputMp(input, f);
      return mp === undefined ? undefined : 0.001 * mp * ASSUMED_FPS * seconds;
    }
    const side = outputShortSide(input, f);
    if (side === undefined) return undefined;
    if (model.id === FLUX_VIDEO_UPSCALE) return fluxFalPerSecond(side, creative) * seconds;
    return (creative ? starlightFalPerSecond(side) : topazFalPerSecond(side)) * seconds;
  }
  if (provider === "kie" && model.kie?.family === "topaz-video-upscale") return (f === 4 ? 14 : 8) * KIE_CREDIT_USD * seconds;
  return undefined;
}
