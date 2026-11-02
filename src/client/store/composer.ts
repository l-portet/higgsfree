/**
 * The composer (prompt dock) is one global surface. Its mode follows the Image / Video view and
 * stays where it was on Favorites, so what you were setting up is still there.
 */
import { create } from "zustand";
import type { GenerationType } from "@shared/types";
import { readJson, writeJson } from "@/lib/storage";

const STORAGE_KEY = "higgsfree.composer";

export type ComposerMode = GenerationType;

interface ComposerState {
  mode: ComposerMode;
  setMode: (mode: ComposerMode) => void;
}

function restoreMode(): ComposerMode {
  const p = readJson<Record<string, unknown>>(STORAGE_KEY, {});
  return p.mode === "image" ? "image" : "video";
}

export const useComposer = create<ComposerState>()((set, get) => ({
  mode: restoreMode(),
  setMode: (mode) => {
    if (get().mode === mode) return;
    set({ mode });
    writeJson(STORAGE_KEY, { mode });
  },
}));
