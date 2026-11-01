/**
 * Cross-page UI state: lightbox, the "Animate this image" and "Edit this video" hand-offs to /video,
 * and "Reuse prompt" drafts consumed by the page's prompt bar.
 */
import { create } from "zustand";
import type { GenerationType, ImageParams, MotionOrientation, ProviderId, VideoParams } from "@shared/types";

/** Sections of the Settings dialog, in sidebar order. */
export type SettingsSection = "keys" | "library" | "notifications" | "about";

/** The small "add your key" dialog: which provider, why (one line), and what to do once the key is saved. */
export interface KeyPrompt {
  provider: ProviderId;
  /** e.g. "Kling 3.0 Motion Control runs on fal." */
  reason?: string;
  /** Called after the key was saved (Generate passes itself here, so one click finishes the job). */
  onSaved?: () => void;
}

export interface Draft {
  type: GenerationType;
  prompt: string;
  model?: string;
  params?: ImageParams | VideoParams;
  /** Media ids (reference / edit images). */
  referenceImages?: string[];
  /** Media ids (reference videos and audio of a video run). */
  referenceVideos?: string[];
  referenceAudios?: string[];
  /** Media ids (image-to-video anchor frames; motion control: the character image). */
  firstFrame?: string;
  lastFrame?: string;
  /** Motion control: media id of the reference video. */
  motionVideo?: string;
  orientation?: MotionOrientation;
  /** Video editing: media id of the video being edited. */
  sourceVideo?: string;
}

export interface LightboxState {
  ids: string[];
  index: number;
}

interface UiState {
  /** The small key dialog (Generate without a key, the Add key pill). */
  keyPrompt: KeyPrompt | null;
  openKeyDialog: (prompt?: Partial<KeyPrompt>) => void;
  closeKeyDialog: () => void;

  /** The Settings dialog and its open section. */
  settings: SettingsSection | null;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;

  lightbox: LightboxState | null;
  openLightbox: (ids: string[], index: number) => void;
  closeLightbox: () => void;
  lightboxStep: (delta: number) => void;
  /** Keep the lightbox list in sync when items are removed. */
  lightboxSetIds: (ids: string[]) => void;

  /** The media id of an image handed to the video composer as first frame. */
  pendingFirstFrame: string | null;
  setPendingFirstFrame: (id: string | null) => void;
  consumePendingFirstFrame: () => string | null;

  /** The media id of a video handed to the video composer to edit. */
  pendingSourceVideo: string | null;
  setPendingSourceVideo: (id: string | null) => void;
  consumePendingSourceVideo: () => string | null;

  draft: Draft | null;
  setDraft: (draft: Draft | null) => void;
  consumeDraft: (type: GenerationType) => Draft | null;
}

export const useUi = create<UiState>()((set, get) => ({
  keyPrompt: null,
  openKeyDialog: (prompt = {}) => set({ keyPrompt: { provider: "openrouter", ...prompt } }),
  closeKeyDialog: () => set({ keyPrompt: null }),

  settings: null,
  openSettings: (section = "keys") => set({ settings: section, keyPrompt: null }),
  closeSettings: () => set({ settings: null }),

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
  setPendingFirstFrame: (id) => set({ pendingFirstFrame: id }),
  consumePendingFirstFrame: () => {
    const id = get().pendingFirstFrame;
    if (id) set({ pendingFirstFrame: null });
    return id;
  },

  pendingSourceVideo: null,
  setPendingSourceVideo: (id) => set({ pendingSourceVideo: id }),
  consumePendingSourceVideo: () => {
    const id = get().pendingSourceVideo;
    if (id) set({ pendingSourceVideo: null });
    return id;
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
