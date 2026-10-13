/** Credits lookup with a 30-second cache (per key). */
import type { CreditsResponse } from "../shared/types.ts";
import * as or from "./openrouter.ts";

const TTL_MS = 30_000;
let cache: { key: string; at: number; value: CreditsResponse } | undefined;

/** Live lookup: `/api/v1/key` + `/api/v1/credits` in parallel. */
export async function fetchCredits(key: string): Promise<CreditsResponse> {
  const [info, cr] = await Promise.all([or.keyInfo(key), or.credits(key)]);
  const res: CreditsResponse = { total: cr.total, used: cr.used, remaining: Math.max(0, cr.total - cr.used) };
  if (Object.keys(info).length > 0) res.key = info;
  return res;
}

export async function cachedCredits(key: string): Promise<CreditsResponse> {
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await fetchCredits(key);
  cache = { key, at: Date.now(), value };
  return value;
}

export function invalidateCredits(): void {
  cache = undefined;
}
