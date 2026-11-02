/** Each provider's key, in this browser's localStorage. */
import type { ProviderId, SettingsResponse } from "@shared/types";
import { ApiClientError } from "./errors";
import { PROVIDER_IDS } from "./providers";
import { readJson, removeKey, writeJson } from "./storage";

export const KEY_STORAGE = "higgsfree.apiKey";
export const FAL_KEY_STORAGE = "higgsfree.falKey";
/** Where each provider's key is kept (OpenRouter's and fal's names predate the others). */
export const KEY_STORAGE_BY_PROVIDER: Record<ProviderId, string> = {
  openrouter: KEY_STORAGE,
  fal: FAL_KEY_STORAGE,
  kie: "higgsfree.kieKey",
  apimart: "higgsfree.apimartKey",
  revana: "higgsfree.revanaKey",
};
/** Survive "Reset local settings": losing a key is never what that button means. */
export const PROTECTED_STORAGE_KEYS: readonly string[] = Object.values(KEY_STORAGE_BY_PROVIDER);

export function getProviderKey(provider: ProviderId): string | undefined {
  const key = readJson<string>(KEY_STORAGE_BY_PROVIDER[provider], "").trim();
  return key || undefined;
}

/** Store a provider's key, or remove it with `""`. */
export function setProviderKey(provider: ProviderId, key: string): void {
  const trimmed = key.trim();
  if (trimmed) writeJson(KEY_STORAGE_BY_PROVIDER[provider], trimmed);
  else removeKey(KEY_STORAGE_BY_PROVIDER[provider]);
}

export const getStoredKey = (): string | undefined => getProviderKey("openrouter");
export const setStoredKey = (key: string): void => setProviderKey("openrouter", key);
export const getStoredFalKey = (): string | undefined => getProviderKey("fal");
export const setStoredFalKey = (key: string): void => setProviderKey("fal", key);

export function requireApiKey(): string {
  const key = getStoredKey();
  if (!key) throw new ApiClientError(401, "No OpenRouter key configured. Add one in Settings.");
  return key;
}

/** `sk-or-v1-…a1b2`: first 9 chars + last 4. */
export function maskKey(key: string): string {
  if (key.length <= 13) return `${key.slice(0, 2)}…`;
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

export function settingsResponse(): SettingsResponse {
  const keys: SettingsResponse["keys"] = {};
  for (const p of PROVIDER_IDS) {
    const key = getProviderKey(p);
    if (key) keys[p] = maskKey(key);
  }
  const res: SettingsResponse = { hasKey: Boolean(keys.openrouter), keys };
  if (keys.openrouter) res.keyMasked = keys.openrouter;
  return res;
}
