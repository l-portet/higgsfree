/** The OpenRouter key and the default models, in this browser's localStorage. */
import type { SettingsResponse } from "@shared/types";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@shared/models";
import { ApiClientError } from "./errors";
import { readJson, removeKey, writeJson } from "./storage";

export const KEY_STORAGE = "higgsfree.apiKey";
export const DEFAULTS_STORAGE = "higgsfree.defaults";
/** Survive "Reset local settings": losing the key or the defaults is never what that button means. */
export const PROTECTED_STORAGE_KEYS: readonly string[] = [KEY_STORAGE, DEFAULTS_STORAGE];

export function getStoredKey(): string | undefined {
  const key = readJson<string>(KEY_STORAGE, "").trim();
  return key || undefined;
}

export function setStoredKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) writeJson(KEY_STORAGE, trimmed);
  else removeKey(KEY_STORAGE);
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

export function getDefaults(): SettingsResponse["defaults"] {
  const p = readJson<Record<string, unknown>>(DEFAULTS_STORAGE, {});
  return {
    imageModel: typeof p.imageModel === "string" && p.imageModel ? p.imageModel : DEFAULT_IMAGE_MODEL,
    videoModel: typeof p.videoModel === "string" && p.videoModel ? p.videoModel : DEFAULT_VIDEO_MODEL,
  };
}

export function setDefaults(d: Partial<SettingsResponse["defaults"]>): void {
  const next = { ...getDefaults() };
  if (d.imageModel) next.imageModel = d.imageModel;
  if (d.videoModel) next.videoModel = d.videoModel;
  writeJson(DEFAULTS_STORAGE, next);
}

export function settingsResponse(): SettingsResponse {
  const key = getStoredKey();
  const res: SettingsResponse = { hasKey: Boolean(key), defaults: getDefaults() };
  if (key) res.keyMasked = maskKey(key);
  return res;
}
