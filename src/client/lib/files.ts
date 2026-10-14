/** File helpers for reference images and motion videos: validation, dimensions, paste / drop extraction, download names. */

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(",");
/** Motion-control reference videos (the store sniffs the bytes; this only narrows the picker). */
export const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
const VIDEO_ACCEPT = VIDEO_MIME_TYPES.join(",");

function isAcceptedImage(file: File): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
}

/** Returns an error message, or `null` when the file is acceptable. */
export function validateImageFile(file: File): string | null {
  if (!isAcceptedImage(file)) return `${file.name || "File"} isn't a PNG, JPG or WebP image`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name || "Image"} is over 25 MB`;
  return null;
}

export function readImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Couldn't decode image"));
    img.src = src;
  });
}

/** Files dragged/dropped (only images). */
export function imageFilesFromDataTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const out: File[] = [];
  if (dt.items && dt.items.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind !== "file") continue;
      const f = item.getAsFile();
      if (f && f.type.startsWith("image/")) out.push(f);
    }
  }
  if (out.length === 0 && dt.files) {
    for (const f of Array.from(dt.files)) if (f.type.startsWith("image/")) out.push(f);
  }
  return out;
}

/** Video files dragged/dropped. */
export function videoFilesFromDataTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const out: File[] = [];
  if (dt.items && dt.items.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind !== "file") continue;
      const f = item.getAsFile();
      if (f && f.type.startsWith("video/")) out.push(f);
    }
  }
  if (out.length === 0 && dt.files) {
    for (const f of Array.from(dt.files)) if (f.type.startsWith("video/")) out.push(f);
  }
  return out;
}

/** True when a drag carries files (used to light up dropzones). */
export function dragHasFiles(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  return Array.from(dt.types ?? []).includes("Files");
}

/** Images pasted from the clipboard (screenshots, copied images). */
export function imageFilesFromClipboard(e: { clipboardData: DataTransfer | null }): File[] {
  return imageFilesFromDataTransfer(e.clipboardData);
}

/** Grace period after the window regains focus before an unanswered picker counts as cancelled. */
const PICKER_SETTLE_MS = 1_500;
/** Hard ceiling for a picker that never reports back (no `change`, no `cancel`, no focus). */
const PICKER_MAX_MS = 10 * 60_000;

/**
 * Open the native file picker and resolve with the chosen files.
 * Safari (and some WebViews) never fire `cancel`, so the hidden input is also
 * cleaned up shortly after the window regains focus, or after a hard timeout.
 */
function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      if (focusTimer) clearTimeout(focusTimer);
      clearTimeout(maxTimer);
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(files);
    };
    const onFocus = () => {
      if (focusTimer) clearTimeout(focusTimer);
      // `change` fires before focus returns in every major browser; wait a beat to be safe.
      focusTimer = setTimeout(() => finish(Array.from(input.files ?? [])), PICKER_SETTLE_MS);
    };
    const maxTimer = setTimeout(() => finish([]), PICKER_MAX_MS);
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => finish([]));
    window.addEventListener("focus", onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

/** Pick PNG / JPG / WebP images (several by default). */
export function pickImageFiles(opts: { multiple?: boolean } = {}): Promise<File[]> {
  return pickFiles(IMAGE_ACCEPT, opts.multiple ?? true);
}

/** Pick one MP4 / MOV / WebM video (the motion-control reference). */
export function pickVideoFiles(): Promise<File[]> {
  return pickFiles(VIDEO_ACCEPT, false);
}

export function extensionForMime(mime: string | undefined): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return mime?.split("/")[1] ?? "bin";
  }
}

/** Filename for the Download action. */
export function downloadFilename(id: string, mime: string | undefined): string {
  return `higgsfree-${id}.${extensionForMime(mime)}`;
}
