/** Thin OpenRouter client: every non-2xx becomes an `HttpError` carrying the provider body verbatim. */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "./config.ts";
import { HttpError } from "./errors.ts";
import { errorMessage, log } from "./log.ts";
import type { ChatImageBody, ImagesGenerationsBody, VideoBody } from "./payloads.ts";

/** Overridable for tests / proxies (`OPENROUTER_BASE_URL`); defaults to the real API. */
export const OPENROUTER_BASE = (process.env.OPENROUTER_BASE_URL ?? "").trim().replace(/\/+$/, "") || "https://openrouter.ai";

function headers(key: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": config.appUrl,
    "X-Title": config.appName,
  };
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

/** Thrown when a provider-supplied url points off OpenRouter; retrying cannot fix it. */
export class ForeignOriginError extends HttpError {
  constructor(host: string) {
    super(502, `Refusing to send the API key to ${host}`);
    this.name = "ForeignOriginError";
  }
}

/**
 * Resolve a url OpenRouter handed us (`polling_url`, content urls) against the API
 * base and refuse anything on another origin: the Bearer key goes only to OpenRouter.
 */
export function assertProviderOrigin(url: string): string {
  const target = new URL(url, OPENROUTER_BASE);
  if (target.origin !== new URL(OPENROUTER_BASE).origin) throw new ForeignOriginError(target.host);
  return target.toString();
}

/** Message of the 502 an upstream 401 becomes; the provider body rides along. */
export const KEY_REJECTED = "OpenRouter rejected the API key";

export const isKeyRejected = (err: unknown): boolean => err instanceof HttpError && err.status === 502 && err.message === KEY_REJECTED;

/**
 * Non-2xx from OpenRouter: 4xx passes through with its status (the client can act
 * on a 400 / 429), 401 and every 5xx become our 502 so they are never mistaken for
 * a problem with this server's own auth or code.
 */
function providerError(status: number, body: unknown, prefix = ""): HttpError {
  if (status === 401) return new HttpError(502, `${prefix}${KEY_REJECTED}`, body);
  return new HttpError(status >= 500 ? 502 : status, `${prefix}${providerMessage(body, status)}`, body);
}

function providerMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown; message?: unknown };
    if (b.error && typeof b.error === "object" && typeof (b.error as { message?: unknown }).message === "string") {
      return (b.error as { message: string }).message;
    }
    if (typeof b.error === "string") return b.error;
    if (typeof b.message === "string") return b.message;
  }
  if (typeof body === "string" && body.trim()) return body.slice(0, 500);
  return `OpenRouter returned HTTP ${status}`;
}

/** Verbatim provider error text: strings as-is, `{message}` objects unwrapped, anything else JSON. */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") {
      const code = (e as { code?: unknown }).code;
      return code !== undefined ? `${m} (${String(code)})` : m;
    }
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
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

interface RequestOptions {
  key?: string;
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  /** Extra accepted statuses besides 2xx. */
  accept?: number[];
}

async function request<T extends object>(url: string, opts: RequestOptions): Promise<{ status: number; body: T }> {
  const target = assertProviderOrigin(url);
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(target, {
      method: opts.method ?? "GET",
      headers: headers(opts.key),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
    body = await readBody(res);
  } catch (err) {
    throw new HttpError(502, `OpenRouter request failed: ${errorMessage(err)}`);
  }
  if (!res.ok && !(opts.accept ?? []).includes(res.status)) throw providerError(res.status, body);
  // Callers read fields off the body; an empty or text body must be a 502, not a TypeError.
  if (body === null || typeof body !== "object") throw new HttpError(502, "OpenRouter returned a non-JSON response", body);
  return { status: res.status, body: body as T };
}

// ---------- images ----------

export interface ChatImageResult {
  dataUrl: string;
  costUsd?: number;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown; images?: { image_url?: { url?: string } }[] } }[];
  usage?: { cost?: number };
  error?: unknown;
}

