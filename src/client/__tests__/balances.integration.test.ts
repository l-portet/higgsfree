/** What is left on each key, read from every provider, and the total the key button shows. */
import { beforeEach, describe, expect, it } from "vitest";
import * as api from "@/lib/api";
import { totalBalance } from "@/lib/balances";
import { setProviderKey, setStoredFalKey, setStoredKey } from "@/lib/settings";
import { APIMART_KEY, FAL_KEY, installMockOpenRouter, KIE_KEY, REVANA_KEY, type MockOpenRouter } from "./mock-openrouter";

let mock: MockOpenRouter;

beforeEach(() => {
  mock = installMockOpenRouter();
});

describe("balances", () => {
  it("reads each stored key's balance in USD and adds them up", async () => {
    setStoredKey("test-key");
    setStoredFalKey(FAL_KEY);
    setProviderKey("kie", KIE_KEY);
    setProviderKey("apimart", APIMART_KEY);
    setProviderKey("revana", REVANA_KEY);
    const b = await api.getBalances(true);
    expect(b).toEqual({
      openrouter: { ok: true, balance: { usd: 7.5 } },
      fal: { ok: true, balance: { usd: 24.5 } },
      kie: { ok: true, balance: { usd: expect.closeTo(6.1725), credits: 1234.5 } },
      apimart: { ok: true, balance: { usd: 12.5 } },
      revana: { ok: true, balance: { usd: 9.5 } },
    });
    expect(totalBalance(b)).toEqual({ usd: expect.closeTo(60.1725), unlimited: false, read: 5 });
    expect(mock.fal("/v1/account/billing?expand=credits")[0]?.auth).toBe(`Key ${FAL_KEY}`);
  });

  it("a key that cannot read its balance says why, and the others still add up", async () => {
    setStoredFalKey(FAL_KEY);
    setProviderKey("revana", REVANA_KEY);
    mock.state.falBillingForbidden = true;
    const b = await api.getBalances(true);
    expect(b.fal).toEqual({ ok: false, error: expect.stringContaining("billing access") });
    expect(totalBalance(b)).toEqual({ usd: 9.5, unlimited: false, read: 1 });
    // The key itself still works: the key test falls back to a plain check.
    await expect(api.testProviderKey("fal")).resolves.toEqual({ ok: true });
  });

  it("the fal key test shows the balance when the key may read it", async () => {
    await expect(api.testProviderKey("fal", FAL_KEY)).resolves.toEqual({ ok: true, balanceUsd: 24.5 });
  });

  it("an unlimited APIMart key counts as unlimited, not as a number", () => {
    expect(totalBalance({ apimart: { ok: true, balance: { usd: null } }, fal: { ok: true, balance: { usd: 2 } } })).toEqual({ usd: 2, unlimited: true, read: 2 });
  });
});
