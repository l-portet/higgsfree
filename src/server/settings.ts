/** API-key resolution (env wins over DB) and user defaults. */
import type { SettingsResponse } from "../shared/types.ts";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "../shared/models.ts";
import { config } from "./config.ts";
import { HttpError } from "./errors.ts";
import { storageLocation } from "./media.ts";
import { deleteSetting, getSetting, setSetting } from "./repo.ts";

export const SETTING_API_KEY = "openrouter_api_key";
export const SETTING_IMAGE_MODEL = "default_image_model";
export const SETTING_VIDEO_MODEL = "default_video_model";

export interface ResolvedKey {
  key?: string;
  source: SettingsResponse["keySource"];
}

export async function resolveApiKey(): Promise<ResolvedKey> {
  if (config.envApiKey) return { key: config.envApiKey, source: "env" };
  const stored = (await getSetting(SETTING_API_KEY))?.trim();
  if (stored) return { key: stored, source: "db" };
  return { source: null };
}

export async function requireApiKey(): Promise<string> {
  const { key } = await resolveApiKey();
  if (!key) throw new HttpError(401, "No OpenRouter key configured. Add one in Settings or set OPENROUTER_API_KEY.");
  return key;
}

/** `sk-or-v1-…a1b2`: first 9 chars + last 4. */
export function maskKey(key: string): string {
  if (key.length <= 13) return `${key.slice(0, 2)}…`;
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

export async function setStoredApiKey(key: string): Promise<void> {
  if (key.trim()) await setSetting(SETTING_API_KEY, key.trim());
  else await deleteSetting(SETTING_API_KEY);
}

export async function getDefaults(): Promise<SettingsResponse["defaults"]> {
  const [imageModel, videoModel] = await Promise.all([getSetting(SETTING_IMAGE_MODEL), getSetting(SETTING_VIDEO_MODEL)]);
  return { imageModel: imageModel ?? DEFAULT_IMAGE_MODEL, videoModel: videoModel ?? DEFAULT_VIDEO_MODEL };
}

export async function setDefaults(d: { imageModel?: string; videoModel?: string }): Promise<void> {
  if (d.imageModel) await setSetting(SETTING_IMAGE_MODEL, d.imageModel);
  if (d.videoModel) await setSetting(SETTING_VIDEO_MODEL, d.videoModel);
}

export async function settingsResponse(): Promise<SettingsResponse> {
  const { key, source } = await resolveApiKey();
  const res: SettingsResponse = {
    hasKey: Boolean(key),
    keySource: source,
    defaults: await getDefaults(),
    storage: config.storage,
    dataDir: storageLocation(),
    version: config.version,
  };
  if (key) res.keyMasked = maskKey(key);
  return res;
}
