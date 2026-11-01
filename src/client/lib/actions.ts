/** Actions shared by the generation card and the lightbox: delete, retry, keep (favorite, in a folder), animate, edit a video, upscale, reuse prompt. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Generation, VideoParams } from "@shared/types";
import { describeApiError } from "@/lib/api";
import { useFolders } from "@/store/folders";
import { useGenerations } from "@/store/generations";
import { useUi } from "@/store/ui";

export type GenerationActions = ReturnType<typeof useGenerationActions>;

export function useGenerationActions(g: Generation, onReuse?: (g: Generation) => void) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [keeping, setKeeping] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await useGenerations.getState().deleteGeneration(g.id);
      toast.success(g.type === "image" ? "Image deleted" : "Video deleted");
    } catch (err) {
      toast.error("Couldn't delete", { description: describeApiError(err) });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      await useGenerations.getState().retryGeneration(g.id);
      toast.success("Retrying…");
    } catch (err) {
      toast.error("Retry failed", { description: describeApiError(err) });
    } finally {
      setRetrying(false);
    }
  };

  /**
   * Keep the record in a folder (`null` = All, no folder). The choice becomes the heart's default.
   * Already there: nothing happens.
   */
  const keep = async (folder: string | null) => {
    if (keeping) return;
    const folders = useFolders.getState();
    const wasKept = Boolean(g.favorite);
    const wasIn = g.folder && folders.byId[g.folder] ? g.folder : null;
    folders.setDestination(folder);
    if (wasKept && wasIn === folder) return;
    setKeeping(true);
    try {
      await useGenerations.getState().setKeep(g.id, { favorite: true, folder });
      const name = folder ? folders.byId[folder]?.name : undefined;
      if (!wasKept) toast.success(name ? `Kept in ${name}` : "Kept in Favorites");
      else if (name) toast.success(`Moved to ${name}`);
      else toast.success("Moved out of its folder");
    } catch (err) {
      toast.error("Couldn't update", { description: describeApiError(err) });
    } finally {
      setKeeping(false);
    }
  };

  /** The heart's one-click path: keep in the last destination picked (a folder, or All). */
  const keepDefault = () => keep(useFolders.getState().defaultDestination());

  const unkeep = async () => {
    if (keeping) return;
    setKeeping(true);
    try {
      await useGenerations.getState().setKeep(g.id, { favorite: false });
      toast.success("Removed from Favorites");
    } catch (err) {
      toast.error("Couldn't update", { description: describeApiError(err) });
    } finally {
      setKeeping(false);
    }
  };

  const animate = () => {
    if (!g.output) return;
    useUi.getState().setPendingFirstFrame(g.output.id);
    useUi.getState().closeLightbox();
    router.push("/video");
  };

  const editVideo = () => {
    if (!g.output) return;
    useUi.getState().setPendingSourceVideo(g.output.id);
    useUi.getState().closeLightbox();
    router.push("/video");
  };

  /** Hand the output to its own composer, on an upscaler. */
  const upscale = () => {
    if (!g.output) return;
    useUi.getState().setPendingUpscale({ type: g.type, mediaId: g.output.id });
    useUi.getState().closeLightbox();
    router.push(g.type === "image" ? "/image" : "/video");
  };

  const reuse = () => {
    if (onReuse) return onReuse(g);
    useUi.getState().setDraft({
      type: g.type,
      prompt: g.prompt,
      model: g.model,
      params: g.params,
      referenceImages: g.inputs?.referenceImages,
      referenceVideos: g.inputs?.referenceVideos,
      referenceAudios: g.inputs?.referenceAudios,
      firstFrame: g.inputs?.firstFrame,
      lastFrame: g.inputs?.lastFrame,
      motionVideo: g.inputs?.motionVideo,
      sourceVideo: g.inputs?.sourceVideo,
      orientation: g.type === "video" ? (g.params as VideoParams).orientation : undefined,
    });
    useUi.getState().closeLightbox();
    router.push(g.type === "image" ? "/image" : "/video");
  };

  return { confirmDelete, setConfirmDelete, deleting, retrying, keeping, remove, retry, keep, keepDefault, unkeep, animate, editVideo, upscale, reuse };
}
