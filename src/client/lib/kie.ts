/**
 * Thin kie.ai client for the browser (`Authorization: Bearer <kie key>`). kie answers HTTP 200 and puts
 * the outcome in the body's `code` (200 ok, 401 key, 402 credits, 422 bad request, 429 rate limit, 455
 * maintenance, 5xx failure). Every host the app calls allows cross-origin requests:
 *
 *  - `POST https://api.kie.ai/api/v1/jobs/createTask { model, input }` → `data.taskId` (images and videos).
 *  - `GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=` → `state`, `resultJson` (a JSON string), `creditsConsumed`.
 *  - `GET  https://api.kie.ai/api/v1/chat/credit` → the balance in credits: the key test.
 *  - `POST https://kieai.redpandaai.co/api/file-base64-upload` (images) and `/api/file-stream-upload`
 *    (videos) → a public `downloadUrl`, kept 24 h: models take their inputs by url only.
 *
 * The key only ever goes to those two hosts. Results come from kie's CDN (`*.aiquickdraw.com`) without it.
 */
import { ApiClientError, OFFLINE_MESSAGE } from "./errors";
import { abortedError, anySignal } from "./openrouter";

export const KIE_API = "https://api.kie.ai";
export const KIE_UPLOAD = "https://kieai.redpandaai.co";
const KEY_HOSTS = new Set(["api.kie.ai", "kieai.redpandaai.co"]);

/** One credit, in USD (kie's own rate). */
export const KIE_CREDIT_USD = 0.005;
export const KIE_KEY_REJECTED = "kie.ai rejected the API key";
/** The app's limit on a video sent to kie (the library's own); kie documents none for stream uploads. */
export const KIE_MAX_UPLOAD_BYTES = 90 * 1024 * 1024;
/** Folder the inputs are uploaded to (kie deletes them after 24 h). */
const UPLOAD_PATH = "higgsfree";

/** Thrown when a url to call is off kie's API hosts; the key never goes there. */
export class KieOriginError extends ApiClientError {
  constructor(host: string) {
    super(502, `Refusing to send the kie.ai key to ${host}`);
    this.name = "KieOriginError";
  }
}

export function assertKieOrigin(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "https:" || !KEY_HOSTS.has(u.hostname)) throw new KieOriginError(u.host);
  return u.toString();
}

interface Envelope<T> {
  code?: unknown;
  msg?: unknown;
  data?: T;
}

/** kie's body `code` as an HTTP-like status: 401 / 402 / 429 kept, a bad request 400, maintenance 503, the rest 502. */
function statusFor(code: number): number {
  if (code === 401 || code === 403) return 401;
  if (code === 402 || code === 429) return code;
  if (code === 400 || code === 404 || code === 422) return 400;
  if (code === 455) return 503;
  return 502;
}

/** A failed fetch as an `ApiClientError` that names kie.ai: unreachable, timed out or cancelled. */
export function kieAbortedError(signal: AbortSignal, err: unknown, unreachable: string): ApiClientError {
  const e = abortedError(signal, err);
  if (e.status === 0) return new ApiClientError(0, unreachable, e.provider);
  if (e.status === 504) return new ApiClientError(504, "kie.ai request timed out");
  return e;
}

