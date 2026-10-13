/**
 * Model catalog store. Seeds from the curated catalog so the UI works right away; `getModels()`
 * swaps in OpenRouter's live catalog (options, prices, newly listed models), with or without a key.
 */
import { create } from "zustand";
import type { ImageModel, ModelsResponse, VideoModel } from "@shared/types";
import { IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import * as api from "@/lib/api";

type Status = "idle" | "loading" | "ready" | "error";

interface ModelsState {
  image: ImageModel[];
  video: VideoModel[];
  live?: ModelsResponse["live"];
  status: Status;
  error?: string;
  fetch: (force?: boolean) => Promise<void>;
  /** `undefined` when there is no live snapshot. */
  isAvailable: (id: string) => boolean | undefined;
  findImage: (id: string | undefined) => ImageModel | undefined;
  findVideo: (id: string | undefined) => VideoModel | undefined;
}

let inflight: Promise<void> | null = null;

export const useModels = create<ModelsState>()((set, get) => ({
  image: IMAGE_MODELS,
  video: VIDEO_MODELS.filter((m) => !m.hidden),
  live: undefined,
  status: "idle",

  fetch: async (force = false) => {
    if (inflight) return inflight;
    if (!force && get().status === "ready") return;
    set({ status: "loading", error: undefined });
    inflight = (async () => {
      try {
        const res = await api.getModels();
        set({
          image: res.image.length ? res.image : IMAGE_MODELS,
          video: (res.video.length ? res.video : VIDEO_MODELS).filter((m) => !m.hidden),
          live: res.live,
          status: "ready",
        });
      } catch (err) {
        set({ status: "error", error: api.describeApiError(err) });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  isAvailable: (id) => {
    const live = get().live;
    if (!live) return undefined;
    return live.available.includes(id);
  },

  findImage: (id) => (id ? get().image.find((m) => m.id === id) : undefined),
  findVideo: (id) => (id ? get().video.find((m) => m.id === id) : undefined),
}));

export function useImageModel(id: string | undefined): ImageModel | undefined {
  return useModels((s) => (id ? s.image.find((m) => m.id === id) : undefined));
}

export function useVideoModel(id: string | undefined): VideoModel | undefined {
  return useModels((s) => (id ? s.video.find((m) => m.id === id) : undefined));
}
