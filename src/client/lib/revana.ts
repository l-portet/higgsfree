/**
 * Thin Revana client for the browser (`Authorization: Bearer <Revana key>`). Errors are HTTP statuses with
 * `{ error: { code, message } }`. Every endpoint allows cross-origin requests (`Access-Control-Allow-Origin: *`):
 *
 *  - `POST https://api.revana.si/v1/generations` `{ model, input }` → a generation `{ id, status: "queued" }`.
 *  - `GET  https://api.revana.si/v1/generations/<id>` → `status` (`queued`, `running`, `succeeded`, `failed`),
 *    `output.urls` (its own `/content` links, read with the key), `cost_usd`, `error.message`.
 *  - `GET  https://api.revana.si/v1/balance` → `available_usd`: the key test.
 *  - `POST https://api.revana.si/v1/uploads` `{ content_type, bytes, filename }` → a presigned `upload_url` to PUT
 *    the bytes to (with exactly `upload_headers`), and `url`, a keyless link to pass as an input (kept 14 days).
 *
 * The key only ever goes to `api.revana.si`. A result's `/content` link answers a redirect to a short-lived file url,
 * which the browser follows without the key.
 */
import { parseDataUrl } from "./data-url";
import { ApiClientError, OFFLINE_MESSAGE } from "./errors";
import { abortedError, anySignal } from "./openrouter";

export const REVANA_API = "https://api.revana.si";
const KEY_HOSTS = new Set(["api.revana.si"]);

export const REVANA_KEY_REJECTED = "Revana rejected the API key";
/** Revana's limits on an upload, by kind. */
export const REVANA_MAX_UPLOAD_BYTES = { image: 30 * 1024 * 1024, video: 50 * 1024 * 1024, audio: 15 * 1024 * 1024 };

/** Thrown when a url to call is off Revana's API host; the key never goes there. */
export class RevanaOriginError extends ApiClientError {
  constructor(host: string) {
    super(502, `Refusing to send the Revana key to ${host}`);
    this.name = "RevanaOriginError";
  }
}

export function assertRevanaOrigin(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "https:" || !KEY_HOSTS.has(u.hostname)) throw new RevanaOriginError(u.host);
  return u.toString();
}

/** A failed fetch as an `ApiClientError` that names Revana: unreachable, timed out or cancelled. */
function revanaAbortedError(signal: AbortSignal, err: unknown, unreachable: string): ApiClientError {
  const e = abortedError(signal, err);
  if (e.status === 0) return new ApiClientError(0, unreachable, e.provider);
  if (e.status === 504) return new ApiClientError(504, "Revana request timed out");
  return e;
}

/** `{ error: { message } }`, `{ message }` or `{ error: "…" }`. */
export function revanaMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 500) || undefined : undefined;
  const b = body as { error?: unknown; message?: unknown };
  if (b.error && typeof b.error === "object" && typeof (b.error as { message?: unknown }).message === "string") return (b.error as { message: string }).message;
  if (typeof b.error === "string") return b.error;
  if (typeof b.message === "string") return b.message;
  return undefined;
}

async function request<T>(url: string, opts: { key: string; method?: "GET" | "POST"; body?: unknown; timeoutMs?: number; signal?: AbortSignal }): Promise<T> {
  const target = assertRevanaOrigin(url);
  const signal = anySignal([AbortSignal.timeout(opts.timeoutMs ?? 60_000), opts.signal]);
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(target, {
      method: opts.method ?? "GET",
      headers: opts.body === undefined ? { Authorization: `Bearer ${opts.key}` } : { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal,
    });
    const text = await res.text();
    body = text ? JSON.parse(text) : undefined;
  } catch (err) {
    if (err instanceof SyntaxError) throw new ApiClientError(502, "Revana returned a non-JSON response");
    throw revanaAbortedError(signal, err, "Revana unreachable");
  }
  if (!res.ok) {
    const msg = revanaMessage(body) ?? `Revana returned HTTP ${res.status}`;
    if (res.status === 401) throw new ApiClientError(401, REVANA_KEY_REJECTED, body);
    if (res.status === 402) throw new ApiClientError(402, `Not enough Revana credit: ${msg}`, body);
    throw new ApiClientError(res.status === 422 ? 400 : res.status, msg, body);
  }
  return body as T;
}

// ---------- jobs ----------

/** Submit a generation; resolves with its id. */
export async function submit(key: string, model: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const res = await request<{ id?: unknown }>(`${REVANA_API}/v1/generations`, { key, method: "POST", body: { model, input }, timeoutMs: 90_000, signal });
  if (typeof res?.id !== "string" || !res.id) throw new ApiClientError(502, "Revana did not return a generation id", res);
  return res.id;
}

/** Where a generation is polled (stored as the record's polling url). */
export function taskUrl(id: string): string {
  return `${REVANA_API}/v1/generations/${encodeURIComponent(id)}`;
}