export async function chatImage(key: string, body: ChatImageBody): Promise<ChatImageResult> {
  const { body: res } = await request<ChatCompletionResponse>("/api/v1/chat/completions", { key, method: "POST", body, timeoutMs: 6 * 60_000 });
  if (res.error) throw new HttpError(502, providerMessage(res, 502), res);
  const message = res.choices?.[0]?.message;
  const url = message?.images?.[0]?.image_url?.url;
  if (!url) {
    const text = typeof message?.content === "string" ? message.content.trim() : "";
    throw new HttpError(502, text ? `Model returned no image: ${text.slice(0, 400)}` : "Model returned no image", res);
  }
  const out: ChatImageResult = { dataUrl: url };
  if (typeof res.usage?.cost === "number") out.costUsd = res.usage.cost;
  return out;
}

export interface ImagesGenerationsResult {
  b64: string;
  costUsd?: number;
}

interface ImagesGenerationsResponse {
  data?: { b64_json?: string; url?: string }[];
  usage?: { cost?: number };
  error?: unknown;
}

export async function imagesGenerations(key: string, body: ImagesGenerationsBody): Promise<ImagesGenerationsResult> {
  const { body: res } = await request<ImagesGenerationsResponse>("/api/v1/images/generations", { key, method: "POST", body, timeoutMs: 6 * 60_000 });
  if (res.error) throw new HttpError(502, providerMessage(res, 502), res);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new HttpError(502, "Model returned no image", res);
  const out: ImagesGenerationsResult = { b64 };
  if (typeof res.usage?.cost === "number") out.costUsd = res.usage.cost;
  return out;
}

// ---------- videos ----------

export interface VideoSubmitResult {
  id: string;
  pollingUrl: string;
  status?: string;
}

interface VideoSubmitResponse {
  id?: string;
  polling_url?: string;
  status?: string;
  error?: unknown;
}

/** Submit returns HTTP 202 (accept 200 and 202). */
export async function submitVideo(key: string, body: VideoBody): Promise<VideoSubmitResult> {
  const { body: res } = await request<VideoSubmitResponse>("/api/v1/videos", { key, method: "POST", body, timeoutMs: 90_000, accept: [200, 202] });
  if (res.error) throw new HttpError(502, providerMessage(res, 502), res);
  if (!res.id || !res.polling_url) throw new HttpError(502, "OpenRouter did not return a job id / polling url", res);
  const out: VideoSubmitResult = { id: res.id, pollingUrl: assertProviderOrigin(res.polling_url) };
  if (typeof res.status === "string") out.status = res.status;
  return out;
}

export interface VideoPollResult {
  status: string;
  urls: string[];
  costUsd?: number;
  error?: string;
  raw: unknown;
}

interface VideoPollResponse {
  status?: string;
  unsigned_urls?: string[];
  urls?: string[];
  usage?: { cost?: number };
  error?: unknown;
  message?: unknown;
}

export async function pollVideo(key: string, pollingUrl: string): Promise<VideoPollResult> {
  const { body: res } = await request<VideoPollResponse>(pollingUrl, { key, timeoutMs: 30_000 });
  const urls = [...(res.unsigned_urls ?? []), ...(res.urls ?? [])].filter((u): u is string => typeof u === "string" && u.length > 0);
  const out: VideoPollResult = { status: String(res.status ?? "pending").toLowerCase(), urls, raw: res };
  if (typeof res.usage?.cost === "number") out.costUsd = res.usage.cost;
  if (res.error !== undefined || res.message !== undefined) out.error = errorText(res.error ?? res.message);
  return out;
}

export interface DownloadLimits {
  /** Abort when no chunk arrives for this long. */
  idleMs?: number;
  /** Abort when the whole download takes longer than this. */
  maxMs?: number;
}
export const DOWNLOAD_IDLE_MS = 60_000;
export const DOWNLOAD_MAX_MS = 30 * 60_000;

/**
 * The content url is NOT public; it needs the Bearer header. Returns the body as a
 * stream (never buffered: a 4K clip must not sit in RAM) that fails when it stalls
 * (`idleMs` without a chunk) or blows the generous overall cap (`maxMs`); a whole-body
 * deadline would restart a big clip from zero on every poll tick. Every failure
 * surfaces on the stream as a 502 `HttpError`.
 */
