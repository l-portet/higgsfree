/**
 * Thin OpenRouter client for the browser: every non-2xx becomes an `ApiClientError`
 * carrying the provider body verbatim. Only `fetch`, `AbortSignal` and `ReadableStream`;
 * nothing here touches the DOM at import time.
 */
import { ApiClientError, KEY_REJECTED, OFFLINE_MESSAGE, providerMessage } from "./errors";
import { errorMessage, log } from "./log";
import type { ChatImageBody, ImagesGenerationsBody, NativeImageBody, VideoBody } from "./payloads";
import { readJson, writeJson } from "./storage";

/** Overridable for tests / proxies (`NEXT_PUBLIC_OPENROUTER_BASE_URL`, inlined at build time); defaults to the real API. */
export const OPENROUTER_BASE = (process.env.NEXT_PUBLIC_OPENROUTER_BASE_URL ?? "").trim().replace(/\/+$/, "") || "https://openrouter.ai";
const APP_NAME = (process.env.NEXT_PUBLIC_APP_NAME ?? "").trim() || "higgsfree";

/** App attribution (both names are in OpenRouter's CORS allow-list) plus the key. */
function headers(key: string | undefined): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", "X-Title": APP_NAME };
  if (typeof location !== "undefined") h["HTTP-Referer"] = location.origin;
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

/** Thrown when a provider-supplied url points off OpenRouter; retrying cannot fix it. */
export class ForeignOriginError extends ApiClientError {
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

/** Non-2xx from OpenRouter: 401 means the key, everything else keeps its status and body. */
function providerError(status: number, body: unknown, prefix = ""): ApiClientError {
  if (status === 401) return new ApiClientError(401, `${prefix}${KEY_REJECTED}`, body);
  return new ApiClientError(status, `${prefix}${providerMessage(body) ?? `OpenRouter returned HTTP ${status}`}`, body);
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

/** `AbortSignal.any` with a fallback for Safari < 17.4. */
export function anySignal(signals: (AbortSignal | undefined)[]): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => s !== undefined);
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === "function") return any.call(AbortSignal, list);
  const controller = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

/** Why a fetch stopped: the caller cancelled (499), the deadline passed (504), or the network failed (0). */
export function abortedError(signal: AbortSignal | undefined, err: unknown): ApiClientError {
  const reason: unknown = signal?.aborted ? signal.reason : err;
  if (reason instanceof DOMException) {
    if (reason.name === "TimeoutError") return new ApiClientError(504, "OpenRouter request timed out");
    if (reason.name === "AbortError") return new ApiClientError(499, "Request cancelled");
  }
  return new ApiClientError(0, OFFLINE_MESSAGE, errorMessage(err));
}

export interface RequestOptions {
  key?: string;
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  /** Extra accepted statuses besides 2xx. */
  accept?: number[];
  /** Caller-side cancellation (a deleted job). */
  signal?: AbortSignal;
}

async function request<T extends object>(url: string, opts: RequestOptions): Promise<{ status: number; body: T }> {
  const target = assertProviderOrigin(url);
  const signal = anySignal([AbortSignal.timeout(opts.timeoutMs ?? 60_000), opts.signal]);
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(target, {
      method: opts.method ?? "GET",
      headers: headers(opts.key),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal,
    });
    body = await readBody(res);
  } catch (err) {
    throw abortedError(signal, err);
  }
  if (!res.ok && !(opts.accept ?? []).includes(res.status)) throw providerError(res.status, body);
  // Callers read fields off the body; an empty or text body must be an error, not a TypeError.
  if (body === null || typeof body !== "object") throw new ApiClientError(502, "OpenRouter returned a non-JSON response", body);
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

