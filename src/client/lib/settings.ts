/** The OpenRouter and fal keys and the provider choice, in this browser's localStorage. */
import type { ProviderId, SettingsResponse } from "@shared/types";
import { ApiClientError } from "./errors";
import { readJson, removeKey, writeJson } from "./storage";

export const KEY_STORAGE = "higgsfree.apiKey";
export const FAL_KEY_STORAGE = "higgsfree.falKey";
export const PROVIDER_STORAGE = "higgsfree.preferredProvider";
/** Survive "Reset local settings": losing a key or the provider choice is never what that button means. */
export const PROTECTED_STORAGE_KEYS: readonly string[] = [KEY_STORAGE, FAL_KEY_STORAGE, PROVIDER_STORAGE];

export function getStoredKey(): string | undefined {
  const key = readJson<string>(KEY_STORAGE, "").trim();
  return key || undefined;
}

export function setStoredKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) writeJson(KEY_STORAGE, trimmed);
  else removeKey(KEY_STORAGE);
}

export function getStoredFalKey(): string | undefined {
  const key = readJson<string>(FAL_KEY_STORAGE, "").trim();
  return key || undefined;
}

export function setStoredFalKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) writeJson(FAL_KEY_STORAGE, trimmed);
  else removeKey(FAL_KEY_STORAGE);
}

/** Which provider runs a model both offer. OpenRouter unless the user picked fal. */
export function getPreferredProvider(): ProviderId {
  return readJson<string>(PROVIDER_STORAGE, "openrouter") === "fal" ? "fal" : "openrouter";
}

export function setPreferredProvider(provider: ProviderId): void {
  writeJson(PROVIDER_STORAGE, provider);
}

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
  const key = getStoredKey();
  const falKey = getStoredFalKey();
  const res: SettingsResponse = { hasKey: Boolean(key), hasFalKey: Boolean(falKey), preferredProvider: getPreferredProvider() };
  if (key) res.keyMasked = maskKey(key);
  if (falKey) res.falKeyMasked = maskKey(falKey);
  return res;
}
