/**
 * Safe localStorage JSON helpers (private mode / quota errors never throw).
 *
 * `readJson` only hands back values of the same shape as `fallback` (a plain
 * object for object fallbacks, or the same primitive type), so a corrupted or
 * hand-edited entry degrades to the defaults instead of crashing a page.
 * Callers still coerce individual fields (enums via the catalog lists, numbers
 * via `Number.isFinite`) because the object's keys are untrusted.
 */
import { STORAGE_PREFIX } from "./constants";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(fallback)) return isPlainObject(parsed) ? (parsed as T) : fallback;
    if (fallback === null || fallback === undefined) return parsed as T;
    return typeof parsed === typeof fallback ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Remove every key this app wrote (`higgsfree.*`). Used by the route error screen. */
export function clearAppStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
