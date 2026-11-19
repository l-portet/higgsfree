/**
 * What a video costs on each provider that offers its model, and who runs it: the cheapest of OpenRouter,
 * fal, kie.ai, APIMart, Revana, ByteDance and Replicate that can take the request (`routeQuotes`, the same rule as images). The composer shows the
 * comparison next to Generate and the engine routes the run with the same rule, so the two always agree.
 */
import type { ProviderId, VideoAspectRatio, VideoModel, VideoResolution } from "@shared/types";
import { editedLength, estimateVideoCost, snapDuration } from "@shared/models";
import { estimateFalVideoCost, falVideoPayloadFor } from "./fal-pricing";
import { apimartVideoPayloadFor, estimateApimartVideoCost } from "./apimart-pricing";
import { bytedanceVideoPayloadFor, estimateBytedanceVideoCost } from "./bytedance-pricing";
import { estimateKieVideoCost, kieVideoPayloadFor } from "./kie-pricing";
import { modelProviders, type ProviderKeys } from "./providers";
import { estimateReplicateVideoCost, replicateVideoPayloadFor } from "./replicate-pricing";
import { upscaleVideoUsd } from "./upscale";
import { estimateRevanaVideoCost, revanaVideoPayloadFor } from "./revana-pricing";

/** The parts of a video request that set its price, or whether a provider takes it. */
export interface VideoQuoteRequest {
  /** Some providers refuse an empty or very short prompt. */
  prompt?: string;
  duration: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  audio?: boolean;
  firstFrame?: boolean;
  lastFrame?: boolean;
  /** Style references are attached: fal takes none. */
  references?: boolean;
  /** Reference videos / audio are attached: only kie.ai takes them (as uploaded files). */
  referenceVideos?: boolean;
  referenceAudios?: boolean;
  /** How long the reference videos run together, when known: they are billed too. */
  referenceVideoSec?: number;
  /** Motion control and video editing: the input video's length, which sets the clip's. Unknown: no price. */
  videoSec?: number;
  /** Upscalers: the scale, and the input video's size when known (fal's Topaz bills by the output's). */
  upscale?: number;
  /** Upscalers with a creative mode: it is on. */
  creative?: boolean;
  videoWidth?: number;
  videoHeight?: number;
}

export interface ProviderQuote {
  provider: ProviderId;
  /** USD for one clip; undefined while it is not known. */
  usd?: number;
  /** No key is stored for this provider. */
  noKey: boolean;
  /** Why this provider cannot take the request as it is ("Takes no style references"). */
  refusal?: string;
}

/**
 * Why the run goes where it goes. `only`: one provider offers the model. `cheaper`: several could run it,
 * this one costs least. `tie` / `unpriced`: several could, at the same lowest price or with no price
 * known, so the first in the catalog's order (OpenRouter, fal, kie.ai, APIMart) runs it. `one-ready`: the
 * others have no key or refuse the request. `none`: no provider that takes the request has a key.
 */
export type QuoteReason = "only" | "cheaper" | "tie" | "unpriced" | "one-ready" | "none";

export interface VideoQuote {
  /** One per provider that offers the model, OpenRouter first. */
  quotes: ProviderQuote[];
  /** Who runs it; undefined when no provider that takes the request has a key. */
  provider?: ProviderId;
  reason: QuoteReason;
  /** Set by `pinQuote`: `provider` was picked by hand rather than by price. */
  picked?: boolean;
}

/** Prices closer than half a cent are the same price (the providers round differently). */
export const SAME_PRICE_USD = 0.005;

function openRouterUsd(model: VideoModel, req: VideoQuoteRequest): number | undefined {
  if (model.caps.upscale) return upscaleVideoUsd("openrouter", model, req, req.videoSec, { width: req.videoWidth, height: req.videoHeight });
  if (model.caps.videoEdit) return req.videoSec === undefined ? undefined : estimateVideoCost(model, editedLength(model, req.videoSec), req.resolution);
  return estimateVideoCost(model, snapDuration(model, req.duration), req.resolution, req.audio);
}

/** A provider's price, or why it cannot take the request: what its payload builder throws. */
function quoted(check: () => unknown, price: () => number | undefined): Pick<ProviderQuote, "usd" | "refusal"> {
  try {
    check();
  } catch (err) {
    return { refusal: err instanceof Error ? err.message : String(err) };
  }
  const usd = price();
  return usd === undefined ? {} : { usd };
}

