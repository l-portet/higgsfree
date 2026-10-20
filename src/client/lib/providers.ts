/**
 * Which provider runs a model: OpenRouter, fal, kie.ai, or several. An image goes to the preferred one
 * (OpenRouter unless Settings say otherwise) among those with a key; a video to the cheapest
 * (`video-cost.ts`). A model whose providers have no key cannot run; the composer says why.
 */
import type { CatalogModel, ProviderId } from "@shared/types";

/** Every provider, in the order they are listed (OpenRouter first). */
export const PROVIDER_IDS: readonly ProviderId[] = ["openrouter", "fal", "kie"];

export const PROVIDER_NAME: Record<ProviderId, string> = { openrouter: "OpenRouter", fal: "fal", kie: "kie.ai" };

/** Where to get a key, the host it is sent to, and what one looks like. */
export const PROVIDER_KEYS: Record<ProviderId, { url: string; host: string; placeholder: string }> = {
  openrouter: { url: "https://openrouter.ai/keys", host: "openrouter.ai", placeholder: "sk-or-v1-…" },
  fal: { url: "https://fal.ai/dashboard/keys", host: "fal.ai", placeholder: "key-id:key-secret" },
  kie: { url: "https://kie.ai/api-key", host: "kie.ai", placeholder: "Your kie.ai API key" },
};

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}

/** Which providers have a key stored. */
export type ProviderKeys = Partial<Record<ProviderId, boolean>>;

/** Providers that serve the model, OpenRouter first. */
export function modelProviders(m: Pick<CatalogModel, "fal" | "kie" | "offOpenRouter">): ProviderId[] {
  const out: ProviderId[] = [];
  if (!m.offOpenRouter) out.push("openrouter");
  if (m.fal) out.push("fal");
  if (m.kie) out.push("kie");
  return out;
}

export interface ProviderChoice {
  /** Who runs it; undefined when no provider of the model has a key. */
  provider?: ProviderId;
  /** The providers that could run it if their key were added (set when `provider` is undefined). */
  missing: ProviderId[];
}

type Routed = Pick<CatalogModel, "fal" | "kie" | "offOpenRouter">;

export function chooseProvider(m: Routed, keys: ProviderKeys, preferred: ProviderId): ProviderChoice {
  const offered = modelProviders(m);
  const usable = offered.filter((p) => keys[p]);
  if (usable.length === 0) return { missing: offered };
  return { provider: usable.includes(preferred) ? preferred : usable[0], missing: [] };
}

/**
 * The key to ask for when Generate is pressed and the model cannot run: OpenRouter when it serves
 * the model (the default provider), otherwise the first that does. Undefined when the model can run.
 */
export function keyToAsk(m: Routed, keys: ProviderKeys, preferred: ProviderId): ProviderId | undefined {
  const { provider, missing } = chooseProvider(m, keys, preferred);
  if (provider) return undefined;
  return missing.includes("openrouter") ? "openrouter" : missing[0];
}

/** "fal, kie.ai" → "a fal or kie.ai key": the article follows the first name. */
function keyPhrase(providers: ProviderId[]): string {
  const names = providers.map((p) => PROVIDER_NAME[p]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : (names[0] ?? "");
  return `${/^[aeiou]/i.test(list) ? "an" : "a"} ${list} key`;
}

/** "Kling 3.0 Motion Control runs on fal. Add a fal key in Settings to use it." (undefined when the model can run). */
export function providerNotice(m: Pick<CatalogModel, "name"> & Routed, keys: ProviderKeys, preferred: ProviderId): string | undefined {
  const { provider, missing } = chooseProvider(m, keys, preferred);
  if (provider) return undefined;
  if (missing.length === 1 && missing[0]) return `${m.name} runs on ${PROVIDER_NAME[missing[0]]}. Add ${keyPhrase(missing)} in Settings to use it.`;
  return `${m.name} needs ${keyPhrase(missing)}. Add one in Settings to use it.`;
}
