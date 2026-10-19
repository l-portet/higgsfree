/**
 * What a video costs on each provider that offers its model, and who runs it: the cheaper of OpenRouter
 * and fal when both can take the request. The preference in Settings breaks a tie, and decides while a
 * price is not known (an edit before its video's length is). The composer shows the comparison next to
 * Generate and the engine routes the run with the same rule, so the two always agree.
 */
import type { ProviderId, VideoAspectRatio, VideoModel, VideoResolution } from "@shared/types";
import { editedLength, estimateVideoCost, snapDuration } from "@shared/models";
import { estimateFalVideoCost, falVideoPayloadFor } from "./fal-pricing";
import { modelProviders, type ProviderKeys } from "./providers";

/** The parts of a video request that set its price, or whether a provider takes it. */
export interface VideoQuoteRequest {
  duration: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  audio?: boolean;
  firstFrame?: boolean;
  lastFrame?: boolean;
  /** Style references are attached: fal takes none. */
  references?: boolean;
  /** Motion control and video editing: the input video's length, which sets the clip's. Unknown: no price. */
  videoSec?: number;
}

export interface ProviderQuote {
  provider: ProviderId;
  /** USD for one clip; undefined while it is not known. */
  usd?: number;
  /** No key is stored for this provider. */
  noKey: boolean;
  /** Why this provider cannot take the request as it is (fal and style references). */
  refusal?: string;
}

/**
 * Why the run goes where it goes. `only`: one provider offers the model. `cheaper`: both could run it,
 * this one costs less. `tie` / `unpriced`: both could, at the same price or with a price unknown, so the
 * preference decides. `one-ready`: the other has no key or refuses the request. `none`: no provider that
 * takes the request has a key.
 */
export type QuoteReason = "only" | "cheaper" | "tie" | "unpriced" | "one-ready" | "none";

export interface VideoQuote {
  /** One per provider that offers the model, OpenRouter first. */
  quotes: ProviderQuote[];
  /** Who runs it; undefined when no provider that takes the request has a key. */
  provider?: ProviderId;
  reason: QuoteReason;
}

/** Prices closer than half a cent are the same price (the providers round differently). */
const SAME_PRICE_USD = 0.005;

function openRouterUsd(model: VideoModel, req: VideoQuoteRequest): number | undefined {
  if (model.caps.videoEdit) return req.videoSec === undefined ? undefined : estimateVideoCost(model, editedLength(model, req.videoSec), req.resolution);
  return estimateVideoCost(model, snapDuration(model, req.duration), req.resolution, req.audio);
}

function falQuote(model: VideoModel, req: VideoQuoteRequest, now: Date): Pick<ProviderQuote, "usd" | "refusal"> {
  if (req.references) return { refusal: "Takes no style references" };
  try {
    falVideoPayloadFor(model, req);
  } catch (err) {
    return { refusal: err instanceof Error ? err.message : String(err) };
  }
  const usd = estimateFalVideoCost(model, req, now);
  return usd === undefined ? {} : { usd };
}

/** Each provider's price for one clip of `req`, and who runs it. `now` picks fal's promotional rates. */
export function quoteVideo(model: VideoModel, req: VideoQuoteRequest, keys: ProviderKeys, preferred: ProviderId, now = new Date()): VideoQuote {
  const quotes = modelProviders(model).map((provider): ProviderQuote => {
    const priced = provider === "fal" ? falQuote(model, req, now) : { usd: openRouterUsd(model, req) };
    return { provider, noKey: !keys[provider], ...priced };
  });
  const ready = quotes.filter((q) => !q.noKey && !q.refusal);
  const [a, b] = ready;
  if (!a) return { quotes, reason: "none" };
  if (quotes.length === 1) return { quotes, provider: a.provider, reason: "only" };
  if (!b) return { quotes, provider: a.provider, reason: "one-ready" };
  if (a.usd === undefined || b.usd === undefined) return { quotes, provider: preferred, reason: "unpriced" };
  if (Math.abs(a.usd - b.usd) < SAME_PRICE_USD) return { quotes, provider: preferred, reason: "tie" };
  return { quotes, provider: a.usd < b.usd ? a.provider : b.provider, reason: "cheaper" };
}

/** The quote shown next to Generate: the provider that runs it, or (no key yet) the cheapest one that takes the request. */
export function shownQuote(q: VideoQuote): ProviderQuote | undefined {
  if (q.provider) return q.quotes.find((x) => x.provider === q.provider);
  const takers = q.quotes.filter((x) => !x.refusal);
  const priced = takers.filter((x) => x.usd !== undefined).sort((x, y) => (x.usd ?? 0) - (y.usd ?? 0));
  return priced[0] ?? takers[0];
}
