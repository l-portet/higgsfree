/**
 * One error class for the data layer and the UI: an HTTP-like status (OpenRouter's own
 * where it answered, 0 when nothing answered), a message, and OpenRouter's body verbatim.
 */
import type { ApiError } from "@shared/types";

export class ApiClientError extends Error {
  readonly status: number;
  readonly error: string;
  /** Raw provider body (OpenRouter) when one was returned, surfaced verbatim. */
  readonly provider?: unknown;

  constructor(status: number, error: string, provider?: unknown) {
    super(error);
    this.name = "ApiClientError";
    this.status = status;
    this.error = error;
    if (provider !== undefined) this.provider = provider;
  }

  /** True when the request never reached OpenRouter (network / CORS), or local storage is unavailable. */
  get offline(): boolean {
    return this.status === 0;
  }

  toJSON(): ApiError {
    const body: ApiError = { error: this.message, status: this.status };
    if (this.provider !== undefined) body.provider = this.provider;
    return body;
  }
}

export const badRequest = (message: string, provider?: unknown): ApiClientError => new ApiClientError(400, message, provider);
export const notFound = (message = "Not found"): ApiClientError => new ApiClientError(404, message);
export const conflict = (message: string): ApiClientError => new ApiClientError(409, message);

/**
 * A 400 for an option value (aspect ratio, size, resolution) the model's catalog
 * entry does not list. Kept structured so a retry of an old record can explain
 * that the *saved* value is what became unsupported.
 */
export class UnsupportedOptionError extends ApiClientError {
  readonly modelName: string;
  readonly option: string;
  readonly value: string;
  readonly allowed: readonly string[];

  constructor(modelName: string, option: string, value: string, allowed: readonly string[]) {
    super(400, `${modelName} does not support ${option} ${value} (allowed: ${allowed.join(", ")})`);
    this.name = "UnsupportedOptionError";
    this.modelName = modelName;
    this.option = option;
    this.value = value;
    this.allowed = allowed;
  }
}

export const OFFLINE_MESSAGE = "OpenRouter unreachable";
export const STORAGE_UNAVAILABLE_MESSAGE = "Local storage unavailable";
/** Message of the 401 an upstream 401 becomes; the provider body rides along. */
export const KEY_REJECTED = "OpenRouter rejected the API key";

export const isKeyRejected = (err: unknown): boolean => err instanceof ApiClientError && err.status === 401 && err.error === KEY_REJECTED;

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

/** Human-readable message for toasts: our error plus the provider's own text when it differs. */
export function describeApiError(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiClientError) {
    if (err.offline) return `${err.error || OFFLINE_MESSAGE}. Check your connection.`;
    const extra = providerMessage(err.provider);
    const base = err.error || fallback;
    if (extra && !base.includes(extra)) return `${base.replace(/[.\s]+$/, "")}: ${extra}`.slice(0, 400);
    return base.slice(0, 400);
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}
