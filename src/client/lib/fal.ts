/**
 * Thin fal client for the browser (`Authorization: Key <fal key>`). Every fal endpoint the app
 * calls allows cross-origin requests:
 *
 *  - `POST https://fal.run/<endpoint>` runs a job and answers with the result (images).
 *  - `POST https://queue.fal.run/<endpoint>` queues a job; its `status_url` and `response_url`
 *    are polled until the job completes (videos).
 *  - `POST https://rest.fal.ai/storage/upload/initiate` then `PUT` to the returned url uploads a
 *    file and gives back a public `file_url` (the motion-control reference video).
 *  - `GET https://api.fal.ai/v1/models/pricing` is the cheapest authenticated call: key test.
 *
 * The key only ever goes to those four hosts. Outputs are public CDN urls fetched without it.
 */
import { ApiClientError, OFFLINE_MESSAGE } from "./errors";
import { errorMessage } from "./log";
import { abortedError, anySignal } from "./openrouter";

export const FAL_RUN = "https://fal.run";
export const FAL_QUEUE = "https://queue.fal.run";
export const FAL_REST = "https://rest.fal.ai";
export const FAL_API = "https://api.fal.ai";
const KEY_HOSTS = new Set(["fal.run", "queue.fal.run", "rest.fal.ai", "api.fal.ai"]);

export const FAL_KEY_REJECTED = "fal rejected the API key";
/** fal uploads above this go through a multipart flow the app does not implement. */
export const FAL_MAX_UPLOAD_BYTES = 90 * 1024 * 1024;

/** Thrown when fal hands back a url off its own API hosts; the key never goes there. */
export class FalOriginError extends ApiClientError {
  constructor(host: string) {
    super(502, `Refusing to send the fal key to ${host}`);
    this.name = "FalOriginError";
  }
}

export function assertFalOrigin(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "https:" || !KEY_HOSTS.has(u.hostname)) throw new FalOriginError(u.host);
  return u.toString();
}

