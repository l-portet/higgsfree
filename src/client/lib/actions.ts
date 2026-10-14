/** Actions shared by the generation card and the lightbox: delete, retry, keep (favorite), animate, reuse prompt. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Generation, VideoParams } from "@shared/types";
import { describeApiError } from "@/lib/api";
import { useGenerations } from "@/store/generations";
import { useUi } from "@/store/ui";

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

  const toggleFavorite = async () => {
    if (keeping) return;
    setKeeping(true);
    const next = !g.favorite;
    try {
      await useGenerations.getState().setFavorite(g.id, next);
      toast.success(next ? "Kept in Favorites" : "Removed from Favorites");
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

  const reuse = () => {
    if (onReuse) return onReuse(g);
    useUi.getState().setDraft({
      type: g.type,
      prompt: g.prompt,
      model: g.model,
      params: g.params,
      referenceImages: g.inputs?.referenceImages,
      firstFrame: g.inputs?.firstFrame,
      lastFrame: g.inputs?.lastFrame,
      motionVideo: g.inputs?.motionVideo,
      orientation: g.type === "video" ? (g.params as VideoParams).orientation : undefined,
    });
    useUi.getState().closeLightbox();
    router.push(g.type === "image" ? "/image" : "/video");
  };

  return { confirmDelete, setConfirmDelete, deleting, retrying, keeping, remove, retry, toggleFavorite, animate, reuse };
}
