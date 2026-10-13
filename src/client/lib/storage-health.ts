/** Quota, persistence and the browser's eviction rules, as far as the Storage API tells us. */
import { readJson, writeJson } from "./storage";

export interface StorageEstimate {
  usage: number;
  quota: number;
  persisted: boolean;
}

const PERSIST_STORAGE = "higgsfree.persist";

function storageManager(): StorageManager | undefined {
  return typeof navigator !== "undefined" ? navigator.storage : undefined;
}

/** `undefined` when the Storage API is missing (insecure context, old browsers). */
export async function estimateStorage(): Promise<StorageEstimate | undefined> {
  const sm = storageManager();
  if (!sm || typeof sm.estimate !== "function") return undefined;
  try {
    const [est, persisted] = await Promise.all([sm.estimate(), typeof sm.persisted === "function" ? sm.persisted() : Promise.resolve(false)]);
    return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
  } catch {
    return undefined;
  }
}

/** Ask the browser to exempt this origin from storage eviction. Chrome and Safari decide silently; Firefox may prompt. */
export async function requestPersistence(): Promise<boolean> {
  const sm = storageManager();
  if (!sm || typeof sm.persist !== "function") return false;
  try {
    const granted = await sm.persist();
    writeJson(PERSIST_STORAGE, { askedAt: new Date().toISOString(), granted });
    return granted;
  } catch {
    return false;
  }
}

/** Whether `requestPersistence` ran before in this profile (so it is asked once, not on every completion). */
export function persistenceAsked(): boolean {
  return typeof readJson<Record<string, unknown>>(PERSIST_STORAGE, {}).askedAt === "string";
}

export function isQuotaError(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return err.name === "QuotaExceededError" || err.code === 22 || err.name === "NS_ERROR_DOM_QUOTA_REACHED";
  }
  if (err instanceof Error) return /quota|NS_ERROR_FILE_NO_DEVICE_SPACE/i.test(err.name) || /quota/i.test(err.message);
  return false;
}

export const quotaMessage = (): string =>
  "Browser storage is full. Free space in Settings › Library (export, then delete older runs) or allow this site more storage.";

/** Safari clears every site's storage after seven days without a visit unless the app is installed; worth a warning. */
export function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\//.test(ua);
}
