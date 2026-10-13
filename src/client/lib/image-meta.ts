/**
 * Pure image format + dimension sniffing from headers (PNG / JPEG / WebP).
 * No native deps; reads only the bytes it needs.
 */
export type ImageFormat = "png" | "jpeg" | "webp";

export interface ImageMeta {
  format: ImageFormat;
  mime: string;
  ext: string;
  width?: number;
  height?: number;
}

export const IMAGE_MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const u16be = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u32be = (b: Uint8Array, o: number): number =>
  (((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0)) >>> 0;
const u16le = (b: Uint8Array, o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);
const u32le = (b: Uint8Array, o: number): number => u24le(b, o) | ((b[o + 3] ?? 0) << 24);
const ascii = (b: Uint8Array, o: number, n: number): string => String.fromCharCode(...b.subarray(o, o + n));

export function detectImageFormat(b: Uint8Array): ImageFormat | undefined {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  return undefined;
}

function pngSize(b: Uint8Array): { width: number; height: number } | undefined {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return undefined;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpegSize(b: Uint8Array): { width: number; height: number } | undefined {
  let off = 2;
  while (off + 3 < b.length) {
    if (b[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = b[off + 1] ?? 0;
    if (marker === 0xff) {
      off++; // padding
      continue;
    }
    // Standalone markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return undefined; // EOI / SOS reached without SOF
    const len = u16be(b, off + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (off + 9 > b.length) return undefined;
      return { height: u16be(b, off + 5), width: u16be(b, off + 7) };
    }
    if (len < 2) return undefined;
    off += 2 + len;
  }
  return undefined;
}

function webpSize(b: Uint8Array): { width: number; height: number } | undefined {
  if (b.length < 16) return undefined;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    // Key frame: 3-byte frame tag, then start code 9D 01 2A, then 14-bit width/height.
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return undefined;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b.length < 25 || b[20] !== 0x2f) return undefined;
    const bits = u32le(b, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    if (b.length < 30) return undefined;
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return undefined;
}

/** Returns `undefined` when the bytes are not a PNG / JPEG / WebP. */
export function detectImage(b: Uint8Array): ImageMeta | undefined {
  const format = detectImageFormat(b);
  if (!format) return undefined;
  const meta: ImageMeta = { format, mime: IMAGE_MIME[format], ext: format === "jpeg" ? "jpg" : format };
  const size = format === "png" ? pngSize(b) : format === "jpeg" ? jpegSize(b) : webpSize(b);
  if (size && size.width > 0 && size.height > 0) {
    meta.width = size.width;
    meta.height = size.height;
  }
  return meta;
}
