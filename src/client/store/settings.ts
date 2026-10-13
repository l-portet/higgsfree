/** Settings + credits, plus a coarse server reachability flag used for graceful degradation. */
import { create } from "zustand";
import type { CreditsResponse, SettingsResponse, UpdateSettingsRequest } from "@shared/types";
import * as api from "@/lib/api";
import { ApiClientError } from "@/lib/api";

export type ServerStatus = "unknown" | "online" | "offline";

interface SettingsState {
  settings: SettingsResponse | null;
  credits: CreditsResponse | null;
  creditsError?: string;
  server: ServerStatus;
  loading: boolean;

  refresh: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  save: (update: UpdateSettingsRequest) => Promise<SettingsResponse>;
  setServer: (status: ServerStatus) => void;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: null,
  credits: null,
  server: "unknown",
  loading: false,

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const settings = await api.getSettings();
      set({ settings, server: "online", loading: false });
      if (settings.hasKey) await get().refreshCredits();
      else set({ credits: null, creditsError: undefined });
    } catch (err) {
      const offline = err instanceof ApiClientError && err.offline;
      set({ loading: false, server: offline ? "offline" : get().server });
    }
  },

  refreshCredits: async () => {
    try {
      const credits = await api.getCredits();
      set({ credits, creditsError: undefined });
    } catch (err) {
      set({ creditsError: api.describeApiError(err) });
      if (err instanceof ApiClientError && err.offline) set({ server: "offline" });
    }
  },

  save: async (update) => {
    const settings = await api.updateSettings(update);
    set({ settings, server: "online" });
    if (settings.hasKey) void get().refreshCredits();
    else set({ credits: null });
    return settings;
  },

  setServer: (server) => {
    if (get().server !== server) set({ server });
  },
}));