/** fal's error bodies: `{ detail: "…" }`, `{ detail: [{ msg, loc }] }`, `{ message }` or `{ error: { message } }`. */
export function falMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body.trim().slice(0, 500) || undefined;
  if (!body || typeof body !== "object") return undefined;
  const b = body as { detail?: unknown; message?: unknown; error?: unknown };
  if (typeof b.detail === "string") return b.detail;
  if (Array.isArray(b.detail)) {
    const parts = b.detail
      .map((d: unknown) => {
        const e = d as { msg?: unknown; loc?: unknown };
        const loc = Array.isArray(e.loc) ? e.loc.filter((x) => x !== "body").join(".") : "";
        return typeof e.msg === "string" ? (loc ? `${loc}: ${e.msg}` : e.msg) : undefined;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (typeof b.message === "string") return b.message;
  if (b.error && typeof b.error === "object" && typeof (b.error as { message?: unknown }).message === "string") return (b.error as { message: string }).message;
  if (typeof b.error === "string") return b.error;
  return undefined;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

interface FalRequest {
  key: string;
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(url: string, opts: FalRequest): Promise<T> {
  const target = assertFalOrigin(url);
  const signal = anySignal([AbortSignal.timeout(opts.timeoutMs ?? 60_000), opts.signal]);
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(target, {
      method: opts.method ?? "GET",
      headers: { Authorization: `Key ${opts.key}`, "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal,
    });
    body = await readBody(res);
  } catch (err) {
    const e = abortedError(signal, err);
    throw e.status === 0 ? new ApiClientError(0, "fal unreachable", e.provider) : e;
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new ApiClientError(401, FAL_KEY_REJECTED, body);
    throw new ApiClientError(res.status, falMessage(body) ?? `fal returned HTTP ${res.status}`, body);
  }
  if (body === null || typeof body !== "object") throw new ApiClientError(502, "fal returned a non-JSON response", body);
  return body as T;
}

// ---------- jobs ----------

/** Run a job and wait for its result in the same request (images; up to 10 minutes). */
export function run<T extends object>(key: string, endpoint: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return request<T>(`${FAL_RUN}/${endpoint}`, { key, method: "POST", body: input, timeoutMs: 10 * 60_000, signal });
}

export interface FalQueued {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

export async function submit(key: string, endpoint: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<FalQueued> {
  const res = await request<{ request_id?: string; status_url?: string; response_url?: string }>(`${FAL_QUEUE}/${endpoint}`, {
    key,
    method: "POST",
    body: input,
    timeoutMs: 90_000,
    signal,
  });
  if (!res.request_id || !res.status_url) throw new ApiClientError(502, "fal did not return a request id / status url", res);
  const statusUrl = assertFalOrigin(res.status_url);
  return { requestId: res.request_id, statusUrl, responseUrl: responseUrlFor(statusUrl, res.response_url) };
}

/** The result url: what fal said, or the status url without `/status`. */
export function responseUrlFor(statusUrl: string, given?: string): string {
  return assertFalOrigin(given ?? statusUrl.replace(/\/status\/?$/, ""));
}

export interface FalStatus {
  /** `IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`. */
  status: string;
  /** Set when a completed job failed. */
  error?: string;
}

export async function status(key: string, statusUrl: string, signal?: AbortSignal): Promise<FalStatus> {
  const res = await request<{ status?: unknown; error?: unknown; error_type?: unknown }>(statusUrl, { key, timeoutMs: 30_000, signal });
  const out: FalStatus = { status: String(res.status ?? "IN_QUEUE").toUpperCase() };
  if (res.error !== undefined && res.error !== null) out.error = typeof res.error === "string" ? res.error : (falMessage(res.error) ?? errorMessage(res.error));
  return out;
}

export function result<T extends object>(key: string, responseUrl: string, signal?: AbortSignal): Promise<T> {
  return request<T>(responseUrl, { key, timeoutMs: 60_000, signal });
}

/** Ask fal to stop a queued job (best effort: a job already running may still finish and be billed). */
export async function cancel(key: string, statusUrl: string): Promise<void> {
  await request<object>(`${responseUrlFor(statusUrl)}/cancel`, { key, method: "PUT", timeoutMs: 15_000 });
}

// ---------- files ----------

/** Upload a file to fal's CDN and return its public url. */
export async function upload(key: string, blob: Blob, fileName: string, signal?: AbortSignal): Promise<string> {
  if (blob.size > FAL_MAX_UPLOAD_BYTES) throw new ApiClientError(413, `fal uploads are limited to ${FAL_MAX_UPLOAD_BYTES / 1024 / 1024} MB here`);
  const contentType = blob.type || "application/octet-stream";
  const init = await request<{ upload_url?: string; file_url?: string }>(`${FAL_REST}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
    key,
    method: "POST",
    body: { content_type: contentType, file_name: fileName },
    timeoutMs: 30_000,
    signal,
  });
  if (!init.upload_url || !init.file_url) throw new ApiClientError(502, "fal did not return an upload url", init);
  const target = new URL(init.upload_url);
  if (target.protocol !== "https:") throw new ApiClientError(502, "fal returned a non-https upload url");
  const putSignal = anySignal([AbortSignal.timeout(10 * 60_000), signal]);
  let res: Response;
  try {
    // A presigned url: the key is not sent.
    res = await fetch(target.toString(), { method: "PUT", body: blob, headers: { "Content-Type": contentType }, signal: putSignal });
  } catch (err) {
    throw abortedError(putSignal, err);
  }
  if (!res.ok) throw new ApiClientError(502, `fal upload failed (HTTP ${res.status})`, await readBody(res).catch(() => undefined));
  return init.file_url;
}

/** Download an output file (public CDN url, no key). */
export async function download(url: string, signal?: AbortSignal, timeoutMs = 10 * 60_000): Promise<Blob> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new ApiClientError(502, "fal returned a non-https file url");
  const s = anySignal([AbortSignal.timeout(timeoutMs), signal]);
  let res: Response;
  try {
    res = await fetch(u.toString(), { signal: s });
  } catch (err) {
    const e = abortedError(s, err);
    throw e.status === 0 ? new ApiClientError(0, OFFLINE_MESSAGE.replace("OpenRouter", "fal"), e.provider) : e;
  }
  if (!res.ok) throw new ApiClientError(502, `fal file download failed (HTTP ${res.status})`);
  return res.blob();
}

// ---------- account ----------

/** True when fal accepts the key (an authenticated pricing lookup). Throws 401 when it does not. */
/** Thrown when the key works but may not read the account's billing (a key without `billing:usage:read`). */
export const FAL_BALANCE_FORBIDDEN = "This fal key cannot read the balance (it needs billing access)";

/**
 * The account's credit balance in USD (`GET /v1/account/billing?expand=credits` → `credits.current_balance`). A key
 * made for running models only may lack the billing permission: that is a 403 with `FAL_BALANCE_FORBIDDEN`, not a
 * rejected key.
 */
export async function balance(key: string, signal?: AbortSignal): Promise<{ usd: number }> {
  const url = assertFalOrigin(`${FAL_API}/v1/account/billing?expand=credits`);
  const s = anySignal([AbortSignal.timeout(15_000), signal]);
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(url, { headers: { Authorization: `Key ${key}` }, signal: s });
    body = await readBody(res);
  } catch (err) {
    const e = abortedError(s, err);
    throw e.status === 0 ? new ApiClientError(0, "fal unreachable", e.provider) : e;
  }
  if (res.status === 401) throw new ApiClientError(401, FAL_KEY_REJECTED, body);
  if (res.status === 403) throw new ApiClientError(403, FAL_BALANCE_FORBIDDEN, body);
  if (!res.ok) throw new ApiClientError(res.status, falMessage(body) ?? `fal returned HTTP ${res.status}`, body);
  const credits = body && typeof body === "object" ? (body as { credits?: { current_balance?: unknown } }).credits : undefined;
  const usd = typeof credits?.current_balance === "number" ? credits.current_balance : Number(credits?.current_balance);
  if (!Number.isFinite(usd)) throw new ApiClientError(502, "fal returned no balance", body);
  return { usd };
}

export async function testKey(key: string): Promise<void> {
  await request<object>(`${FAL_API}/v1/models/pricing?endpoint_id=fal-ai/flux/schnell`, { key, timeoutMs: 15_000 });
}
