/** The prompt editor's preview configuration, kept in this browser (Settings-free: it lives in the dialog). */
import { normalizePreviewConfig, type PreviewConfig } from "./prompt-editor";
import { readJson, writeJson } from "./storage";

export const PREVIEW_CONFIG_STORAGE = "higgsfree.promptEditor.preview";

export function readPreviewConfig(): PreviewConfig {
  return normalizePreviewConfig(readJson<Record<string, unknown>>(PREVIEW_CONFIG_STORAGE, {}));
}

export function writePreviewConfig(config: PreviewConfig): PreviewConfig {
  const clean = normalizePreviewConfig(config);
  writeJson(PREVIEW_CONFIG_STORAGE, clean);
  return clean;
}
