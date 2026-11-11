/**
 * Thin ByteDance client for the browser: BytePlus ModelArk, ByteDance's own model platform outside China, in region
 * ap-southeast-1 (`Authorization: Bearer <ModelArk API key>`). Unlike every other provider, ModelArk is not called
 * from the browser: it refuses browser calls (docs/BYTEDANCE.md), so each call goes to this site's own pass-through
 * (`/api/bytedance/…`, `src/server/bytedance-proxy.ts`), which forwards it once to ModelArk with the key and keeps
 * nothing. Errors are ModelArk's own HTTP statuses with `{ error: { code, message, type } }`:
 *
 *  - `POST /api/bytedance/v3/contents/generations/tasks` `{ model, content, … }` → `{ id }`.
 *  - `GET  …/contents/generations/tasks/<id>` → `status` (`queued`, `running`, `succeeded`, `failed`, `expired`,
 *    `cancelled`), `content.video_url` (on ModelArk's storage, kept 24 hours), `usage.completion_tokens`, `error`.
 *  - `GET  …/contents/generations/tasks?page_size=1` → the key's tasks: the key test (nothing is charged).
 *  - `POST /api/bytedance/media` `{ url }` → the finished video, read by the server from ModelArk's storage, no key.
 *
 * Images go inline as data URLs; there is no upload. The key only ever goes to the pass-through, on this origin.
 */
import { BYTEDANCE_PROXY_API, BYTEDANCE_PROXY_MAX_BODY_BYTES, BYTEDANCE_PROXY_MEDIA, BYTEDANCE_TASK_ID, isBytedanceFileUrl } from "@shared/bytedance-proxy";
import { BYTEDANCE_VIDEO_MODELS } from "@shared/bytedance-prices";
import type { VideoResolution } from "@shared/types";
import { base64ToBytes } from "./data-url";
import { ApiClientError } from "./errors";
import { detectImage } from "./image-meta";
import { abortedError, anySignal } from "./openrouter";

/** ModelArk's API, as the browser reaches it: through the pass-through on this origin. */
export const BYTEDANCE_API = BYTEDANCE_PROXY_API;
/** Stands in for this origin when checking a url; only the path and query are ever fetched. */
const SAME_ORIGIN = "https://higgsfree.invalid";

/** Where each model is switched on for the account: a model that is not gets `ModelNotOpen`. */
export const BYTEDANCE_ACTIVATE_URL = "https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement";
export const BYTEDANCE_KEY_REJECTED = "ByteDance rejected the API key";
/** Nothing answered: the browser is offline, or this site's server is down. */
export const BYTEDANCE_UNREACHABLE = "Could not reach this site's server, which passes ByteDance calls on: check your connection";
/** What a copy of the app with no pass-through answers (a static export of it, or a host that only serves files). */
export const BYTEDANCE_NO_SERVER = "This copy of higgsfree has no server to pass ByteDance calls on (ModelArk refuses calls from a browser), so ByteDance can't run here";
/** ModelArk's limit on an inline image. A whole request goes up to `BYTEDANCE_PROXY_MAX_BODY_BYTES`, the pass-through's. */
export const BYTEDANCE_MAX_IMAGE_BYTES = 30 * 1024 * 1024;

/** Thrown when a url to call is not the pass-through on this origin; the key never goes there. */
export class BytedanceOriginError extends ApiClientError {
  constructor(where: string) {
    super(502, `Refusing to send the ByteDance key to ${where}`);
    this.name = "BytedanceOriginError";
  }
}

/** The pass-through path and query `url` stands for; anything off this origin or outside `/api/bytedance/v3/` throws. */
export function assertBytedanceOrigin(url: string): string {
  const u = new URL(url, SAME_ORIGIN);
  if (u.origin !== SAME_ORIGIN || !u.pathname.startsWith(`${BYTEDANCE_API}/`)) throw new BytedanceOriginError(u.origin === SAME_ORIGIN ? u.pathname : u.host);
  return u.pathname + u.search;
}

/**
 * A finished video the server would not fetch (a host or redirect off ModelArk's storage). It ends the job: retrying
 * would only spend the link's downloads (Seedance 2.5 allows 100). The link itself still opens in a tab.
 */
export class BytedanceDownloadBlockedError extends ApiClientError {
  constructor(url: string) {
    super(502, `ByteDance made the video, but on a file host the higgsfree server does not download from. It opens in a new tab for 24 hours: ${url}`);
    this.name = "BytedanceDownloadBlockedError";
  }
}

/** A failed fetch as an `ApiClientError` that names ByteDance: unreachable, timed out or cancelled. */
function bytedanceAbortedError(signal: AbortSignal, err: unknown): ApiClientError {
  const e = abortedError(signal, err);
  if (e.status === 0) return new ApiClientError(0, BYTEDANCE_UNREACHABLE, e.provider);
  if (e.status === 504) return new ApiClientError(504, "ByteDance request timed out");
  return e;
}

