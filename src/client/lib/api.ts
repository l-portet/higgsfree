/**
 * Typed client for every endpoint in docs/API.md.
 * All functions throw `ApiClientError` (status 0 = server unreachable).
 */
import { upload as blobUpload } from "@vercel/blob/client";
import type {
  ApiError,
  CreditsResponse,
  EventsResponse,
  GenerateResponse,
  Generation,
  ImageGenerateRequest,
  ListGenerationsQuery,
  ListGenerationsResponse,
  MediaRef,
  ModelsResponse,
  SettingsResponse,
  StorageKind,
  UpdateSettingsRequest,
  UploadResponse,
  VideoGenerateRequest,
} from "@shared/types";
import { extensionForMime, readImageDimensions } from "@/lib/files";
import { shortId } from "@/lib/uid";

export class ApiClientError extends Error {
  readonly status: number;
  readonly error: string;
  readonly provider: unknown;

  constructor(status: number, error: string, provider?: unknown) {
    super(error);
    this.name = "ApiClientError";
    this.status = status;
    this.error = error;
    this.provider = provider;
  }

  /** True when the request never reached the API (network / proxy failure). */
  get offline(): boolean {
    return this.status === 0;
  }
}

export const OFFLINE_MESSAGE = "Server unreachable";

function isApiError(v: unknown): v is ApiError {
  return typeof v === "object" && v !== null && typeof (v as ApiError).error === "string";
}

/** Pull a readable message out of an OpenRouter provider body (best-effort). */
export function providerMessage(provider: unknown): string | undefined {
  if (provider == null) return undefined;
  if (typeof provider === "string") return provider.trim() || undefined;
  if (typeof provider !== "object") return undefined;
  const p = provider as Record<string, unknown>;
  const err = p.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    const meta = e.metadata;
    if (meta && typeof meta === "object" && typeof (meta as Record<string, unknown>).raw === "string") {
      return (meta as Record<string, unknown>).raw as string;
    }
  }
  if (typeof p.message === "string") return p.message;
  if (typeof p.detail === "string") return p.detail;
  return undefined;
}

/** Human-readable message for toasts: the server error plus the provider's own text when it differs. */
export function describeApiError(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiClientError) {
    if (err.offline) return `${OFFLINE_MESSAGE}. Is the API running?`;
    const extra = providerMessage(err.provider);
    const base = err.error || fallback;
    if (extra && !base.includes(extra)) return `${base.replace(/[.\s]+$/, "")}: ${extra}`.slice(0, 400);
    return base.slice(0, 400);
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

type Query = Record<string, string | number | boolean | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiClientError(0, OFFLINE_MESSAGE);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (isApiError(data)) throw new ApiClientError(res.status, data.error, data.provider);
    // A gateway in front answers 5xx with a non-JSON body when the app is down.
    if (res.status >= 500 && res.status <= 599) throw new ApiClientError(0, OFFLINE_MESSAGE);
    throw new ApiClientError(res.status, res.statusText || `Request failed (${res.status})`);
  }
  return data as T;
}

function json(method: "POST" | "PUT" | "PATCH", body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

// ---------- Endpoints ----------

/** Known after the first `getSettings()`; decides how `upload()` moves bytes. */
let storageMode: StorageKind | undefined;

export async function getSettings(): Promise<SettingsResponse> {
  const res = await request<SettingsResponse>("/api/settings");
  storageMode = res.storage;
  return res;
}

export function updateSettings(body: UpdateSettingsRequest): Promise<SettingsResponse> {
  return request<SettingsResponse>("/api/settings", json("PUT", body));
}

export function testSettings(apiKey?: string): Promise<CreditsResponse> {
  return request<CreditsResponse>("/api/settings/test", json("POST", apiKey ? { apiKey } : {}));
}

export function getCredits(): Promise<CreditsResponse> {
  return request<CreditsResponse>("/api/credits");
}

export function getModels(): Promise<ModelsResponse> {
  return request<ModelsResponse>("/api/models");
}

/** Change feed since `since` (omit on the first call). Also advances running jobs server-side. */
export function getEvents(since?: string): Promise<EventsResponse> {
  return request<EventsResponse>(withQuery("/api/events", { since }), { cache: "no-store" });
}

export function generateImage(body: ImageGenerateRequest): Promise<GenerateResponse> {
  return request<GenerateResponse>("/api/generate/image", json("POST", body));
}

export function generateVideo(body: VideoGenerateRequest): Promise<GenerateResponse> {
  return request<GenerateResponse>("/api/generate/video", json("POST", body));
}

export function listGenerations(query: ListGenerationsQuery = {}): Promise<ListGenerationsResponse> {
  return request<ListGenerationsResponse>(withQuery("/api/generations", { ...query }));
}

export function getGeneration(id: string): Promise<Generation> {
  return request<Generation>(`/api/generations/${encodeURIComponent(id)}`);
}

export function deleteGeneration(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/generations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function retryGeneration(id: string): Promise<GenerateResponse> {
  return request<GenerateResponse>(`/api/generations/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

/**
 * Upload a reference image as a `File` or a data URL (JSON). With Blob storage a `File` goes from
 * the browser straight to the store (the server only signs a token), which is what gets a 25 MB
 * image past the 4.5 MB request body limit of a Vercel function.
 */
export function upload(input: File | string): Promise<UploadResponse> {
  if (typeof input === "string") return request<UploadResponse>("/api/upload", json("POST", { dataUrl: input }));
  if (storageMode === "blob") return uploadDirect(input);
  const form = new FormData();
  form.append("file", input, input.name);
  return request<UploadResponse>("/api/upload", { method: "POST", body: form });
}

const MULTIPART_FROM_BYTES = 8 * 1024 * 1024;

async function uploadDirect(file: File): Promise<UploadResponse> {
  // The server only admits `media/uploads/up_<id>.<png|jpg|webp>` (see routes/upload.ts).
  const pathname = `media/uploads/up_${shortId(12)}.${extensionForMime(file.type)}`;
  let stored: { url: string };
  try {
    stored = await blobUpload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
      contentType: file.type,
      multipart: file.size > MULTIPART_FROM_BYTES,
    });
  } catch (err) {
    throw new ApiClientError(502, err instanceof Error && err.message ? err.message : "Upload failed");
  }
  const media: MediaRef = { url: stored.url, mime: file.type, bytes: file.size };
  const objectUrl = URL.createObjectURL(file);
  try {
    const dims = await readImageDimensions(objectUrl);
    media.width = dims.width;
    media.height = dims.height;
  } catch {
    /* dimensions are a nicety */
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  return { media };
}
