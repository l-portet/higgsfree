/** Settings (localStorage) + credits (OpenRouter). */
import { create } from "zustand";
import type { CreditsResponse, SettingsResponse, UpdateSettingsRequest } from "@shared/types";
import * as api from "@/lib/api";

interface SettingsState {
  settings: SettingsResponse | null;
  credits: CreditsResponse | null;
  creditsError?: string;
  loading: boolean;

  refresh: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  save: (update: UpdateSettingsRequest) => Promise<SettingsResponse>;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: null,
  credits: null,
  loading: false,

  /** Settings come from localStorage and cannot fail; credits are a network call and report through `creditsError`. */
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    const settings = await api.getSettings();
    set({ settings, loading: false });
    if (settings.hasKey) await get().refreshCredits();
    else set({ credits: null, creditsError: undefined });
  },

  refreshCredits: async () => {
    try {
      const credits = await api.getCredits();
      set({ credits, creditsError: undefined });
    } catch (err) {
      set({ creditsError: api.describeApiError(err) });
    }
  },

  save: async (update) => {
    const settings = await api.updateSettings(update);
    set({ settings });
    if (settings.hasKey) void get().refreshCredits();
    else set({ credits: null, creditsError: undefined });
    return settings;
  },
}));