export async function openVideoStream(key: string, url: string, limits: DownloadLimits = {}): Promise<ReadableStream<Uint8Array>> {
  const target = assertProviderOrigin(url);
  const idleMs = limits.idleMs ?? DOWNLOAD_IDLE_MS;
  const maxMs = limits.maxMs ?? DOWNLOAD_MAX_MS;
  const controller = new AbortController();
  const overall = setTimeout(() => controller.abort(new Error(`download exceeded ${Math.round(maxMs / 60_000)} minutes`)), maxMs);
  let idle: NodeJS.Timeout | undefined;
  const touch = (): void => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(new Error(`no data received for ${Math.round(idleMs / 1000)} seconds`)), idleMs);
  };
  const stop = (): void => {
    clearTimeout(overall);
    clearTimeout(idle);
  };
  const failure = (err: unknown): HttpError => new HttpError(502, `Video download failed: ${errorMessage(controller.signal.aborted ? controller.signal.reason : err)}`);
  touch();
  let res: Response;
  try {
    res = await fetch(target, { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
  } catch (err) {
    stop();
    throw failure(err);
  }
  if (!res.ok) {
    stop();
    const body = await readBody(res).catch(() => undefined);
    throw providerError(res.status, body, "Video download failed: ");
  }
  if (!res.body) {
    stop();
    throw new HttpError(502, "Video download failed: empty response body");
  }
  const reader = res.body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(ctl) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await reader.read();
      } catch (err) {
        stop();
        throw failure(err);
      }
      if (next.done) {
        stop();
        ctl.close();
        return;
      }
      touch();
      ctl.enqueue(next.value);
    },
    cancel(reason) {
      stop();
      controller.abort(reason instanceof Error ? reason : new Error("download cancelled"));
      reader.cancel(reason).catch(() => undefined);
    },
  });
}

/** `openVideoStream` piped to a file on disk; returns the byte count. On any failure `dest` is removed. */
export async function downloadVideo(key: string, url: string, dest: string, limits: DownloadLimits = {}): Promise<number> {
  const body = await openVideoStream(key, url, limits);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  try {
    await pipeline(Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream<Uint8Array>), fs.createWriteStream(dest));
    return (await fs.promises.stat(dest)).size;
  } catch (err) {
    await fs.promises.unlink(dest).catch(() => undefined);
    throw err instanceof HttpError ? err : new HttpError(502, `Video download failed: ${errorMessage(err)}`);
  }
}

// ---------- account ----------

export interface CreditsInfo {
  total: number;
  used: number;
}
export async function credits(key: string): Promise<CreditsInfo> {
  const { body } = await request<{ data?: { total_credits?: number; total_usage?: number } }>("/api/v1/credits", { key, timeoutMs: 15_000 });
  return { total: Number(body.data?.total_credits ?? 0), used: Number(body.data?.total_usage ?? 0) };
}

export interface KeyInfo {
  label?: string;
  limit?: number | null;
  usage?: number;
  isFreeTier?: boolean;
}
export async function keyInfo(key: string): Promise<KeyInfo> {
  const { body } = await request<{ data?: { label?: string; limit?: number | null; usage?: number; is_free_tier?: boolean } }>("/api/v1/key", { key, timeoutMs: 15_000 });
  const d = body.data ?? {};
  const out: KeyInfo = {};
  if (typeof d.label === "string") out.label = d.label;
  if (d.limit === null || typeof d.limit === "number") out.limit = d.limit;
  if (typeof d.usage === "number") out.usage = d.usage;
  if (typeof d.is_free_tier === "boolean") out.isFreeTier = d.is_free_tier;
  return out;
}

// ---------- live model list (10-minute cache, best-effort) ----------

/** One row of the `output_modalities=video` list, enough to synthesize a catalog entry for an unknown slug. */
export interface LiveVideoModel {
  id: string;
  name?: string;
  description?: string;
  /** `architecture.input_modalities`, e.g. `["text", "image"]`; empty when the endpoint omits it. */
  inputModalities: string[];
}