export interface RevanaGeneration {
  /** `queued`, `running`, `succeeded`, `failed`. */
  status: string;
  /** The result files once `succeeded` (Revana's `/content` links). */
  urls: string[];
  /** USD charged, once it succeeded. */
  costUsd?: number;
  /** Why it failed: Revana's message, written to show as is. */
  error?: string;
}

export async function generation(key: string, url: string, signal?: AbortSignal): Promise<RevanaGeneration> {
  const res = await request<{ status?: unknown; output?: { urls?: unknown } | null; cost_usd?: unknown; error?: unknown }>(url, { key, timeoutMs: 30_000, signal });
  const urls = Array.isArray(res?.output?.urls) ? res.output.urls.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
  const out: RevanaGeneration = { status: String(res?.status ?? "queued").toLowerCase(), urls };
  if (typeof res?.cost_usd === "number" && res.cost_usd > 0) out.costUsd = res.cost_usd;
  if (out.status === "failed") out.error = revanaMessage({ error: res?.error }) ?? "Revana reported the generation failed";
  return out;
}

// ---------- files ----------

/** Upload bytes as an input; resolves with the keyless link to pass to a generation. */
export async function upload(key: string, blob: Blob, fileName: string, signal?: AbortSignal): Promise<string> {
  const type = blob.type || "application/octet-stream";
  const kind = type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : "image";
  const max = REVANA_MAX_UPLOAD_BYTES[kind];
  if (blob.size > max) throw new ApiClientError(413, `Revana takes ${kind === "audio" ? "audio" : `${kind}s`} up to ${max / 1024 / 1024} MB`);
  const res = await request<{ url?: unknown; upload_url?: unknown; upload_headers?: unknown }>(`${REVANA_API}/v1/uploads`, {
    key,
    method: "POST",
    body: { content_type: type, bytes: blob.size, filename: fileName.slice(0, 200) },
    timeoutMs: 30_000,
    signal,
  });
  if (typeof res?.url !== "string" || !res.url.startsWith("https://") || typeof res.upload_url !== "string") {
    throw new ApiClientError(502, "Revana did not return an upload link", res);
  }
  const target = new URL(res.upload_url);
  if (target.protocol !== "https:") throw new ApiClientError(502, "Revana returned a non-https upload link");
  // A presigned url: the key is not sent. `upload_headers` are signed (the type and size), so they go as given.
  const headers: Record<string, string> = {};
  if (res.upload_headers && typeof res.upload_headers === "object") {
    for (const [k, v] of Object.entries(res.upload_headers as Record<string, unknown>)) {
      // The browser sets Content-Length itself and refuses it as a header.
      if (typeof v === "string" && k.toLowerCase() !== "content-length") headers[k] = v;
    }
  }
  const putSignal = anySignal([AbortSignal.timeout(10 * 60_000), signal]);
  let put: Response;
  try {
    put = await fetch(target.toString(), { method: "PUT", body: blob, headers, signal: putSignal });
  } catch (err) {
    throw revanaAbortedError(putSignal, err, "Revana upload unreachable");
  }
  if (!put.ok) throw new ApiClientError(502, `Revana upload failed (HTTP ${put.status})`);
  return res.url;
}

/** Upload an image given as a data URL. */
export async function uploadImage(key: string, dataUrl: string, signal?: AbortSignal): Promise<string> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new ApiClientError(400, "Not an image data URL");
  const ext = parsed.mime.split("/")[1] ?? "png";
  return upload(key, new Blob([parsed.bytes], { type: parsed.mime }), `input.${ext}`, signal);
}

/** Download a result: its `/content` link with the key, which redirects to the file. */
export async function download(url: string, signal?: AbortSignal, key?: string, timeoutMs = 10 * 60_000): Promise<Blob> {
  const target = assertRevanaOrigin(url);
  if (!key) throw new ApiClientError(401, "No Revana key to download the result with");
  const s = anySignal([AbortSignal.timeout(timeoutMs), signal]);
  let res: Response;
  try {
    res = await fetch(target, { headers: { Authorization: `Bearer ${key}` }, signal: s });
  } catch (err) {
    throw revanaAbortedError(s, err, OFFLINE_MESSAGE.replace("OpenRouter", "Revana"));
  }
  if (!res.ok) throw new ApiClientError(502, `Revana file download failed (HTTP ${res.status})`);
  return res.blob();
}

// ---------- account ----------

/** The key's available balance in USD when Revana accepts it. Throws 401 when it does not. */
export async function testKey(key: string): Promise<{ balanceUsd: number }> {
  const res = await request<{ available_usd?: unknown }>(`${REVANA_API}/v1/balance`, { key, timeoutMs: 15_000 });
  const balance = typeof res?.available_usd === "number" ? res.available_usd : Number(res?.available_usd);
  return { balanceUsd: Number.isFinite(balance) ? balance : 0 };
}
