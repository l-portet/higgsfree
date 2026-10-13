/**
 * Media files: outputs (`gen_<id>.<ext>`) and uploads (`up_<id>.<ext>`), behind one
 * small store interface with two backends:
 *
 *  - local: files under `DATA_DIR/media` (uploads in `media/uploads`), served by the
 *    `/media/:file` route; urls are `/media/<name>`.
 *  - blob:  Vercel Blob (a public store, picked when `BLOB_READ_WRITE_TOKEN` is set);
 *    urls are absolute `https://<store>.public.blob.vercel-storage.com/media/…`.
 *
 * The pure helpers (data urls, name checks) are shared by both.
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { BlobNotFoundError, del, head, put } from "@vercel/blob";
import { nanoid } from "nanoid";
import type { MediaRef } from "../shared/types.ts";
import { config } from "./config.ts";
import { badRequest, payloadTooLarge } from "./errors.ts";
import { detectImage, IMAGE_MIME, type ImageFormat } from "./image-meta.ts";
import { errorMessage, log } from "./log.ts";
import { parseMp4Meta, parseMp4MetaFromFile, parseMp4MetaFromRanges, type Mp4Meta } from "./mp4-meta.ts";

export const MEDIA_PREFIX = "/media/";
/** Every public Vercel Blob store serves from this domain. */
export const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
/** Blob pathnames: `media/gen_<id>.<ext>` for outputs, `media/uploads/up_<id>.<ext>` for uploads. */
export const BLOB_PREFIX = "media/";
export const BLOB_UPLOAD_PREFIX = "media/uploads/";
/** Media never change once written. */
export const IMMUTABLE_MAX_AGE = 31536000;
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

/** Resolve a public media file name to an absolute path inside the local media dir (or undefined if unsafe). */
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

