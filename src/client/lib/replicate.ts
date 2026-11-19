/**
 * Thin Replicate client for the browser (`Authorization: Bearer <Replicate API token>`). Like ByteDance, Replicate is
 * not called from the browser: its API answers browsers from replicate.com only (docs/REPLICATE.md), so each call
 * goes to this site's own pass-through (`/api/replicate/…`, `src/server/replicate-proxy.ts`), which forwards it once
 * to Replicate with the key and keeps nothing. Errors are Replicate's own HTTP statuses with `{ title, detail }`:
 *
 *  - `POST /api/replicate/v1/models/<owner>/<name>/predictions` `{ input }` → a prediction `{ id, status }`.
 *  - `GET  /api/replicate/v1/predictions/<id>` → `status` (`starting`, `processing`, `succeeded`, `failed`,
 *    `canceled`, `aborted`), `output` (a file url or a list of them, on Replicate's CDN for an hour), `error`.
 *  - `GET  /api/replicate/v1/account` → the key's account: the key test (nothing is charged).
 *
 * Images go inline as data URIs; there is no upload (the browser cannot reach Replicate's file API either). A
 * finished file is fetched by the browser itself from `replicate.delivery`, which answers every origin, without the
 * key. The key only ever goes to the pass-through, on this origin.
 */
import { isReplicateFileUrl, isReplicateModel, REPLICATE_PREDICTION_ID, REPLICATE_PROXY_API, REPLICATE_PROXY_MAX_BODY_BYTES } from "@shared/replicate-proxy";
import { ApiClientError, OFFLINE_MESSAGE } from "./errors";
import { abortedError, anySignal } from "./openrouter";

/** Replicate's API, as the browser reaches it: through the pass-through on this origin. */
export const REPLICATE_API = REPLICATE_PROXY_API;
/** Stands in for this origin when checking a url; only the path and query are ever fetched. */
const SAME_ORIGIN = "https://higgsfree.invalid";

export const REPLICATE_KEY_REJECTED = "Replicate rejected the API token";
/** Nothing answered: the browser is offline, or this site's server is down. */
export const REPLICATE_UNREACHABLE = "Could not reach this site's server, which passes Replicate calls on: check your connection";
/** What a copy of the app with no pass-through answers (a static export of it, or a host that only serves files). */
export const REPLICATE_NO_SERVER = "This copy of higgsfree has no server to pass Replicate calls on (Replicate refuses calls from a browser), so Replicate can't run here";

/** Thrown when a url to call is not the pass-through on this origin; the key never goes there. */
export class ReplicateOriginError extends ApiClientError {
  constructor(where: string) {
    super(502, `Refusing to send the Replicate key to ${where}`);
    this.name = "ReplicateOriginError";
  }
}

/** The pass-through path `url` stands for; anything off this origin or outside `/api/replicate/v1/` throws. */
export function assertReplicateOrigin(url: string): string {
  const u = new URL(url, SAME_ORIGIN);
  if (u.origin !== SAME_ORIGIN || !u.pathname.startsWith(`${REPLICATE_API}/`)) throw new ReplicateOriginError(u.origin === SAME_ORIGIN ? u.pathname : u.host);
  return u.pathname + u.search;
}

/**
 * A finished file that is not on Replicate's CDN, the one place the browser reads results from. It ends the job
 * (retrying would not move the file); the link itself still opens in a tab while Replicate keeps it.
 */
export class ReplicateDownloadBlockedError extends ApiClientError {
  constructor(url: string) {
    super(502, `Replicate made the file, but not on a host higgsfree downloads from. It opens in a new tab for about an hour: ${url}`);
    this.name = "ReplicateDownloadBlockedError";
  }
}

/** A failed fetch as an `ApiClientError` that names Replicate: unreachable, timed out or cancelled. */
function replicateAbortedError(signal: AbortSignal, err: unknown, unreachable = REPLICATE_UNREACHABLE): ApiClientError {
  const e = abortedError(signal, err);
  if (e.status === 0) return new ApiClientError(0, unreachable, e.provider);
  if (e.status === 504) return new ApiClientError(504, "Replicate request timed out");
  return e;
}

/** Replicate's `{ title, detail }` (or the pass-through's), as one line; `detail` says more than `title`. */
export function replicateMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { detail, title } = body as { detail?: unknown; title?: unknown };
  if (typeof detail === "string" && detail) return detail.slice(0, 500);
  if (typeof title === "string" && title) return title.slice(0, 500);
  return undefined;
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
  const target = assertReplicateOrigin(url);
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
    throw replicateAbortedError(signal, err);
  }
  if (!res.ok) {
    const message = replicateMessage(body);
    if (res.status === 401) throw new ApiClientError(401, REPLICATE_KEY_REJECTED, body);
    // No JSON error at all: the page a host without the pass-through answers with.
    if (!message && (res.status === 404 || res.status === 405)) throw new ApiClientError(501, REPLICATE_NO_SERVER);
    if (res.status === 402) throw new ApiClientError(402, `Not enough Replicate credit: ${message ?? "add credit at replicate.com/account/billing"}`, body);
    // 422: Replicate refused the input (a field or value the model does not take).
    throw new ApiClientError(res.status === 422 ? 400 : res.status, message ?? `Replicate returned HTTP ${res.status}`, body);
  }
  if (body === undefined) throw new ApiClientError(502, "Replicate returned a non-JSON response");
  return body as T;
}

