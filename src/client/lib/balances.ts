/**
 * What is left on each provider's key, in USD: OpenRouter's credits, fal's account balance, kie.ai's credits
 * ($0.005 each), APIMart's and Revana's balances. Each lookup is cached 30 s per key, so hovering the key button again
 * does not refetch. A provider whose balance cannot be read reports why instead.
 */
import type { ProviderId } from "@shared/types";
import * as apimart from "./apimart";
import { cachedCredits } from "./credits";
import { describeApiError } from "./errors";
import * as fal from "./fal";
import * as kie from "./kie";
import { KIE_CREDIT_USD } from "./kie";
import * as revana from "./revana";

export interface ProviderBalance {
  /** USD left; `null` when the key has no limit (APIMart's unlimited keys). */
  usd: number | null;
  /** kie.ai: the same in its credits. */
  credits?: number;
}

export type BalanceEntry = { ok: true; balance: ProviderBalance } | { ok: false; error: string };

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: ProviderBalance }>();

async function lookup(provider: ProviderId, key: string): Promise<ProviderBalance> {
  switch (provider) {
    case "openrouter":
      return { usd: (await cachedCredits(key)).remaining };
    case "fal":
      return { usd: (await fal.balance(key)).usd };
    case "kie": {
      const { credits } = await kie.testKey(key);
      return { usd: credits * KIE_CREDIT_USD, credits };
    }
    case "apimart": {
      const { balanceUsd } = await apimart.testKey(key);
      return { usd: balanceUsd < 0 ? null : balanceUsd };
    }
    case "revana":
      return { usd: (await revana.testKey(key)).balanceUsd };
  }
}

export async function providerBalance(provider: ProviderId, key: string): Promise<ProviderBalance> {
  const id = `${provider}\n${key}`;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await lookup(provider, key);
  cache.set(id, { at: Date.now(), value });
  return value;
}

/** Each keyed provider's balance, looked up in parallel; one failing does not hide the others. */
export async function allBalances(keys: Partial<Record<ProviderId, string>>): Promise<Partial<Record<ProviderId, BalanceEntry>>> {
  const entries = await Promise.all(
    (Object.entries(keys) as [ProviderId, string | undefined][])
      .filter((e): e is [ProviderId, string] => Boolean(e[1]))
      .map(async ([provider, key]): Promise<[ProviderId, BalanceEntry]> => {
        try {
          return [provider, { ok: true, balance: await providerBalance(provider, key) }];
        } catch (err) {
          return [provider, { ok: false, error: describeApiError(err) }];
        }
      }),
  );
  return Object.fromEntries(entries);
}

/** The sum of the balances read (an unlimited key adds nothing), and whether any is unlimited. */
export function totalBalance(balances: Partial<Record<ProviderId, BalanceEntry>>): { usd: number; unlimited: boolean; read: number } {
  let usd = 0;
  let unlimited = false;
  let read = 0;
  for (const entry of Object.values(balances)) {
    if (!entry?.ok) continue;
    read++;
    if (entry.balance.usd === null) unlimited = true;
    else usd += Math.max(0, entry.balance.usd);
  }
  return { usd, unlimited, read };
}

export function invalidateBalances(): void {
  cache.clear();
}
