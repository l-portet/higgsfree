/**
 * Thin APIMart client for the browser (`Authorization: Bearer <APIMart key>`). Errors are HTTP statuses with
 * `{ error: { message, type } }`. Every endpoint the app calls allows cross-origin requests:
 *
 *  - `POST https://api.apimart.ai/v1/videos/generations` / `/v1/images/generations` `{ model, prompt, … }`
 *    → `data[0].task_id` (every image and video is a task).
 *  - `GET  https://api.apimart.ai/v1/tasks/<id>` → `status`, `result.videos|images[0].url[]`, `cost` (USD).
 *  - `GET  https://api.apimart.ai/v1/balance` → `remain_balance` (USD): the key test.
 *  - `POST https://api.apimart.ai/v1/uploads/images` (multipart `file`) → a public `url`, kept 72 h: models
 *    take images by url. APIMart also has `/v1/uploads/videos` and `/audios` (since Nov 2026); the app uses neither.
 *
 * The key only ever goes to `api.apimart.ai`. Results come from `upload.apimart.ai` without it.
 */
import { parseDataUrl } from "./data-url";
import { ApiClientError, OFFLINE_MESSAGE } from "./errors";
import { abortedError, anySignal } from "./openrouter";

export const APIMART_API = "https://api.apimart.ai";
const KEY_HOSTS = new Set(["api.apimart.ai"]);

export const APIMART_KEY_REJECTED = "APIMart rejected the API key";
/** APIMart's limit on an uploaded image. */
export const APIMART_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Thrown when a url to call is off APIMart's API host; the key never goes there. */
export class ApimartOriginError extends ApiClientError {
  constructor(host: string) {
    super(502, `Refusing to send the APIMart key to ${host}`);
    this.name = "ApimartOriginError";
  }
}

export function assertApimartOrigin(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "https:" || !KEY_HOSTS.has(u.hostname)) throw new ApimartOriginError(u.host);
  return u.toString();
}

/** A failed fetch as an `ApiClientError` that names APIMart: unreachable, timed out or cancelled. */
function apimartAbortedError(signal: AbortSignal, err: unknown, unreachable: string): ApiClientError {
  const e = abortedError(signal, err);
  if (e.status === 0) return new ApiClientError(0, unreachable, e.provider);
  if (e.status === 504) return new ApiClientError(504, "APIMart request timed out");
  return e;
}

/** `{ error: { message } }`, `{ message }` or `{ error: "…" }`. */
function apimartMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 500) || undefined : undefined;
  const b = body as { error?: unknown; message?: unknown };
  if (b.error && typeof b.error === "object" && typeof (b.error as { message?: unknown }).message === "string") return (b.error as { message: string }).message;
  if (typeof b.error === "string") return b.error;
  if (typeof b.message === "string") return b.message;
  return undefined;
}