interface KieRequest {
  key: string;
  method?: "GET" | "POST";
  /** JSON, or a form for the stream upload. */
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(url: string, opts: KieRequest): Promise<T> {
  const target = assertKieOrigin(url);
  const signal = anySignal([AbortSignal.timeout(opts.timeoutMs ?? 60_000), opts.signal]);
  const form = opts.body instanceof FormData;
  let res: Response;
  let body: Envelope<T> | undefined;
  try {
    res = await fetch(target, {
      method: opts.method ?? "GET",
      headers: form ? { Authorization: `Bearer ${opts.key}` } : { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : form ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal,
    });
    const text = await res.text();
    body = text ? (JSON.parse(text) as Envelope<T>) : undefined;
  } catch (err) {
    if (err instanceof SyntaxError) throw new ApiClientError(502, "kie.ai returned a non-JSON response");
    throw kieAbortedError(signal, err, "kie.ai unreachable");
  }
  const code = typeof body?.code === "number" ? body.code : res.ok ? 200 : res.status;
  if (code !== 200) {
    const status = statusFor(code);
    if (status === 401) throw new ApiClientError(401, KIE_KEY_REJECTED, body);
    const msg = typeof body?.msg === "string" && body.msg ? body.msg : `kie.ai returned code ${code}`;
    throw new ApiClientError(status, status === 402 ? `Not enough kie.ai credits: ${msg}` : msg, body);
  }
  return body?.data as T;
}

// ---------- jobs ----------

/** Create a task; resolves with its id. */
export async function createTask(key: string, model: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const data = await request<{ taskId?: unknown }>(`${KIE_API}/api/v1/jobs/createTask`, { key, method: "POST", body: { model, input }, timeoutMs: 90_000, signal });
  if (typeof data?.taskId !== "string" || !data.taskId) throw new ApiClientError(502, "kie.ai did not return a task id", data);
  return data.taskId;
}

/** Where a task is polled (stored as the record's polling url). */
export function taskUrl(taskId: string): string {
  return `${KIE_API}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
}

export interface KieTask {
  /** `waiting`, `queuing`, `generating`, `success`, `fail`. */
  state: string;
  /** Result urls once `success`. */
  urls: string[];
  /** USD charged (`creditsConsumed` × $0.005), when kie says. */
  costUsd?: number;
  /** Why it failed, once `fail`. */
  error?: string;
}

/** The result urls: `resultUrls` (most models), `result_urls`, or Veo's `data.result_urls` at 1080p / 4K. */
export function resultUrls(resultJson: unknown): string[] {
  let parsed: unknown = resultJson;
  if (typeof resultJson === "string") {
    try {
      parsed = JSON.parse(resultJson);
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== "object") return [];
  const r = parsed as { resultUrls?: unknown; result_urls?: unknown; data?: { result_urls?: unknown } };
  const list = r.data?.result_urls ?? r.resultUrls ?? r.result_urls;
  return Array.isArray(list) ? list.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
}

export async function task(key: string, url: string, signal?: AbortSignal): Promise<KieTask> {
  const data = await request<{ state?: unknown; resultJson?: unknown; failMsg?: unknown; failCode?: unknown; creditsConsumed?: unknown }>(url, { key, timeoutMs: 30_000, signal });
  const out: KieTask = { state: String(data?.state ?? "waiting").toLowerCase(), urls: resultUrls(data?.resultJson) };
  const credits = typeof data?.creditsConsumed === "number" ? data.creditsConsumed : Number.NaN;
  if (Number.isFinite(credits) && credits > 0) out.costUsd = Math.round(credits * KIE_CREDIT_USD * 10_000) / 10_000;
  if (out.state === "fail") {
    const msg = typeof data?.failMsg === "string" && data.failMsg ? data.failMsg : undefined;
    out.error = msg ?? `kie.ai reported a failure${data?.failCode ? ` (code ${String(data.failCode)})` : ""}`;
  }
  return out;
}

// ---------- files ----------

interface Uploaded {
  downloadUrl?: unknown;
}

function uploadedUrl(data: Uploaded | undefined): string {
  if (typeof data?.downloadUrl !== "string" || !data.downloadUrl.startsWith("https://")) throw new ApiClientError(502, "kie.ai did not return an upload url", data);
  return data.downloadUrl;
}

/** Upload an image given as a data URL; resolves with its public url (kept 24 h). */
export async function uploadDataUrl(key: string, dataUrl: string, signal?: AbortSignal): Promise<string> {
  const data = await request<Uploaded>(`${KIE_UPLOAD}/api/file-base64-upload`, { key, method: "POST", body: { base64Data: dataUrl, uploadPath: UPLOAD_PATH }, timeoutMs: 120_000, signal });
  return uploadedUrl(data);
}

/** Upload a file (a video); resolves with its public url (kept 24 h). */
export async function uploadFile(key: string, blob: Blob, fileName: string, signal?: AbortSignal): Promise<string> {
  if (blob.size > KIE_MAX_UPLOAD_BYTES) throw new ApiClientError(413, `kie.ai uploads are limited to ${KIE_MAX_UPLOAD_BYTES / 1024 / 1024} MB here`);
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("uploadPath", UPLOAD_PATH);
  const data = await request<Uploaded>(`${KIE_UPLOAD}/api/file-stream-upload`, { key, method: "POST", body: form, timeoutMs: 10 * 60_000, signal });
  return uploadedUrl(data);
}

/** Download an output file (public CDN url, no key). */
export async function download(url: string, signal?: AbortSignal, timeoutMs = 10 * 60_000): Promise<Blob> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new ApiClientError(502, "kie.ai returned a non-https file url");
  const s = anySignal([AbortSignal.timeout(timeoutMs), signal]);
  let res: Response;
  try {
    res = await fetch(u.toString(), { signal: s });
  } catch (err) {
    throw kieAbortedError(s, err, OFFLINE_MESSAGE.replace("OpenRouter", "kie.ai"));
  }
  if (!res.ok) throw new ApiClientError(502, `kie.ai file download failed (HTTP ${res.status})`);
  return res.blob();
}

// ---------- account ----------

/** The balance in credits when kie accepts the key. Throws 401 when it does not. */
export async function testKey(key: string): Promise<{ credits: number }> {
  const data = await request<unknown>(`${KIE_API}/api/v1/chat/credit`, { key, timeoutMs: 15_000 });
  const credits = typeof data === "number" ? data : Number(data);
  return { credits: Number.isFinite(credits) ? credits : 0 };
}
