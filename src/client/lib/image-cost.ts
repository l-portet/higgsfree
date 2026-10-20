/**
 * What an image costs on each provider that offers its model, and who runs it: the preferred provider
 * (Settings) among those with a key that can take the request, otherwise the first of them. The composer
 * shows the price of the one that runs it; the engine routes the run with the same rule.
 */
import type { ImageAspectRatio, ImageModel, ImageSize, ProviderId } from "@shared/types";
import { estimateImageCost } from "@shared/models";
import { buildApimartImagePayload } from "./apimart-payloads";
import { estimateApimartImageCost } from "./apimart-pricing";
import { buildFalImagePayload } from "./fal-payloads";
import { estimateFalImageCost } from "./fal-pricing";
import { buildKieImagePayload } from "./kie-payloads";
import { estimateKieImageCost } from "./kie-pricing";
import { modelProviders, type ProviderKeys } from "./providers";
import type { ProviderQuote } from "./video-cost";

export interface ImageQuoteRequest {
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
  count: number;
  /** How many reference images are attached. */
  references: number;
}

export interface ImageQuote {
  /** One per provider that offers the model, OpenRouter first; `usd` is for the whole batch. */
  quotes: ProviderQuote[];
  /** Who runs it; undefined when no provider that takes the request has a key. */
  provider?: ProviderId;
}

function refusal(build: () => unknown): string | undefined {
  try {
    build();
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function priceOn(provider: ProviderId, model: ImageModel, req: ImageQuoteRequest): Pick<ProviderQuote, "usd" | "refusal"> {
  const withRefs = req.references > 0;
  const refs = Array.from({ length: req.references }, () => "https://ref");
  const usd = (v: number | undefined): Pick<ProviderQuote, "usd"> => (v === undefined ? {} : { usd: v });
  switch (provider) {
    case "openrouter":
      return usd(estimateImageCost(model, req.size, req.count));
    case "fal": {
      const why = refusal(() => buildFalImagePayload(model, { prompt: "", aspectRatio: req.aspectRatio, size: req.size }, refs));
      return why ? { refusal: why } : usd(estimateFalImageCost(model, req, req.count, withRefs));
    }
    case "kie": {
      const why = refusal(() => buildKieImagePayload(model, { prompt: "", aspectRatio: req.aspectRatio, size: req.size }, refs));
      return why ? { refusal: why } : usd(estimateKieImageCost(model, req, req.count, withRefs));
    }
    case "apimart": {
      const why = refusal(() => buildApimartImagePayload(model, { prompt: "", aspectRatio: req.aspectRatio, size: req.size }, refs));
      return why ? { refusal: why } : usd(estimateApimartImageCost(model, req, req.count, withRefs));
    }
  }
}

export function quoteImage(model: ImageModel, req: ImageQuoteRequest, keys: ProviderKeys, preferred: ProviderId): ImageQuote {
  const quotes = modelProviders(model).map((provider): ProviderQuote => ({ provider, noKey: !keys[provider], ...priceOn(provider, model, req) }));
  const ready = quotes.filter((q) => !q.noKey && !q.refusal);
  const provider = ready.some((q) => q.provider === preferred) ? preferred : ready[0]?.provider;
  return provider ? { quotes, provider } : { quotes };
}
