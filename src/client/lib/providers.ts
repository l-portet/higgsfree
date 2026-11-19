/**
 * Which provider runs a model: OpenRouter, fal, kie.ai, APIMart, Revana, ByteDance, Replicate, or several. A run goes to the cheapest with a key
 * that takes it (`routeQuotes` in `video-cost.ts`), or to the one picked in the composer. A model whose providers have
 * no key cannot run; the composer says why.
 */
import type { CatalogModel, ProviderId, VideoModel } from "@shared/types";

/** Every provider, in the order they are listed (OpenRouter first). */
export const PROVIDER_IDS: readonly ProviderId[] = ["openrouter", "fal", "kie", "apimart", "revana", "bytedance", "replicate"];

export const PROVIDER_NAME: Record<ProviderId, string> = { openrouter: "OpenRouter", fal: "fal", kie: "kie.ai", apimart: "APIMart", revana: "Revana", bytedance: "ByteDance", replicate: "Replicate" };

/** Where to get a key, the host it is sent to, and what one looks like. */
export const PROVIDER_KEYS: Record<ProviderId, { url: string; host: string; placeholder: string }> = {
  openrouter: { url: "https://openrouter.ai/keys", host: "openrouter.ai", placeholder: "sk-or-v1-…" },
  fal: { url: "https://fal.ai/dashboard/keys", host: "fal.ai", placeholder: "key-id:key-secret" },
  kie: { url: "https://kie.ai/api-key", host: "kie.ai", placeholder: "Your kie.ai API key" },
  apimart: { url: "https://apimart.ai/keys", host: "apimart.ai", placeholder: "sk-…" },
  revana: { url: "https://revana.si/signup", host: "api.revana.si", placeholder: "sr_live_…" },
  // BytePlus ModelArk, ByteDance's own platform; each model must also be activated there (`BYTEDANCE_ACTIVATE_URL`).
  bytedance: { url: "https://ai.byteplus.com/ark/region:ap-southeast-1/apikey", host: "ark.ap-southeast.bytepluses.com", placeholder: "Your ModelArk API key" },
  replicate: { url: "https://replicate.com/account/api-tokens", host: "api.replicate.com", placeholder: "r8_…" },
};

/**
 * Shown next to the key field of a provider whose key goes through this site's server instead of straight from the
 * browser: ByteDance and Replicate, whose APIs block browser calls (`src/server/bytedance-proxy.ts` and
 * `replicate-proxy.ts` forward each call and keep nothing). Every other key is only ever sent from the browser to its
 * provider.
 */
export const KEY_VIA_SERVER: Partial<Record<ProviderId, string>> = {
  bytedance:
    "Unlike the other providers, your ByteDance key is sent to the higgsfree server so it can call ByteDance's API (it blocks direct browser calls). It is only used to forward your request and is never stored or logged.",
  replicate:
    "Like ByteDance's, your Replicate key is sent to the higgsfree server so it can call Replicate's API (it blocks direct browser calls). It is only used to forward your request and is never stored or logged.",
};

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}

/** Which providers have a key stored. */
export type ProviderKeys = Partial<Record<ProviderId, boolean>>;

/** The fields that say who serves a model (ByteDance serves videos only). */
export type ModelRoutes = Pick<CatalogModel, "fal" | "kie" | "apimart" | "revana" | "replicate" | "offOpenRouter"> & Pick<VideoModel, "bytedance">;

/** Providers that serve the model, OpenRouter first. */
export function modelProviders(m: ModelRoutes): ProviderId[] {
  const out: ProviderId[] = [];
  if (!m.offOpenRouter) out.push("openrouter");
  if (m.fal) out.push("fal");
  if (m.kie) out.push("kie");
  if (m.apimart) out.push("apimart");
  if (m.revana) out.push("revana");
  if (m.bytedance) out.push("bytedance");
  if (m.replicate) out.push("replicate");
  return out;
}

export interface ProviderChoice {
  /** Who runs it; undefined when no provider of the model has a key. */
  provider?: ProviderId;
  /** The providers that could run it if their key were added (set when `provider` is undefined). */
  missing: ProviderId[];
}

/** The first provider of the model with a key (before prices are known), or the ones whose key would let it run. */
export function chooseProvider(m: ModelRoutes, keys: ProviderKeys): ProviderChoice {
  const offered = modelProviders(m);
  const usable = offered.filter((p) => keys[p]);
  if (usable.length === 0) return { missing: offered };
  return { provider: usable[0], missing: [] };
}

/**
 * The key to ask for when Generate is pressed and the model cannot run: OpenRouter when it serves
 * the model (the default provider), otherwise the first that does. Undefined when the model can run.
 */
export function keyToAsk(m: ModelRoutes, keys: ProviderKeys): ProviderId | undefined {
  const { provider, missing } = chooseProvider(m, keys);
  if (provider) return undefined;
  return missing.includes("openrouter") ? "openrouter" : missing[0];
}

/** "fal, kie.ai" → "a fal or kie.ai key": the article follows the first name. */
export function keyPhrase(providers: ProviderId[]): string {
  const names = providers.map((p) => PROVIDER_NAME[p]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : (names[0] ?? "");
  return `${/^[aeiou]/i.test(list) ? "an" : "a"} ${list} key`;
}

/** "Kling 3.0 Motion Control runs on fal. Add a fal key in Settings to use it." (undefined when the model can run). */
export function providerNotice(m: Pick<CatalogModel, "name"> & ModelRoutes, keys: ProviderKeys): string | undefined {
  const { provider, missing } = chooseProvider(m, keys);
  if (provider) return undefined;
  if (missing.length === 1 && missing[0]) return `${m.name} runs on ${PROVIDER_NAME[missing[0]]}. Add ${keyPhrase(missing)} in Settings to use it.`;
  return `${m.name} needs ${keyPhrase(missing)}. Add one in Settings to use it.`;
}
