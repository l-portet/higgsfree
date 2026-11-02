/** Settings (localStorage), OpenRouter credits, and what is left on every key. */
import { create } from "zustand";
import type { CreditsResponse, ProviderId, SettingsResponse, UpdateSettingsRequest } from "@shared/types";
import type { BalanceEntry } from "@/lib/balances";
import * as api from "@/lib/api";

interface SettingsState {
  settings: SettingsResponse | null;
  credits: CreditsResponse | null;
  creditsError?: string;
  /** Each stored key's balance (or why it could not be read); empty until read. */
  balances: Partial<Record<ProviderId, BalanceEntry>>;
  loading: boolean;

  refresh: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  /** Read every key's balance (cached 30 s unless `fresh`). */
  refreshBalances: (fresh?: boolean) => Promise<void>;
  save: (update: UpdateSettingsRequest) => Promise<SettingsResponse>;
}

let balancesInFlight: Promise<void> | undefined;
let balancesAgain = false;

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: null,
  credits: null,
  balances: {},
  loading: false,

  /** Settings come from localStorage and cannot fail; credits are a network call and report through `creditsError`. */
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    const settings = await api.getSettings();
    set({ settings, loading: false });
    if (settings.hasKey) await get().refreshCredits();
    else set({ credits: null, creditsError: undefined });
    await get().refreshBalances();
  },

  refreshCredits: async () => {
    try {
      const credits = await api.getCredits();
      set((s) => ({ credits, creditsError: undefined, balances: { ...s.balances, openrouter: { ok: true, balance: { usd: credits.remaining } } } }));
    } catch (err) {
      set({ creditsError: api.describeApiError(err) });
    }
  },

  refreshBalances: async (fresh = false) => {
    // One lookup at a time: a batch of runs finishing together reads the balances once more, not once each.
    if (balancesInFlight) {
      balancesAgain ||= fresh;
      return balancesInFlight;
    }
    balancesInFlight = (async () => {
      try {
        set({ balances: await api.getBalances(fresh) });
      } finally {
        balancesInFlight = undefined;
      }
      if (balancesAgain) {
        balancesAgain = false;
        await get().refreshBalances(true);
      }
    })();
    return balancesInFlight;
  },

  save: async (update) => {
    const settings = await api.updateSettings(update);
    set({ settings });
    if (settings.hasKey) void get().refreshCredits();
    else set({ credits: null, creditsError: undefined });
    void get().refreshBalances();
    return settings;
  },
}));