// ---------- predictions ----------

/** Run an official model (`owner/name`) on `input`; resolves with the prediction's id. */
export async function submit(key: string, model: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  if (!isReplicateModel(model)) throw new ApiClientError(400, `Not a Replicate model: ${model.slice(0, 80)}`);
  const body = JSON.stringify({ input });
  // Images go inline, so a run with large ones can outgrow what the pass-through takes (Vercel's limit, not Replicate's).
  if (new TextEncoder().encode(body).byteLength > REPLICATE_PROXY_MAX_BODY_BYTES) {
    throw new ApiClientError(413, `Too large for Replicate: images go inside the request, which the higgsfree server passes on up to ${REPLICATE_PROXY_MAX_BODY_BYTES / 1024 / 1024} MB. Try smaller images.`);
  }
  const res = await request<{ id?: unknown }>(`${REPLICATE_API}/models/${model}/predictions`, { key, method: "POST", body, timeoutMs: 90_000, signal });
  if (typeof res?.id !== "string" || !res.id) throw new ApiClientError(502, "Replicate did not return a prediction id", res);
  return res.id;
}

/** Where a prediction is polled (stored as the record's polling url): the pass-through's path, on this origin. */
export function taskUrl(id: string): string {
  // The pass-through only polls ids of Replicate's own shape, so nothing in one can reach another path.
  if (!REPLICATE_PREDICTION_ID.test(id)) throw new ApiClientError(502, `Replicate returned a prediction id the app does not recognise: ${id.slice(0, 80)}`);
  return `${REPLICATE_API}/predictions/${id}`;
}

export interface ReplicatePrediction {
  /** `starting`, `processing`, `succeeded`, `failed`, `canceled`, `aborted`. */
  status: string;
  /** The result files once `succeeded`. */
  urls: string[];
  /** Why it failed, written to show as is. */
  error?: string;
}

/** A model answers with one file url, a list of them, or (a few) an object whose values are urls. */
function outputUrls(output: unknown): string[] {
  const isUrl = (v: unknown): v is string => typeof v === "string" && /^https:\/\//.test(v);
  if (isUrl(output)) return [output];
  if (Array.isArray(output)) return output.filter(isUrl);
  if (output && typeof output === "object") return Object.values(output).filter(isUrl);
  return [];
}

export async function prediction(key: string, url: string, signal?: AbortSignal): Promise<ReplicatePrediction> {
  const res = await request<{ status?: unknown; output?: unknown; error?: unknown }>(url, { key, timeoutMs: 30_000, signal });
  const status = String(res?.status ?? "starting").toLowerCase();
  const out: ReplicatePrediction = { status, urls: status === "succeeded" ? outputUrls(res?.output) : [] };
  if (status === "failed") out.error = typeof res?.error === "string" && res.error ? res.error.slice(0, 500) : "Replicate reported the prediction failed";
  if (status === "canceled") out.error = "Replicate cancelled the prediction";
  if (status === "aborted") out.error = "Replicate dropped the prediction before it started";
  return out;
}

// ---------- files ----------

/**
 * Download a result from Replicate's CDN, without the key (the CDN answers every origin). A url anywhere else ends
 * the job with the link (`ReplicateDownloadBlockedError`).
 */
export async function download(url: string, signal?: AbortSignal, timeoutMs = 10 * 60_000): Promise<Blob> {
  if (!isReplicateFileUrl(url)) throw new ReplicateDownloadBlockedError(url);
  const s = anySignal([AbortSignal.timeout(timeoutMs), signal]);
  let res: Response;
  try {
    res = await fetch(url, { signal: s });
  } catch (err) {
    const e = replicateAbortedError(s, err, OFFLINE_MESSAGE.replace("OpenRouter", "Replicate's file host"));
    throw e.status === 504 ? new ApiClientError(504, "Replicate file download timed out") : e;
  }
  if (!res.ok) throw new ApiClientError(502, `Replicate file download failed (HTTP ${res.status})`);
  return res.blob();
}

const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,/i;

/** An image for a request: Replicate takes it inline, as the data URI it already is. */
export function inlineImage(dataUrl: string): string {
  if (!IMAGE_DATA_URL.test(dataUrl)) throw new ApiClientError(400, "Not an image data URL");
  return dataUrl;
}

// ---------- account ----------

/**
 * Resolves when Replicate accepts the key (it reads the key's account, which costs nothing); throws 401 when it does
 * not. Replicate has no balance an API token can read: that is on replicate.com/account/billing.
 */
export async function testKey(key: string): Promise<void> {
  await request<unknown>(`${REPLICATE_API}/account`, { key, timeoutMs: 15_000 });
}