interface ApimartRequest {
  key: string;
  method?: "GET" | "POST";
  /** JSON, or a form for the upload. */
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(url: string, opts: ApimartRequest): Promise<T> {
  const target = assertApimartOrigin(url);
  const signal = anySignal([AbortSignal.timeout(opts.timeoutMs ?? 60_000), opts.signal]);
  const form = opts.body instanceof FormData;
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(target, {
      method: opts.method ?? "GET",
      headers: form ? { Authorization: `Bearer ${opts.key}` } : { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : form ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal,
    });
    const text = await res.text();
    body = text ? JSON.parse(text) : undefined;
  } catch (err) {
    if (err instanceof SyntaxError) throw new ApiClientError(502, "APIMart returned a non-JSON response");
    throw apimartAbortedError(signal, err, "APIMart unreachable");
  }
  if (!res.ok) {
    const msg = apimartMessage(body) ?? `APIMart returned HTTP ${res.status}`;
    if (res.status === 401) throw new ApiClientError(401, APIMART_KEY_REJECTED, body);
    // PixVerse says "quota_not_enough" with a 403.
    if (res.status === 402 || (res.status === 403 && /quota/i.test(msg))) throw new ApiClientError(402, `Not enough APIMart balance: ${msg}`, body);
    throw new ApiClientError(res.status === 422 ? 400 : res.status, msg, body);
  }
  return body as T;
}

// ---------- jobs ----------

/** Submit a video or image task; resolves with its id. */
export async function submit(key: string, kind: "videos" | "images", body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const res = await request<{ data?: unknown }>(`${APIMART_API}/v1/${kind}/generations`, { key, method: "POST", body, timeoutMs: 90_000, signal });
  // `data: [{ task_id }]`, or (a newer response version) `data: { id }`.
  const data = res?.data;
  const first = Array.isArray(data) ? (data[0] as { task_id?: unknown } | undefined) : undefined;
  const id = first?.task_id ?? (data && typeof data === "object" && !Array.isArray(data) ? (data as { id?: unknown }).id : undefined);
  if (typeof id !== "string" || !id) throw new ApiClientError(502, "APIMart did not return a task id", res);
  return id;
}

/** Where a task is polled (stored as the record's polling url). */
export function taskUrl(taskId: string): string {
  return `${APIMART_API}/v1/tasks/${encodeURIComponent(taskId)}`;
}

export interface ApimartTask {
  /** `pending`, `submitted`, `processing`, `in_progress`, `completed`, `failed`, `cancelled`. */
  status: string;
  /** Result urls once `completed`. */
  urls: string[];
  /** USD charged (`cost`), when APIMart says. */
  costUsd?: number;
  /** Why it failed. */
  error?: string;
}

/** `result.videos[].url` / `result.images[].url`: each `url` an array of strings (or one string). */
export function resultUrls(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const r = result as { videos?: unknown; images?: unknown };
  const items = [...(Array.isArray(r.videos) ? r.videos : []), ...(Array.isArray(r.images) ? r.images : [])] as { url?: unknown }[];
  return items.flatMap((i) => (Array.isArray(i?.url) ? i.url : [i?.url])).filter((u): u is string => typeof u === "string" && u.length > 0);
}

export async function task(key: string, url: string, signal?: AbortSignal): Promise<ApimartTask> {
  const res = await request<{ data?: { status?: unknown; result?: unknown; cost?: unknown; error?: unknown } }>(url, { key, timeoutMs: 30_000, signal });
  const data = res?.data ?? {};
  const out: ApimartTask = { status: String(data.status ?? "pending").toLowerCase(), urls: resultUrls(data.result) };
  if (typeof data.cost === "number" && data.cost > 0) out.costUsd = data.cost;
  if (out.status === "failed" || out.status === "cancelled") out.error = apimartMessage({ error: data.error }) ?? `APIMart reported the task ${out.status}`;
  return out;
}

// ---------- files ----------

/** Upload an image given as a data URL; resolves with its public url (kept 72 h). */
export async function uploadImage(key: string, dataUrl: string, signal?: AbortSignal): Promise<string> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new ApiClientError(400, "Not an image data URL");
  const { bytes } = parsed;
  if (bytes.byteLength > APIMART_MAX_UPLOAD_BYTES) throw new ApiClientError(413, `APIMart takes images up to ${APIMART_MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  const ext = parsed.mime.split("/")[1] ?? "png";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: parsed.mime }), `input.${ext}`);
  const res = await request<{ url?: unknown }>(`${APIMART_API}/v1/uploads/images`, { key, method: "POST", body: form, timeoutMs: 120_000, signal });
  if (typeof res?.url !== "string" || !res.url.startsWith("https://")) throw new ApiClientError(502, "APIMart did not return an upload url", res);
  return res.url;
}

/** Download an output file (public url, no key). */
export async function download(url: string, signal?: AbortSignal, timeoutMs = 10 * 60_000): Promise<Blob> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new ApiClientError(502, "APIMart returned a non-https file url");
  const s = anySignal([AbortSignal.timeout(timeoutMs), signal]);
  let res: Response;
  try {
    res = await fetch(u.toString(), { signal: s });
  } catch (err) {
    throw apimartAbortedError(s, err, OFFLINE_MESSAGE.replace("OpenRouter", "APIMart"));
  }
  if (!res.ok) throw new ApiClientError(502, `APIMart file download failed (HTTP ${res.status})`);
  return res.blob();
}

// ---------- account ----------

/** The key's remaining balance in USD when APIMart accepts it (−1: unlimited). Throws 401 when it does not. */
export async function testKey(key: string): Promise<{ balanceUsd: number }> {
  const res = await request<{ success?: unknown; remain_balance?: unknown; message?: unknown }>(`${APIMART_API}/v1/balance`, { key, timeoutMs: 15_000 });
  if (res?.success === false) throw new ApiClientError(401, typeof res.message === "string" ? res.message : APIMART_KEY_REJECTED, res);
  const balance = typeof res?.remain_balance === "number" ? res.remain_balance : Number(res?.remain_balance);
  return { balanceUsd: Number.isFinite(balance) ? balance : 0 };
}