export async function chatImage(key: string, body: ChatImageBody, opts: Pick<RequestOptions, "signal"> = {}): Promise<ChatImageResult> {
  const { body: res } = await request<ChatCompletionResponse>("/api/v1/chat/completions", { key, method: "POST", body, timeoutMs: 6 * 60_000, ...opts });
  if (res.error) throw new ApiClientError(502, providerMessage(res) ?? "OpenRouter returned an error", res);
  const message = res.choices?.[0]?.message;
  const url = message?.images?.[0]?.image_url?.url;
  if (!url) {
    const text = typeof message?.content === "string" ? message.content.trim() : "";
    throw new ApiClientError(502, text ? `Model returned no image: ${text.slice(0, 400)}` : "Model returned no image", res);
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

export async function imagesGenerations(key: string, body: ImagesGenerationsBody, opts: Pick<RequestOptions, "signal"> = {}): Promise<ImagesGenerationsResult> {
  const { body: res } = await request<ImagesGenerationsResponse>("/api/v1/images/generations", { key, method: "POST", body, timeoutMs: 6 * 60_000, ...opts });
  if (res.error) throw new ApiClientError(502, providerMessage(res) ?? "OpenRouter returned an error", res);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new ApiClientError(502, "Model returned no image", res);
  const out: ImagesGenerationsResult = { b64 };
  if (typeof res.usage?.cost === "number") out.costUsd = res.usage.cost;
  return out;
}

/** `POST /api/v1/images`: the native image API (every model in `/api/v1/images/models`). */
export async function nativeImage(key: string, body: NativeImageBody, opts: Pick<RequestOptions, "signal"> = {}): Promise<ImagesGenerationsResult> {
  const { body: res } = await request<ImagesGenerationsResponse>("/api/v1/images", { key, method: "POST", body, timeoutMs: 6 * 60_000, ...opts });
  if (res.error) throw new ApiClientError(502, providerMessage(res) ?? "OpenRouter returned an error", res);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new ApiClientError(502, "Model returned no image", res);
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
export async function submitVideo(key: string, body: VideoBody, opts: Pick<RequestOptions, "signal"> = {}): Promise<VideoSubmitResult> {
  const { body: res } = await request<VideoSubmitResponse>("/api/v1/videos", { key, method: "POST", body, timeoutMs: 90_000, accept: [200, 202], ...opts });
  if (res.error) throw new ApiClientError(502, providerMessage(res) ?? "OpenRouter returned an error", res);
  if (!res.id || !res.polling_url) throw new ApiClientError(502, "OpenRouter did not return a job id / polling url", res);
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

export async function pollVideo(key: string, pollingUrl: string, opts: Pick<RequestOptions, "signal"> = {}): Promise<VideoPollResult> {
  const { body: res } = await request<VideoPollResponse>(pollingUrl, { key, timeoutMs: 30_000, ...opts });
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
  signal?: AbortSignal;
}
export const DOWNLOAD_IDLE_MS = 60_000;
export const DOWNLOAD_MAX_MS = 30 * 60_000;

/**
 * The content url is NOT public; it needs the Bearer header. Returns the body as a
 * stream that fails when it stalls (`idleMs` without a chunk) or blows the generous
 * overall cap (`maxMs`). Every failure surfaces on the stream as an `ApiClientError`.
 */
export async function openVideoStream(key: string, url: string, limits: DownloadLimits = {}): Promise<ReadableStream<Uint8Array>> {
  const target = assertProviderOrigin(url);
  const idleMs = limits.idleMs ?? DOWNLOAD_IDLE_MS;
  const maxMs = limits.maxMs ?? DOWNLOAD_MAX_MS;
  const controller = new AbortController();
  const signal = anySignal([controller.signal, limits.signal]);
  const overall = setTimeout(() => controller.abort(new Error(`download exceeded ${Math.round(maxMs / 60_000)} minutes`)), maxMs);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const touch = (): void => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(new Error(`no data received for ${Math.round(idleMs / 1000)} seconds`)), idleMs);
  };
  const stop = (): void => {
    clearTimeout(overall);
    clearTimeout(idle);
  };
  const failure = (err: unknown): ApiClientError => {
    if (limits.signal?.aborted) return abortedError(limits.signal, err);
    return new ApiClientError(502, `Video download failed: ${errorMessage(controller.signal.aborted ? controller.signal.reason : err)}`);
  };
  touch();
  let res: Response;
  try {
    res = await fetch(target, { headers: { Authorization: `Bearer ${key}` }, signal });
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
    throw new ApiClientError(502, "Video download failed: empty response body");
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

// ---------- live model catalog (10-minute cache shared by every tab, best-effort) ----------

/**
 * One row of `GET /api/v1/videos/models`: what the model accepts and what it costs. Values are
 * kept as OpenRouter spells them; `catalog.ts` maps them onto the app's option lists.
 */
export interface LiveVideoSpec {
  id: string;
  name?: string;
  description?: string;
  /** Unix seconds. */
  created?: number;
  resolutions: string[];
  aspectRatios: string[];
  durations: number[];
  /** `first_frame`, `last_frame`. */
  frames: string[];
  /** `generate_audio` is accepted (the model has a native audio track you can turn off). */
  audio: boolean;
  /** `pricing_skus`: SKU name → decimal string (USD, or cents when the SKU says so). */
  pricing: Record<string, string>;
}

/** One row of `GET /api/v1/images/models` (the native image API's catalog). */
export interface LiveImageSpec {
  id: string;
  name?: string;
  description?: string;
  created?: number;
  outputModalities: string[];
  aspectRatios: string[];
  resolutions: string[];
  /** `input_references` range; absent = no reference images. */
  references?: { min: number; max: number };
  /** `output_format` enum when the model restricts it (e.g. `["svg"]`). */
  outputFormats?: string[];
}

export interface LiveModels {
  /** Bumped when the shape changes, so an older snapshot in localStorage is ignored. */
  version: 2;
  checkedAt: string;
  /** Every slug OpenRouter lists for video or image generation. */
  available: string[];
  video: LiveVideoSpec[];
  image: LiveImageSpec[];
}

export const LIVE_TTL_MS = 10 * 60_000;
/** After a failed refresh, serve the stale snapshot and leave upstream alone for this long. */
export const LIVE_RETRY_MS = 60_000;
/** Mirrored here so a fresh tab (or a reload) reuses the snapshot instead of re-issuing the requests. */
export const LIVE_STORAGE = "higgsfree.live-models";
let liveCache: LiveModels | undefined;
let liveLoaded = false;
let liveFailedAt = 0;
let liveInFlight: Promise<LiveModels | undefined> | undefined;

export const LIVE_VIDEO_ENDPOINT = "/api/v1/videos/models";
export const LIVE_IMAGE_ENDPOINT = "/api/v1/images/models";
/** Both catalogs are public: they are fetched with or without a key. */
export const LIVE_MODEL_ENDPOINTS = [LIVE_VIDEO_ENDPOINT, LIVE_IMAGE_ENDPOINT] as const;

type Raw = Record<string, unknown>;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
const numbers = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : []);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const rows = (body: unknown): Raw[] => {
  const data = Array.isArray(body) ? body : ((body as { data?: unknown } | undefined)?.data ?? []);
  return Array.isArray(data) ? data.filter((r): r is Raw => typeof r === "object" && r !== null && typeof (r as Raw).id === "string" && Boolean((r as Raw).id)) : [];
};

function common(r: Raw): { id: string; name?: string; description?: string; created?: number } {
  const out: { id: string; name?: string; description?: string; created?: number } = { id: String(r.id) };
  const name = text(r.name);
  const description = text(r.description);
  if (name) out.name = name;
  if (description) out.description = description;
  if (typeof r.created === "number") out.created = r.created;
  return out;
}

export function parseVideoSpec(r: Raw): LiveVideoSpec {
  const pricing: Record<string, string> = {};
  if (typeof r.pricing_skus === "object" && r.pricing_skus !== null) {
    for (const [k, v] of Object.entries(r.pricing_skus as Raw)) if (typeof v === "string" || typeof v === "number") pricing[k] = String(v);
  }
  return {
    ...common(r),
    resolutions: strings(r.supported_resolutions),
    aspectRatios: strings(r.supported_aspect_ratios),
    durations: [...new Set(numbers(r.supported_durations).filter((d) => d > 0))].sort((a, b) => a - b),
    frames: strings(r.supported_frame_images),
    audio: r.generate_audio === true,
    pricing,
  };
}

function enumValues(param: unknown): string[] {
  const p = param as { type?: unknown; values?: unknown } | undefined;
  return p?.type === "enum" ? strings(p.values) : [];
}

export function parseImageSpec(r: Raw): LiveImageSpec {
  const params = (typeof r.supported_parameters === "object" && r.supported_parameters !== null && !Array.isArray(r.supported_parameters) ? r.supported_parameters : {}) as Raw;
  const arch = (r.architecture ?? {}) as { output_modalities?: unknown };
  const spec: LiveImageSpec = {
    ...common(r),
    outputModalities: strings(arch.output_modalities),
    aspectRatios: enumValues(params.aspect_ratio),
    resolutions: enumValues(params.resolution),
  };
  const refs = params.input_references as { type?: unknown; min?: unknown; max?: unknown } | undefined;
  if (refs?.type === "range" && typeof refs.max === "number" && refs.max > 0) spec.references = { min: typeof refs.min === "number" ? refs.min : 0, max: refs.max };
  const formats = enumValues(params.output_format);
  if (formats.length > 0) spec.outputFormats = formats;
  return spec;
}

async function fetchLiveModels(key: string | undefined): Promise<LiveModels> {
  const [videoBody, imageBody] = await Promise.all(LIVE_MODEL_ENDPOINTS.map(async (url) => (await request<object>(url, { key, timeoutMs: 20_000 })).body));
  const video = rows(videoBody).map(parseVideoSpec);
  const image = rows(imageBody).map(parseImageSpec);
  const available = [...new Set([...video.map((m) => m.id), ...image.map((m) => m.id)])].sort();
  return { version: 2, checkedAt: new Date().toISOString(), available, video, image };
}

function isLiveModels(v: unknown): v is LiveModels {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.version === 2 && typeof o.checkedAt === "string" && Array.isArray(o.available) && Array.isArray(o.video) && Array.isArray(o.image);
}

/** The cached snapshot as-is (possibly stale, possibly none); never triggers a fetch. */
export function liveSnapshot(): LiveModels | undefined {
  if (!liveLoaded) {
    liveLoaded = true;
    const stored = readJson<Record<string, unknown>>(LIVE_STORAGE, {});
    if (isLiveModels(stored)) liveCache = stored;
  }
  return liveCache;
}

/** Tests: forget the snapshot and the backoff. */
export function resetLiveModels(): void {
  liveCache = undefined;
  liveLoaded = false;
  liveFailedAt = 0;
  liveInFlight = undefined;
}

/**
 * OpenRouter's video and image catalogs, fetched without a key (they are public) and with it
 * when one is set. A fresh snapshot is served from cache; when a refresh fails the previous
 * snapshot (or `undefined`) is returned and upstream is not asked again for `LIVE_RETRY_MS`.
 */
export async function listLiveModels(key?: string): Promise<LiveModels | undefined> {
  const cached = liveSnapshot();
  const now = Date.now();
  if (cached && now - Date.parse(cached.checkedAt) < LIVE_TTL_MS) return cached;
  if (now - liveFailedAt < LIVE_RETRY_MS) return cached;
  if (!liveInFlight) {
    liveInFlight = fetchLiveModels(key)
      .then((live) => {
        liveCache = live;
        liveFailedAt = 0;
        writeJson(LIVE_STORAGE, live);
        return live;
      })
      .catch((err: unknown) => {
        liveFailedAt = Date.now();
        log.warn(`live model catalog unavailable (next attempt in ${LIVE_RETRY_MS / 1000}s): ${errorMessage(err)}`);
        return liveCache;
      })
      .finally(() => {
        liveInFlight = undefined;
      });
  }
  return liveInFlight;
}
