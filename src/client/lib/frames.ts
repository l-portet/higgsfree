/**
 * Image-input upload state shared by the prompt bar (reference images) and the
 * video panel (frames / style references): preview immediately from a data URL,
 * upload in the background, fall back to the data URL when the upload can't finish.
 */
import { toast } from "sonner";
import * as api from "@/lib/api";
import { ApiClientError, describeApiError } from "@/lib/api";
import { fileToDataUrl, readImageDimensions, validateImageFile } from "@/lib/files";
import { uid } from "@/lib/uid";

export interface Frame {
  id: string;
  name: string;
  /** Preview source: a data URL while uploading, the `/media/...` url once stored. */
  src: string;
  /** Uploaded `/media/...` url once the upload finished. */
  url?: string;
  width?: number;
  height?: number;
  uploading: boolean;
}

/** Wrap an already-stored `/media/...` url (Animate hand-off, Reuse prompt). */
export function frameFromUrl(url: string): Frame {
  return { id: uid(), name: url.split("/").pop() ?? "image", src: url, url, uploading: false };
}

/** Value sent to the API: the uploaded url, or the data URL when the upload didn't finish. */
export function frameInput(f: Frame): string {
  return f.url ?? f.src;
}

/**
 * Validate + read a file into a preview-ready `Frame` (`uploading: true`), then upload it in the
 * background. `onSettled` receives the same frame (same id) once the upload finished or failed;
 * on success its `src` is swapped to the `/media` url so the (up to 25 MB) data URL can be freed.
 * Resolves `null` when the file was rejected (a toast explains why).
 */
export async function loadFrame(file: File, onSettled: (frame: Frame) => void): Promise<Frame | null> {
  const problem = validateImageFile(file);
  if (problem) {
    toast.error(problem);
    return null;
  }
  let src: string;
  try {
    src = await fileToDataUrl(file);
  } catch {
    toast.error(`Couldn't read ${file.name}`);
    return null;
  }
  const dims = await readImageDimensions(src).catch(() => undefined);
  const frame: Frame = { id: uid(), name: file.name, src, width: dims?.width, height: dims?.height, uploading: true };

  api
    .upload(file)
    .then((res) => {
      onSettled({
        ...frame,
        src: res.media.url,
        url: res.media.url,
        width: res.media.width ?? frame.width,
        height: res.media.height ?? frame.height,
        uploading: false,
      });
    })
    .catch((err: unknown) => {
      // The generate endpoint accepts data URLs too: keep the image, just skip the upload.
      onSettled({ ...frame, uploading: false });
      if (!(err instanceof ApiClientError && err.offline)) toast.error(describeApiError(err));
    });

  return frame;
}