/** ModelArk's error, in words that say what to do; its own message otherwise. */
export function bytedanceMessage(code: string | undefined, message: string | undefined): string | undefined {
  if (code === "ModelNotOpen" || code === "OperationDenied.ServiceNotOpen" || code === "InvalidEndpointOrModel.NotFound") {
    return `This model is not activated on the BytePlus account. Activate it at ${BYTEDANCE_ACTIVATE_URL}`;
  }
  if (code === "AccountOverdueError") return "The BytePlus account is overdue. Top it up in the BytePlus console.";
  if (code?.endsWith(".PrivacyInformation")) return "ByteDance refused an input: it may show a real person, and Seedance 2.x takes no real faces.";
  return message || code || undefined;
}

/** The `{ error: { code, message } }` ModelArk (or the pass-through) answers with, if that is what came back. */
function errorOf(body: unknown): { code?: string; message?: string } | undefined {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  if (!error || typeof error !== "object") return undefined;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return { ...(typeof code === "string" ? { code } : {}), ...(typeof message === "string" ? { message } : {}) };
}

/** The response's JSON, or undefined when it is empty or not JSON (a host's own error page). */
async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

async function request<T>(url: string, opts: { key: string; method?: "GET" | "POST"; body?: string; timeoutMs?: number; signal?: AbortSignal }): Promise<T> {
  const target = assertBytedanceOrigin(url);
  const signal = anySignal([AbortSignal.timeout(opts.timeoutMs ?? 60_000), opts.signal]);
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(target, {
      method: opts.method ?? "GET",
      headers: opts.body === undefined ? { Authorization: `Bearer ${opts.key}` } : { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" },
      body: opts.body,
      cache: "no-store",
      signal,
    });
    body = await readJson(res);
  } catch (err) {
    throw bytedanceAbortedError(signal, err);
  }
  const error = errorOf(body);
  if (!res.ok) {
    if (res.status === 401) throw new ApiClientError(401, BYTEDANCE_KEY_REJECTED, body);
    // No JSON error at all: the page a host without the pass-through answers with.
    if (!error && (res.status === 404 || res.status === 405)) throw new ApiClientError(501, BYTEDANCE_NO_SERVER);
    throw new ApiClientError(res.status, bytedanceMessage(error?.code, error?.message) ?? `ByteDance returned HTTP ${res.status}`, body);
  }
  if (body === undefined) throw new ApiClientError(502, "ByteDance returned a non-JSON response");
  return body as T;
}

// ---------- videos ----------

/** Submit a video task (`{ model, content, … }`); resolves with its id. */
export async function submitVideo(key: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const body = JSON.stringify(payload);
  // Images go inline, so a run with large ones can outgrow what the pass-through takes (Vercel's limit, not ModelArk's).
  if (new TextEncoder().encode(body).byteLength > BYTEDANCE_PROXY_MAX_BODY_BYTES) {
    throw new ApiClientError(413, `Too large for ByteDance: images go inside the request, which the higgsfree server passes on up to ${BYTEDANCE_PROXY_MAX_BODY_BYTES / 1024 / 1024} MB. Try smaller images.`);
  }
  const res = await request<{ id?: unknown }>(`${BYTEDANCE_API}/contents/generations/tasks`, { key, method: "POST", body, timeoutMs: 90_000, signal });
  if (typeof res?.id !== "string" || !res.id) throw new ApiClientError(502, "ByteDance did not return a task id", res);
  return res.id;
}

/** Where a task is polled (stored as the record's polling url): the pass-through's path, on this origin. */
export function taskUrl(id: string): string {
  // The pass-through only polls ids of ModelArk's own shape (`cgt-…`), so nothing in one can reach another path.
  if (!BYTEDANCE_TASK_ID.test(id)) throw new ApiClientError(502, `ByteDance returned a task id the app does not recognise: ${id.slice(0, 80)}`);
  return `${BYTEDANCE_API}/contents/generations/tasks/${id}`;
}

export interface BytedanceTask {
  /** `queued`, `running`, `succeeded`, `failed`, `expired`, `cancelled`. */
  status: string;
  /** The video once `succeeded`. */
  urls: string[];
  /** USD for the tokens ModelArk billed, at the model's rate for the resolution. */
  costUsd?: number;
  /** Why it failed, written to show as is. */
  error?: string;
}

/** ModelArk spells 4K `4k`. */
const appResolution = (r: unknown): VideoResolution | undefined => (typeof r === "string" ? ((r === "4k" ? "4K" : r) as VideoResolution) : undefined);

