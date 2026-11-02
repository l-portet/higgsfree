/**
 * The composers' three modes (the switch left of the model chip) and which models each lists. A model can sit in two:
 * an image model that takes a source image creates and edits, and a video model that takes reference videos creates
 * and edits from a reference (a new clip guided by the one dropped in), next to the dedicated editors.
 */
import type { ImageModel, VideoModel } from "@shared/types";
import { DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_UPSCALE_MODEL, DEFAULT_VIDEO_EDIT_MODEL, DEFAULT_VIDEO_MODEL, DEFAULT_VIDEO_UPSCALE_MODEL } from "@shared/models";

export type ComposerMode = "create" | "edit" | "upscale";

export const COMPOSER_MODES: { value: ComposerMode; label: string }[] = [
  { value: "create", label: "Create" },
  { value: "edit", label: "Edit" },
  { value: "upscale", label: "Upscale" },
];

export function isComposerMode(v: unknown): v is ComposerMode {
  return v === "create" || v === "edit" || v === "upscale";
}

/** Each mode's model until one is picked there. */
export const MODE_DEFAULT_MODEL: Record<"image" | "video", Record<ComposerMode, string>> = {
  image: { create: DEFAULT_IMAGE_MODEL, edit: DEFAULT_IMAGE_MODEL, upscale: DEFAULT_IMAGE_UPSCALE_MODEL },
  video: { create: DEFAULT_VIDEO_MODEL, edit: DEFAULT_VIDEO_EDIT_MODEL, upscale: DEFAULT_VIDEO_UPSCALE_MODEL },
};

/** A video model that edits by taking the clip as a reference video: not a dedicated editor, a new clip guided by it. */
export function editsByReference(m: VideoModel): boolean {
  return !m.caps.videoEdit && !m.caps.motionControl && (m.caps.mediaReferences?.videos ?? 0) > 0;
}

/** The modes a model is listed in. */
export function modelModes(m: ImageModel | VideoModel): ComposerMode[] {
  if (m.caps.upscale) return ["upscale"];
  if (m.kind === "image") {
    const out: ComposerMode[] = [];
    if (m.caps.textToImage) out.push("create");
    if (m.caps.imageToImage && m.caps.maxReferenceImages > 0) out.push("edit");
    return out;
  }
  if (m.caps.videoEdit) return ["edit"];
  return editsByReference(m) ? ["create", "edit"] : ["create"];
}

export function inMode(m: ImageModel | VideoModel, mode: ComposerMode): boolean {
  return modelModes(m).includes(mode);
}

/**
 * The model a mode runs: `id` when the mode lists it, else the mode's default, else its first model. Undefined only
 * when the mode lists none.
 */
export function modelForMode<M extends ImageModel | VideoModel>(models: M[], mode: ComposerMode, id: string | undefined): M | undefined {
  const listed = models.filter((m) => inMode(m, mode));
  const kind = models[0]?.kind ?? "image";
  return listed.find((m) => m.id === id) ?? listed.find((m) => m.id === MODE_DEFAULT_MODEL[kind][mode]) ?? listed[0];
}
