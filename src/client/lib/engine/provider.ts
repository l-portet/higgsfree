/** Pick the provider for a run from the stored keys, the price (videos) and the preference, or explain why there is none. */
import type { CatalogModel, ProviderId, VideoModel } from "@shared/types";
import { ApiClientError } from "../errors";
import { chooseProvider, providerNotice } from "../providers";
import { getPreferredProvider, getStoredFalKey, getStoredKey } from "../settings";
import { quoteVideo, type VideoQuoteRequest } from "../video-cost";

export function keyFor(provider: ProviderId): string | undefined {
  return provider === "fal" ? getStoredFalKey() : getStoredKey();
}

export function storedKeys(): { openrouter: boolean; fal: boolean } {
  return { openrouter: Boolean(getStoredKey()), fal: Boolean(getStoredFalKey()) };
}

export interface ProviderRun {
  provider: ProviderId;
  key: string;
}

/** 401 with a message the composer can show when no provider of the model has a key. */
export function resolveRun(model: Pick<CatalogModel, "name" | "fal" | "falOnly">): ProviderRun {
  const keys = storedKeys();
  const preferred = getPreferredProvider();
  const { provider } = chooseProvider(model, keys, preferred);
  if (!provider) {
    if (!keys.openrouter && !keys.fal && !model.falOnly) throw new ApiClientError(401, "No OpenRouter key configured. Add one in Settings.");
    throw new ApiClientError(401, providerNotice(model, keys, preferred) ?? "No key for this model. Add one in Settings.");
  }
  const key = keyFor(provider);
  if (!key) throw new ApiClientError(401, "No key configured. Add one in Settings.");
  return { provider, key };
}

/**
 * A video goes to the cheaper provider that takes the request (`quoteVideo`). Undefined when none with a
 * key takes it: the caller keeps `resolveRun`'s choice, whose errors say why.
 */
export function videoRun(model: VideoModel, req: VideoQuoteRequest): ProviderRun | undefined {
  const { provider } = quoteVideo(model, req, storedKeys(), getPreferredProvider());
  const key = provider ? keyFor(provider) : undefined;
  return provider && key ? { provider, key } : undefined;
}