export async function task(key: string, url: string, signal?: AbortSignal): Promise<BytedanceTask> {
  const res = await request<{
    model?: unknown;
    status?: unknown;
    resolution?: unknown;
    content?: { video_url?: unknown } | null;
    usage?: { completion_tokens?: unknown } | null;
    error?: { code?: unknown; message?: unknown } | null;
  }>(url, { key, timeoutMs: 30_000, signal });
  const status = String(res?.status ?? "queued").toLowerCase();
  const video = res?.content?.video_url;
  const out: BytedanceTask = { status, urls: typeof video === "string" && video ? [video] : [] };
  const tokens = res?.usage?.completion_tokens;
  const resolution = appResolution(res?.resolution);
  const rate = typeof res?.model === "string" && resolution ? BYTEDANCE_VIDEO_MODELS[res.model]?.usdPerMTokens[resolution] : undefined;
  if (typeof tokens === "number" && tokens > 0 && rate !== undefined) out.costUsd = (tokens * rate) / 1_000_000;
  if (status === "failed") {
    const e = res?.error;
    out.error = bytedanceMessage(typeof e?.code === "string" ? e.code : undefined, typeof e?.message === "string" ? e.message : undefined) ?? "ByteDance reported the task failed";
  }
  if (status === "expired") out.error = "ByteDance's task expired before it finished";
  if (status === "cancelled") out.error = "ByteDance cancelled the task";
  return out;
}

/** What the pass-through answers when it will not fetch a url (`src/server/bytedance-proxy.ts`). */
const MEDIA_REFUSED = new Set(["HostNotAllowed", "RedirectNotAllowed"]);

/**
 * Download a result through the pass-through (ModelArk's storage lets no browser read it), without the key. A url the
 * server will not fetch ends the job with the link (`BytedanceDownloadBlockedError`).
 */
export async function download(url: string, signal?: AbortSignal, timeoutMs = 10 * 60_000): Promise<Blob> {
  if (!isBytedanceFileUrl(url)) throw new BytedanceDownloadBlockedError(url);
  const s = anySignal([AbortSignal.timeout(timeoutMs), signal]);
  let res: Response;
  try {
    res = await fetch(BYTEDANCE_PROXY_MEDIA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), cache: "no-store", signal: s });
  } catch (err) {
    const e = bytedanceAbortedError(s, err);
    throw e.status === 504 ? new ApiClientError(504, "ByteDance file download timed out") : e;
  }
  if (!res.ok) {
    const error = errorOf(await readJson(res).catch(() => undefined));
    if (error?.code && MEDIA_REFUSED.has(error.code)) throw new BytedanceDownloadBlockedError(url);
    if (!error && (res.status === 404 || res.status === 405)) throw new ApiClientError(501, BYTEDANCE_NO_SERVER);
    throw new ApiClientError(502, `ByteDance file download failed (${error?.message ?? `HTTP ${res.status}`})`);
  }
  return res.blob();
}

// ---------- inputs ----------

const IMAGE_DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,/i;
/** Enough base64 to hold the size header of a PNG, a WebP and nearly every JPEG (a multiple of 4 characters). */
const HEADER_CHARS = 256 * 1024;

/**
 * An image for a request: ModelArk takes it inline, as `data:image/<format>;base64,…` with the format in lower case.
 * Its limits for a video's images are checked here (300 to 6000 px a side, width over height from 0.4 to 2.5), since
 * the browser cannot read ModelArk's own refusal.
 */
export function inlineImage(dataUrl: string): string {
  const m = IMAGE_DATA_URL.exec(dataUrl);
  if (!m?.[1]) throw new ApiClientError(400, "Not an image data URL");
  const payload = dataUrl.slice(m[0].length);
  if ((payload.length * 3) / 4 > BYTEDANCE_MAX_IMAGE_BYTES) throw new ApiClientError(413, "ByteDance takes images up to 30 MB");
  const meta = detectImage(base64ToBytes(payload.slice(0, HEADER_CHARS)));
  if (meta?.width && meta.height) {
    const { width, height } = meta;
    if (Math.min(width, height) < 300 || Math.max(width, height) > 6000) throw new ApiClientError(400, `ByteDance takes images of 300 to 6000 px a side, not ${width}×${height}`);
    const ratio = width / height;
    if (ratio < 0.4 || ratio > 2.5) throw new ApiClientError(400, `ByteDance takes images from 2:5 to 5:2, not ${width}×${height}`);
  }
  return `data:${m[1].toLowerCase()};base64,${payload}`;
}

// ---------- account ----------

/**
 * Resolves when ModelArk accepts the key (it lists the key's video tasks, which costs nothing); throws 401 when it
 * does not. ModelArk has no balance an API key can read: that needs the BytePlus console.
 */
export async function testKey(key: string): Promise<void> {
  await request<unknown>(`${BYTEDANCE_API}/contents/generations/tasks?page_size=1`, { key, timeoutMs: 15_000 });
}
