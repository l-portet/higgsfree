import { describe, expect, it } from "vitest";
import { detectImage, detectImageFormat } from "../image-meta";

const u32be = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16be = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const u16le = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff];
const u24le = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
const u32le = (n: number): number[] => [...u24le(n), (n >>> 24) & 0xff];
const str = (s: string): number[] => [...s].map((ch) => ch.charCodeAt(0));

export function png(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32be(13), ...str("IHDR"), ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0, ...u32be(0),
  ]);
}

function jpeg(width: number, height: number, sof = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, ...u16be(16), ...str("JFIF"), 0, 1, 1, 0, ...u16be(72), ...u16be(72), 0, 0];
  const dqt = [0xff, 0xdb, ...u16be(4), 0, 0]; // bogus short segment to exercise skipping
  const sofSeg = [0xff, sof, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xff, ...app0, ...dqt, ...sofSeg, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

function webpVp8(width: number, height: number): Uint8Array {
  const payload = [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height), 0, 0, 0, 0];
  const chunk = [...str("VP8 "), ...u32le(payload.length), ...payload];
  return Uint8Array.from([...str("RIFF"), ...u32le(4 + chunk.length), ...str("WEBP"), ...chunk]);
}

function webpVp8l(width: number, height: number): Uint8Array {
  const bits = (width - 1) | ((height - 1) << 14) | (1 << 28);
  const payload = [0x2f, ...u32le(bits), 0, 0, 0, 0];
  const chunk = [...str("VP8L"), ...u32le(payload.length), ...payload];
  return Uint8Array.from([...str("RIFF"), ...u32le(4 + chunk.length), ...str("WEBP"), ...chunk]);
}

function webpVp8x(width: number, height: number): Uint8Array {
  const payload = [0x10, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)];
  const chunk = [...str("VP8X"), ...u32le(payload.length), ...payload, ...str("ALPH"), ...u32le(0)];
  return Uint8Array.from([...str("RIFF"), ...u32le(4 + chunk.length), ...str("WEBP"), ...chunk]);
}

describe("detectImageFormat", () => {
  it("recognises magic bytes", () => {
    expect(detectImageFormat(png(1, 1))).toBe("png");
    expect(detectImageFormat(jpeg(1, 1))).toBe("jpeg");
    expect(detectImageFormat(webpVp8(1, 1))).toBe("webp");
    expect(detectImageFormat(Uint8Array.from(str("GIF89a")))).toBeUndefined();
    expect(detectImageFormat(new Uint8Array(0))).toBeUndefined();
  });
});

describe("detectImage", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(detectImage(png(1440, 2560))).toEqual({ format: "png", mime: "image/png", ext: "png", width: 1440, height: 2560 });
  });

  it("reads JPEG dimensions from SOF0 after skipping other segments", () => {
    expect(detectImage(jpeg(1024, 768))).toMatchObject({ format: "jpeg", mime: "image/jpeg", ext: "jpg", width: 1024, height: 768 });
  });

  it("reads JPEG dimensions from progressive SOF2", () => {
    expect(detectImage(jpeg(333, 222, 0xc2))).toMatchObject({ width: 333, height: 222 });
  });

  it("returns format without size for a truncated JPEG", () => {
    const meta = detectImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]));
    expect(meta).toMatchObject({ format: "jpeg" });
    expect(meta?.width).toBeUndefined();
  });

  it("reads WebP VP8 (lossy) dimensions", () => {
    expect(detectImage(webpVp8(720, 1280))).toMatchObject({ format: "webp", mime: "image/webp", ext: "webp", width: 720, height: 1280 });
  });

  it("reads WebP VP8L (lossless) dimensions", () => {
    expect(detectImage(webpVp8l(2048, 1152))).toMatchObject({ format: "webp", width: 2048, height: 1152 });
  });

  it("reads WebP VP8X (extended) canvas dimensions", () => {
    expect(detectImage(webpVp8x(4096, 4096))).toMatchObject({ format: "webp", width: 4096, height: 4096 });
  });

  it("rejects non-images", () => {
    expect(detectImage(Uint8Array.from(str("%PDF-1.4")))).toBeUndefined();
  });
});