export interface LiveModels {
  checkedAt: string;
  available: string[];
  /** Everything the video endpoint listed (catalog slugs included); `catalog.ts` derives discovered models from it. */
  video: LiveVideoModel[];
}

export const LIVE_TTL_MS = 10 * 60_000;
/** After a failed refresh, serve the stale snapshot and leave upstream alone for this long. */
export const LIVE_RETRY_MS = 60_000;
let liveCache: LiveModels | undefined;
let liveFailedAt = 0;
let liveInFlight: Promise<LiveModels | undefined> | undefined;

interface ModelsListEntry {
  id?: string;
  name?: string;
  description?: string;
  architecture?: { input_modalities?: unknown };
}
interface ModelsListResponse {
  data?: ModelsListEntry[];
}

export const LIVE_VIDEO_ENDPOINT = "/api/v1/models?output_modalities=video";

/**
 * Endpoints unioned for the availability snapshot. Models served by
 * `/images/generations` (Krea 2, gpt-image-2) only appear in the
 * `output_modalities=image` filter and in `/images/models`, never in the
 * unfiltered `/models` list, so all three are needed.
 */
export const LIVE_MODEL_ENDPOINTS = ["/api/v1/models?output_modalities=image", LIVE_VIDEO_ENDPOINT, "/api/v1/images/models"] as const;

function liveVideoModel(m: ModelsListEntry & { id: string }): LiveVideoModel {
  const raw = m.architecture?.input_modalities;
  const out: LiveVideoModel = { id: m.id, inputModalities: Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [] };
  if (typeof m.name === "string" && m.name.trim()) out.name = m.name.trim();
  if (typeof m.description === "string" && m.description.trim()) out.description = m.description.trim();
  return out;
}

async function fetchLiveModels(key: string): Promise<LiveModels> {
  const lists = await Promise.all(
    LIVE_MODEL_ENDPOINTS.map(async (url) => ({ url, body: (await request<ModelsListResponse | ModelsListEntry[]>(url, { key, timeoutMs: 20_000 })).body })),
  );
  const ids = new Set<string>();
  const video: LiveVideoModel[] = [];
  for (const { url, body } of lists) {
    const data = Array.isArray(body) ? body : (body.data ?? []);
    for (const m of data) {
      if (typeof m.id !== "string" || !m.id) continue;
      ids.add(m.id);
      if (url === LIVE_VIDEO_ENDPOINT) video.push(liveVideoModel({ ...m, id: m.id }));
    }
  }
  return { checkedAt: new Date().toISOString(), available: [...ids].sort(), video };
}

/** The cached snapshot as-is (possibly stale, possibly none); never triggers a fetch. */
export function liveSnapshot(): LiveModels | undefined {
  return liveCache;
}

/**
 * Availability snapshot for `GET /api/models`. Without a key nothing is fetched
 * (`undefined`). A fresh snapshot is served from cache; when a refresh fails the
 * previous snapshot (or `undefined`) is returned and upstream is not asked again
 * for `LIVE_RETRY_MS`; every page load would otherwise re-issue three requests.
 */
export async function listLiveModels(key?: string): Promise<LiveModels | undefined> {
  if (!key) return undefined;
  const now = Date.now();
  if (liveCache && now - Date.parse(liveCache.checkedAt) < LIVE_TTL_MS) return liveCache;
  if (now - liveFailedAt < LIVE_RETRY_MS) return liveCache;
  if (!liveInFlight) {
    liveInFlight = fetchLiveModels(key)
      .then((live) => {
        liveCache = live;
        liveFailedAt = 0;
        return live;
      })
      .catch((err: unknown) => {
        liveFailedAt = Date.now();
        log.warn(`live model list unavailable (next attempt in ${LIVE_RETRY_MS / 1000}s): ${errorMessage(err)}`);
        return liveCache;
      })
      .finally(() => {
        liveInFlight = undefined;
      });
  }
  return liveInFlight;
}
