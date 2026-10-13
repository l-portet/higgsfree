/**
 * Cross-page UI state: lightbox, the "Animate this image" hand-off to /video,
 * and "Reuse prompt" drafts consumed by the page's prompt bar.
 */
import { create } from "zustand";
import type { GenerationType, ImageParams, VideoParams } from "@shared/types";

export interface Draft {
  type: GenerationType;
  prompt: string;
  model?: string;
  params?: ImageParams | VideoParams;
  referenceImages?: string[];
  firstFrame?: string;
  lastFrame?: string;
}

export interface LightboxState {
  ids: string[];
  index: number;
}

interface UiState {
  lightbox: LightboxState | null;
  openLightbox: (ids: string[], index: number) => void;
  closeLightbox: () => void;
  lightboxStep: (delta: number) => void;
  /** Keep the lightbox list in sync when items are removed. */
  lightboxSetIds: (ids: string[]) => void;

  /** `/media/...` url of an image handed to the video page as first frame. */
  pendingFirstFrame: string | null;
  setPendingFirstFrame: (url: string | null) => void;
  consumePendingFirstFrame: () => string | null;

  draft: Draft | null;
  setDraft: (draft: Draft | null) => void;
  consumeDraft: (type: GenerationType) => Draft | null;
}

export const useUi = create<UiState>()((set, get) => ({
  lightbox: null,
  openLightbox: (ids, index) => {
    if (ids.length === 0) return;
    set({ lightbox: { ids, index: Math.min(Math.max(index, 0), ids.length - 1) } });
  },
  closeLightbox: () => set({ lightbox: null }),
  lightboxStep: (delta) => {
    const lb = get().lightbox;
    if (!lb || lb.ids.length === 0) return;
    const next = (lb.index + delta + lb.ids.length) % lb.ids.length;
    set({ lightbox: { ...lb, index: next } });
  },
  lightboxSetIds: (ids) => {
    const lb = get().lightbox;
    if (!lb) return;
    if (ids.length === 0) return set({ lightbox: null });
    const currentId = lb.ids[lb.index];
    const idx = currentId ? ids.indexOf(currentId) : -1;
    set({ lightbox: { ids, index: idx >= 0 ? idx : Math.min(lb.index, ids.length - 1) } });
  },

  pendingFirstFrame: null,
  setPendingFirstFrame: (url) => set({ pendingFirstFrame: url }),
  consumePendingFirstFrame: () => {
    const url = get().pendingFirstFrame;
    if (url) set({ pendingFirstFrame: null });
    return url;
  },

  draft: null,
  setDraft: (draft) => set({ draft }),
  consumeDraft: (type) => {
    const d = get().draft;
    if (!d || d.type !== type) return null;
    set({ draft: null });
    return d;
  },
}));
