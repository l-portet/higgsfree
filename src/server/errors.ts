import type { ApiError } from "../shared/types.ts";

/** An error that maps 1:1 onto the `ApiError` wire shape. */
export class HttpError extends Error {
  readonly status: number;
  /** Raw provider body (OpenRouter) when one was returned, surfaced verbatim. */
  readonly provider?: unknown;

  constructor(status: number, message: string, provider?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    if (provider !== undefined) this.provider = provider;
  }

  toJSON(): ApiError {
    const body: ApiError = { error: this.message, status: this.status };
    if (this.provider !== undefined) body.provider = this.provider;
    return body;
  }
}

export const badRequest = (message: string, provider?: unknown): HttpError => new HttpError(400, message, provider);
export const notFound = (message = "Not found"): HttpError => new HttpError(404, message);
export const conflict = (message: string): HttpError => new HttpError(409, message);
export const payloadTooLarge = (message: string): HttpError => new HttpError(413, message);

/**
 * A 400 for an option value (aspect ratio, size, resolution) the model's catalog
 * entry does not list. Kept structured so a retry of an old record can explain
 * that the *saved* value is what became unsupported.
 */
export class UnsupportedOptionError extends HttpError {
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
