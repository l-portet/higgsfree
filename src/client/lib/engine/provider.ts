/** Pick the provider for a run from the stored keys and the preference, or explain why there is none. */
import type { CatalogModel, ProviderId } from "@shared/types";
import { ApiClientError } from "../errors";
import { chooseProvider, providerNotice } from "../providers";
import { getPreferredProvider, getStoredFalKey, getStoredKey } from "../settings";

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