function priceOn(provider: ProviderId, model: VideoModel, req: VideoQuoteRequest, now: Date): Pick<ProviderQuote, "usd" | "refusal"> {
  switch (provider) {
    case "openrouter":
      if (req.referenceVideos || req.referenceAudios) return { refusal: "Takes no reference video or audio" };
      return { usd: openRouterUsd(model, req) };
    case "fal":
      if (req.referenceVideos || req.referenceAudios) return { refusal: "Takes no reference video or audio" };
      if (req.references) return { refusal: "Takes no style references" };
      return quoted(() => falVideoPayloadFor(model, req), () => estimateFalVideoCost(model, req, now));
    case "kie":
      return quoted(() => kieVideoPayloadFor(model, req), () => estimateKieVideoCost(model, req));
    case "apimart":
      return quoted(() => apimartVideoPayloadFor(model, req), () => estimateApimartVideoCost(model, req));
    case "revana":
      return quoted(() => revanaVideoPayloadFor(model, req), () => estimateRevanaVideoCost(model, req));
    case "bytedance":
      return quoted(() => bytedanceVideoPayloadFor(model, req), () => estimateBytedanceVideoCost(model, req));
    case "replicate":
      return quoted(() => replicateVideoPayloadFor(model, req), () => estimateReplicateVideoCost(model, req));
  }
}

/**
 * Who runs a request, from each provider's quote (images and videos alike): the cheapest that has a key and takes it.
 * A tie, or no price known, goes to the first in the catalog's order. The composer's pick overrides it (`pinQuote`).
 */
export function routeQuotes(quotes: ProviderQuote[]): { provider?: ProviderId; reason: QuoteReason } {
  const ready = quotes.filter((q) => !q.noKey && !q.refusal);
  const first = ready[0];
  if (!first) return { reason: "none" };
  if (quotes.length === 1) return { provider: first.provider, reason: "only" };
  if (ready.length === 1) return { provider: first.provider, reason: "one-ready" };
  const priced = ready.filter((q) => q.usd !== undefined);
  if (priced.length === 0) return { provider: first.provider, reason: "unpriced" };
  const low = Math.min(...priced.map((q) => q.usd ?? Infinity));
  const cheapest = priced.filter((q) => (q.usd ?? Infinity) - low < SAME_PRICE_USD);
  return { provider: cheapest[0]?.provider, reason: cheapest.length > 1 ? "tie" : "cheaper" };
}

/** Each provider's price for one clip of `req`, and who runs it. `now` picks fal's promotional rates. */
export function quoteVideo(model: VideoModel, req: VideoQuoteRequest, keys: ProviderKeys, now = new Date()): VideoQuote {
  const quotes = modelProviders(model).map((provider): ProviderQuote => ({ provider, noKey: !keys[provider], ...priceOn(provider, model, req, now) }));
  const { provider, reason } = routeQuotes(quotes);
  return provider ? { quotes, provider, reason } : { quotes, reason };
}

/**
 * A provider picked by hand in the composer runs it when it has a key and takes the request; otherwise the
 * automatic choice stands (`picked` stays unset). Images and videos alike: the composer and the engine both apply it.
 */
export function pinQuote<Q extends { quotes: ProviderQuote[]; provider?: ProviderId; picked?: boolean }>(q: Q, pinned: ProviderId | undefined): Q {
  const ok = pinned !== undefined && q.quotes.some((x) => x.provider === pinned && !x.noKey && !x.refusal);
  return ok ? { ...q, provider: pinned, picked: true } : q;
}

/** The quote shown next to Generate: the provider that runs it, or (no key yet) the cheapest one that takes the request. */
export function shownQuote(q: { quotes: ProviderQuote[]; provider?: ProviderId }): ProviderQuote | undefined {
  if (q.provider) return q.quotes.find((x) => x.provider === q.provider);
  const takers = q.quotes.filter((x) => !x.refusal);
  const priced = takers.filter((x) => x.usd !== undefined).sort((x, y) => (x.usd ?? 0) - (y.usd ?? 0));
  return priced[0] ?? takers[0];
}
