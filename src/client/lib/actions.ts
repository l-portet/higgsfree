/** Actions shared by the generation card and the lightbox: delete, retry, animate, reuse prompt. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Generation } from "@shared/types";
import { describeApiError } from "@/lib/api";
import { useGenerations } from "@/store/generations";
import { useUi } from "@/store/ui";

export function useGenerationActions(g: Generation, onReuse?: (g: Generation) => void) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);

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

  const animate = () => {
    if (!g.output) return;
    useUi.getState().setPendingFirstFrame(g.output.url);
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
    });
    useUi.getState().closeLightbox();
    router.push(g.type === "image" ? "/image" : "/video");
  };

  return { confirmDelete, setConfirmDelete, deleting, retrying, remove, retry, animate, reuse };
}
