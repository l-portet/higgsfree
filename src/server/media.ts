/** Media files on disk: outputs (`gen_<id>.<ext>`) and uploads (`up_<id>.<ext>`). */
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { MediaRef } from "../shared/types.ts";
import { config } from "./config.ts";
import { badRequest, payloadTooLarge } from "./errors.ts";
import { detectImage, IMAGE_MIME, type ImageFormat } from "./image-meta.ts";
import { parseMp4MetaFromFile } from "./mp4-meta.ts";

export const MEDIA_PREFIX = "/media/";
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function isSafeMediaName(name: string): boolean {
  return SAFE_NAME.test(name) && name !== "." && name !== ".." && !name.startsWith(".");
}

/** Resolve a public media file name to an absolute path inside the media dir (or undefined if unsafe). */
export function resolveMediaPath(name: string): string | undefined {
  if (!isSafeMediaName(name)) return undefined;
  const dir = name.startsWith("up_") ? config.uploadsDir : config.mediaDir;
  const full = path.resolve(dir, name);
  const rel = path.relative(config.mediaDir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
  return full;
}

export function mimeForFile(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function mediaUrlToPath(url: string): string | undefined {
  if (!url.startsWith(MEDIA_PREFIX)) return undefined;
  const name = url.slice(MEDIA_PREFIX.length).split(/[?#]/)[0] ?? "";
  return resolveMediaPath(name);
}

export function newUploadId(): string {
  return `up_${nanoid(12)}`;
}

// ---------- data URLs ----------

export function parseDataUrl(s: string): { mime: string; bytes: Uint8Array } | undefined {
  if (!s.startsWith("data:")) return undefined;
  const comma = s.indexOf(",");
  if (comma < 0) return undefined;
  const header = s.slice(5, comma);
  const payload = s.slice(comma + 1);
  const parts = header.split(";");
  const mime = parts[0] || "application/octet-stream";
  const isBase64 = parts.includes("base64");
  let bytes: Buffer;
  if (isBase64) {
    bytes = Buffer.from(payload, "base64");
  } else {
    try {
      bytes = Buffer.from(decodeURIComponent(payload), "utf8");
    } catch {
      return undefined; // malformed percent-encoding; callers map this to a 400
    }
  }
  return { mime, bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
}

export function toDataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

// ---------- writing ----------

async function writeFile(file: string, bytes: Uint8Array): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, bytes);
  await fs.promises.rename(tmp, file);
}

function imageRef(url: string, bytes: Uint8Array, meta: { format: ImageFormat; width?: number; height?: number }): MediaRef {
  const ref: MediaRef = { url, mime: IMAGE_MIME[meta.format], bytes: bytes.byteLength };
  if (meta.width !== undefined) ref.width = meta.width;
  if (meta.height !== undefined) ref.height = meta.height;
  return ref;
}

/** Persist an image as a generation output. Throws 400-style error when not a supported image. */
export async function saveImageOutput(id: string, bytes: Uint8Array): Promise<MediaRef> {
  const meta = detectImage(bytes);
  if (!meta) throw new Error("Provider returned data that is not a PNG, JPEG or WebP image");
  const name = `${id}.${meta.ext}`;
  await writeFile(path.join(config.mediaDir, name), bytes);
  return imageRef(`${MEDIA_PREFIX}${name}`, bytes, meta);
}

/**
 * Where a video download is streamed to before it is published. Dot-prefixed so
 * `isSafeMediaName` never lets a half-written file be served.
 */
export function videoDownloadPath(id: string): string {
  return path.join(config.mediaDir, `.${id}.${process.pid}.part`);
}

/** Publish a fully downloaded video file (moved into place, never read into memory). */
export async function saveVideoOutput(id: string, sourceFile: string, durationHint?: number): Promise<MediaRef> {
  const name = `${id}.mp4`;
  const file = path.join(config.mediaDir, name);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.rename(sourceFile, file);
  const { size } = await fs.promises.stat(file);
  const ref: MediaRef = { url: `${MEDIA_PREFIX}${name}`, mime: "video/mp4", bytes: size };
  const meta = await parseMp4MetaFromFile(file);
  if (meta.width !== undefined) ref.width = meta.width;
  if (meta.height !== undefined) ref.height = meta.height;
  const dur = meta.durationSec ?? durationHint;
  if (dur !== undefined) ref.durationSec = dur;
  return ref;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Persist an uploaded image (png/jpg/webp only, ≤ 25 MB). */
export async function saveUpload(bytes: Uint8Array): Promise<MediaRef> {
  if (bytes.byteLength === 0) throw badRequest("Empty file");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw payloadTooLarge("File exceeds the 25 MB upload limit");
  const meta = detectImage(bytes);
  if (!meta) throw badRequest("Unsupported file type. Only PNG, JPEG and WebP images are accepted.");
  const name = `${newUploadId()}.${meta.ext}`;
  await writeFile(path.join(config.uploadsDir, name), bytes);
  return imageRef(`${MEDIA_PREFIX}${name}`, bytes, meta);
}

// ---------- reading ----------

export async function mediaExists(url: string): Promise<boolean> {
  const file = mediaUrlToPath(url);
  if (!file) return false;
  try {
    return (await fs.promises.stat(file)).isFile();
  } catch {
    return false;
  }
}

/** Read a `/media/...` url from disk and return it as a base64 data URL (for OpenRouter). */
export async function mediaUrlToDataUrl(url: string): Promise<string> {
  const file = mediaUrlToPath(url);
  if (!file) throw badRequest(`Invalid media url: ${url}`);
  let bytes: Buffer;
  try {
    bytes = await fs.promises.readFile(file);
  } catch {
    throw badRequest(`Media file not found: ${url}`);
  }
  const meta = detectImage(bytes);
  return toDataUrl(meta?.mime ?? mimeForFile(file), bytes);
}

/**
 * Normalize a reference input: data URLs are persisted as uploads and replaced by
 * their `/media/...` url (the DB never stores base64); `/media/...` urls are verified.
 */
export async function normalizeInputUrl(input: string, label = "image"): Promise<string> {
  const v = input.trim();
  if (v.startsWith("data:")) {
    const parsed = parseDataUrl(v);
    if (!parsed) throw badRequest(`Malformed data URL for ${label}`);
    return (await saveUpload(parsed.bytes)).url;
  }
  if (v.startsWith(MEDIA_PREFIX)) {
    if (!(await mediaExists(v))) throw badRequest(`${label} not found: ${v}`);
    return v;
  }
  throw badRequest(`${label} must be a data URL or an uploaded /media/... url`);
}

export async function deleteMediaUrl(url: string | undefined): Promise<void> {
  if (!url) return;
  const file = mediaUrlToPath(url);
  if (!file) return;
  await removeFile(file);
}

export async function removeFile(file: string): Promise<void> {
  try {
    await fs.promises.unlink(file);
  } catch {
    /* already gone */
  }
}

/** Names this module writes and later renames away: `.<id>.<pid>.part` (video downloads), `<file>.<pid>.tmp` (atomic writes). */
const TEMP_FILE = /^(?:\..+\.\d+\.part|.+\.\d+\.tmp)$/;

/**
 * Delete download / write temp files a previous process left behind (a crash
 * mid-download leaves `.gen_x.<pid>.part` in the media dir forever). Only files
 * older than `minAgeMs` go; anything younger may still be in flight. Synchronous
 * on purpose: it runs once, at boot, before any job is resumed. Returns the count.
 */
export function sweepTempFiles(minAgeMs = 5_000): number {
  const cutoff = Date.now() - minAgeMs;
  let removed = 0;
  for (const dir of [config.mediaDir, config.uploadsDir]) {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue; // not created yet
    }
    for (const name of names) {
      if (!TEMP_FILE.test(name)) continue;
      const file = path.join(dir, name);
      try {
        const st = fs.statSync(file);
        if (!st.isFile() || st.mtimeMs > cutoff) continue;
        fs.unlinkSync(file);
        removed++;
      } catch {
        /* vanished meanwhile */
      }
    }
  }
  return removed;
}

/** Uploaded inputs (`/media/up_*`) referenced by a generation. */
export function inputMediaUrls(inputs: { referenceImages?: string[]; firstFrame?: string; lastFrame?: string } | undefined): string[] {
  if (!inputs) return [];
  const urls = [...(inputs.referenceImages ?? []), inputs.firstFrame, inputs.lastFrame];
  return [...new Set(urls.filter((u): u is string => typeof u === "string" && u.startsWith(`${MEDIA_PREFIX}up_`)))];
}
