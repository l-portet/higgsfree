/** Container sniffing for uploaded videos: MP4 / QuickTime (an \`ftyp\` box) and WebM (EBML). */
export interface VideoFormat {
  ext: "mp4" | "mov" | "webm";
  mime: string;
}

/** OpenRouter's (and Gemini's) type for each format: QuickTime is `video/mov`, not the browser's `video/quicktime`. */
export const OPENROUTER_VIDEO_MIME: Record<VideoFormat["ext"], string> = { mp4: "video/mp4", mov: "video/mov", webm: "video/webm" };

/** A clip's length in seconds, as the browser reads it from the file's header. `undefined` when it cannot. */
export async function readVideoDuration(file: Blob, timeoutMs = 5000): Promise<number | undefined> {
  return (await readVideoMeta(file, timeoutMs)).durationSec;
}

/** A clip's length (seconds) and size (pixels), as the browser reads them from the file's header; each undefined when it cannot. */
export function readVideoMeta(file: Blob, timeoutMs = 5000): Promise<{ durationSec?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (seconds?: number, width?: number, height?: number) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve({
        durationSec: seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
        width: width || undefined,
        height: height || undefined,
      });
    };
    const timer = setTimeout(() => done(), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(video.duration, video.videoWidth, video.videoHeight);
    video.onerror = () => done();
    video.src = url;
  });
}

export function detectVideo(bytes: Uint8Array): VideoFormat | undefined {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    return brand === "qt  " ? { ext: "mov", mime: "video/quicktime" } : { ext: "mp4", mime: "video/mp4" };
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { ext: "webm", mime: "video/webm" };
  return undefined;
}
