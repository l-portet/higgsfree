/** Container sniffing for uploaded videos: MP4 / QuickTime (an \`ftyp\` box) and WebM (EBML). */
export interface VideoFormat {
  ext: "mp4" | "mov" | "webm";
  mime: string;
}

export function detectVideo(bytes: Uint8Array): VideoFormat | undefined {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    return brand === "qt  " ? { ext: "mov", mime: "video/quicktime" } : { ext: "mp4", mime: "video/mp4" };
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { ext: "webm", mime: "video/webm" };
  return undefined;
}