/** Local backend: `/media/<name>` → absolute path. */
export function mediaUrlToPath(url: string): string | undefined {
  if (!url.startsWith(MEDIA_PREFIX)) return undefined;
  const name = url.slice(MEDIA_PREFIX.length).split(/[?#]/)[0] ?? "";
  return resolveMediaPath(name);
}

export function isBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** The `gen_*` / `up_*` file name behind a media url from either backend; undefined for anything else. */
export function mediaName(url: string): string | undefined {
  let name: string | undefined;
  if (url.startsWith(MEDIA_PREFIX)) {
    name = url.slice(MEDIA_PREFIX.length).split(/[?#]/)[0];
  } else if (isBlobUrl(url)) {
    const p = new URL(url).pathname.slice(1);
    if (p.startsWith(BLOB_UPLOAD_PREFIX)) name = p.slice(BLOB_UPLOAD_PREFIX.length);
    else if (p.startsWith(BLOB_PREFIX)) name = p.slice(BLOB_PREFIX.length);
  }
  if (!name || !isSafeMediaName(name)) return undefined;
  return name.startsWith("gen_") || name.startsWith("up_") ? name : undefined;
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

// ---------- the store ----------

export interface MediaStore {
  readonly kind: "local" | "blob";
  /** Shown in Settings › Storage: the data directory or the blob store. */
  readonly location: string;
  /** Returns the public url. */
  saveImage(name: string, bytes: Uint8Array, mime: string): Promise<string>;
  /** Streams `body` into storage without buffering it; returns the url, size and what the `moov` box says. */
  saveVideo(name: string, body: ReadableStream<Uint8Array>): Promise<{ url: string; bytes: number; meta: Mp4Meta }>;
  /** Whole file, or undefined when it does not exist (or is not ours). */
  read(url: string): Promise<Uint8Array | undefined>;
  exists(url: string): Promise<boolean>;
  remove(url: string): Promise<void>;
}

async function writeFileAtomic(file: string, bytes: Uint8Array): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, bytes);
  await fs.promises.rename(tmp, file);
}

/**
 * Where a video download is streamed to before it is published. Dot-prefixed so
 * `isSafeMediaName` never lets a half-written file be served.
 */
export function videoDownloadPath(id: string): string {
  return path.join(config.mediaDir, `.${id}.${process.pid}.part`);
}

function localStore(): MediaStore {
  const dirFor = (name: string): string => (name.startsWith("up_") ? config.uploadsDir : config.mediaDir);
  return {
    kind: "local",
    location: config.dataDir,
    async saveImage(name, bytes) {
      await writeFileAtomic(path.join(dirFor(name), name), bytes);
      return `${MEDIA_PREFIX}${name}`;
    },
    async saveVideo(name, body) {
      const file = path.join(config.mediaDir, name);
      const part = videoDownloadPath(name.replace(/\.[^.]+$/, ""));
      await fs.promises.mkdir(config.mediaDir, { recursive: true });
      try {
        await pipeline(Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>), fs.createWriteStream(part));
      } catch (err) {
        await removeFile(part);
        throw err;
      }
      await fs.promises.rename(part, file);
      const { size } = await fs.promises.stat(file);
      return { url: `${MEDIA_PREFIX}${name}`, bytes: size, meta: await parseMp4MetaFromFile(file) };
    },
    async read(url) {
      const file = mediaUrlToPath(url);
      if (!file) return undefined;
      try {
        return new Uint8Array(await fs.promises.readFile(/* turbopackIgnore: true */ file));
      } catch {
        return undefined;
      }
    },
    async exists(url) {
      const file = mediaUrlToPath(url);
      if (!file) return false;
      try {
        return (await fs.promises.stat(/* turbopackIgnore: true */ file)).isFile();
      } catch {
        return false;
      }
    },
    async remove(url) {
      const file = mediaUrlToPath(url);
      if (file) await removeFile(file);
    },
  };
}

/** Store id out of `vercel_blob_rw_<store>_<secret>`, for the Settings page only. */
function blobStoreLabel(token: string | undefined): string {
  const m = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(token ?? "");
  return m ? `Vercel Blob · store ${m[1]}` : "Vercel Blob";
}

function blobStore(): MediaStore {
  const pathFor = (name: string): string => (name.startsWith("up_") ? `${BLOB_UPLOAD_PREFIX}${name}` : `${BLOB_PREFIX}${name}`);
  const ours = (url: string): boolean => isBlobUrl(url) && mediaName(url) !== undefined;
  const common = { access: "public" as const, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: IMMUTABLE_MAX_AGE };
  return {
    kind: "blob",
    location: blobStoreLabel(config.blobToken),
    async saveImage(name, bytes, mime) {
      const res = await put(pathFor(name), Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { ...common, contentType: mime });
      return res.url;
    },
    async saveVideo(name, body) {
      const res = await put(pathFor(name), body, { ...common, contentType: "video/mp4", multipart: true });
      const info = await head(res.url);
      // The moov box via Range requests; a CDN that answers 200 instead of 206 is read once and sliced.
      let whole: Uint8Array | undefined;
      const meta = await parseMp4MetaFromRanges(info.size, async (start, end) => {
        if (whole) return whole.subarray(start, end + 1);
        const r = await fetch(res.url, { headers: { range: `bytes=${start}-${end}` }, cache: "no-store" });
        if (!r.ok) throw new Error(`range read failed: HTTP ${r.status}`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (r.status === 206) return bytes;
        whole = bytes;
        return whole.subarray(start, end + 1);
      });
      return { url: res.url, bytes: info.size, meta: whole ? parseMp4Meta(whole) : meta };
    },
    async read(url) {
      if (!ours(url)) return undefined;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return undefined;
      return new Uint8Array(await r.arrayBuffer());
    },
    async exists(url) {
      if (!ours(url)) return false;
      try {
        await head(url);
        return true;
      } catch (err) {
        if (err instanceof BlobNotFoundError) return false;
        throw err;
      }
    },
    async remove(url) {
      if (!ours(url)) return;
      try {
        await del(url);
      } catch (err) {
        log.warn(`blob delete failed for ${url}: ${errorMessage(err)}`);
      }
    },
  };
}

let store: MediaStore | undefined;

export function mediaStore(): MediaStore {
  if (!store) {
    if (config.storage === "local" && config.onVercel) {
      throw new Error("No media storage configured: connect a public Vercel Blob store (BLOB_READ_WRITE_TOKEN); the filesystem is read-only on Vercel");
    }
    store = config.storage === "blob" ? blobStore() : localStore();
  }
  return store;
}

/** Settings page label; never throws. */
export function storageLocation(): string {
  return config.storage === "blob" ? blobStoreLabel(config.blobToken) : config.dataDir;
}

// ---------- writing ----------

function imageRef(url: string, bytes: Uint8Array, meta: { format: ImageFormat; width?: number; height?: number }): MediaRef {
  const ref: MediaRef = { url, mime: IMAGE_MIME[meta.format], bytes: bytes.byteLength };
  if (meta.width !== undefined) ref.width = meta.width;
  if (meta.height !== undefined) ref.height = meta.height;
  return ref;
}

/** Persist an image as a generation output. Throws when the bytes are not a supported image. */
export async function saveImageOutput(id: string, bytes: Uint8Array): Promise<MediaRef> {
  const meta = detectImage(bytes);
  if (!meta) throw new Error("Provider returned data that is not a PNG, JPEG or WebP image");
  const url = await mediaStore().saveImage(`${id}.${meta.ext}`, bytes, meta.mime);
  return imageRef(url, bytes, meta);
}

/** Publish a video download (streamed, never read into memory). */
export async function saveVideoOutput(id: string, body: ReadableStream<Uint8Array>, durationHint?: number): Promise<MediaRef> {
  const { url, bytes, meta } = await mediaStore().saveVideo(`${id}.mp4`, body);
  const ref: MediaRef = { url, mime: "video/mp4", bytes };
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
  const url = await mediaStore().saveImage(`${newUploadId()}.${meta.ext}`, bytes, meta.mime);
  return imageRef(url, bytes, meta);
}

// ---------- reading ----------

export async function mediaExists(url: string): Promise<boolean> {
  if (mediaName(url) === undefined) return false;
  return mediaStore().exists(url);
}

/** Read one of our media urls and return it as a base64 data URL (for OpenRouter). */
export async function mediaUrlToDataUrl(url: string): Promise<string> {
  const name = mediaName(url);
  if (name === undefined) throw badRequest(`Invalid media url: ${url}`);
  const bytes = await mediaStore().read(url);
  if (!bytes) throw badRequest(`Media file not found: ${url}`);
  const meta = detectImage(bytes);
  return toDataUrl(meta?.mime ?? mimeForFile(name), bytes);
}

/**
 * Normalize a reference input: data URLs are persisted as uploads and replaced by
 * their media url (the DB never stores base64); media urls are verified to exist.
 */
export async function normalizeInputUrl(input: string, label = "image"): Promise<string> {
  const v = input.trim();
  if (v.startsWith("data:")) {
    const parsed = parseDataUrl(v);
    if (!parsed) throw badRequest(`Malformed data URL for ${label}`);
    return (await saveUpload(parsed.bytes)).url;
  }
  if (mediaName(v) !== undefined) {
    if (!(await mediaExists(v))) throw badRequest(`${label} not found: ${v}`);
    return v;
  }
  throw badRequest(`${label} must be a data URL or an uploaded media url`);
}

export async function deleteMediaUrl(url: string | undefined): Promise<void> {
  if (!url || mediaName(url) === undefined) return;
  await mediaStore().remove(url);
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
 * Local backend only: delete download / write temp files a previous process left
 * behind (a crash mid-download leaves `.gen_x.<pid>.part` in the media dir forever).
 * Only files older than `minAgeMs` go; anything younger may still be in flight.
 * Synchronous on purpose: it runs once per process, before any job is advanced.
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

/** Uploaded inputs (`up_*`) referenced by a generation, from either backend. */
export function inputMediaUrls(inputs: { referenceImages?: string[]; firstFrame?: string; lastFrame?: string } | undefined): string[] {
  if (!inputs) return [];
  const urls = [...(inputs.referenceImages ?? []), inputs.firstFrame, inputs.lastFrame];
  return [...new Set(urls.filter((u): u is string => typeof u === "string" && (mediaName(u)?.startsWith("up_") ?? false)))];
}
