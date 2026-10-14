/**
 * Which provider runs a model: OpenRouter, fal, or both. A model both offer goes to the
 * preferred one (OpenRouter unless Settings say fal) when both keys are set, otherwise to
 * whichever has a key. A model whose provider has no key cannot run; the composer says why.
 */
import type { CatalogModel, ProviderId } from "@shared/types";

export const PROVIDER_NAME: Record<ProviderId, string> = { openrouter: "OpenRouter", fal: "fal" };

export interface ProviderKeys {
  openrouter: boolean;
  fal: boolean;
}

/** Providers that serve the model, OpenRouter first. */
export function modelProviders(m: Pick<CatalogModel, "fal" | "falOnly">): ProviderId[] {
  const out: ProviderId[] = [];
  if (!m.falOnly) out.push("openrouter");
  if (m.fal || m.falOnly) out.push("fal");
  return out;
}

export interface ProviderChoice {
  /** Who runs it; undefined when no provider of the model has a key. */
  provider?: ProviderId;
  /** The providers that could run it if their key were added (set when `provider` is undefined). */
  missing: ProviderId[];
}

export function chooseProvider(m: Pick<CatalogModel, "fal" | "falOnly">, keys: ProviderKeys, preferred: ProviderId): ProviderChoice {
  const offered = modelProviders(m);
  const usable = offered.filter((p) => keys[p]);
  if (usable.length === 0) return { missing: offered };
  if (usable.length === 1) return { provider: usable[0], missing: [] };
  return { provider: usable.includes(preferred) ? preferred : usable[0], missing: [] };
}

/**
 * The key to ask for when Generate is pressed and the model cannot run: its only provider, or
 * OpenRouter for a model both offer (the default provider). Undefined when the model can run.
 */
export function keyToAsk(m: Pick<CatalogModel, "fal" | "falOnly">, keys: ProviderKeys, preferred: ProviderId): ProviderId | undefined {
  const { provider, missing } = chooseProvider(m, keys, preferred);
  if (provider) return undefined;
  return missing.includes("openrouter") ? "openrouter" : missing[0];
}

/** "Kling 3.0 Motion Control runs on fal. Add a fal key in Settings to use it." (undefined when the model can run). */
export function providerNotice(m: Pick<CatalogModel, "name" | "fal" | "falOnly">, keys: ProviderKeys, preferred: ProviderId): string | undefined {
  const { provider, missing } = chooseProvider(m, keys, preferred);
  if (provider) return undefined;
  if (missing.length === 1 && missing[0]) {
    const p = PROVIDER_NAME[missing[0]];
    const article = /^[aeiou]/i.test(p) ? "an" : "a";
    return `${m.name} runs on ${p}. Add ${article} ${p} key in Settings to use it.`;
  }
  return `${m.name} needs an OpenRouter or fal key. Add one in Settings to use it.`;
}
