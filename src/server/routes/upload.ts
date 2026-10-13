import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { UploadResponse } from "../../shared/types.ts";
import { config } from "../config.ts";
import { badRequest, payloadTooLarge } from "../errors.ts";
import { log } from "../log.ts";
import { BLOB_UPLOAD_PREFIX, IMMUTABLE_MAX_AGE, MAX_UPLOAD_BYTES, parseDataUrl, saveUpload } from "../media.ts";
import { parse, uploadJsonSchema } from "../schemas.ts";

/** 25 MB file + base64 / multipart overhead. */
const limit = bodyLimit({
  maxSize: Math.ceil(MAX_UPLOAD_BYTES * 1.37) + 4096,
  onError: () => {
    throw payloadTooLarge(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit`);
  },
});

/** What the browser may name a direct-to-Blob upload: our own upload prefix, an `up_*` id, an image extension. */
export const CLIENT_UPLOAD_PATH = new RegExp(`^${BLOB_UPLOAD_PREFIX}up_[A-Za-z0-9_-]{8,32}\\.(png|jpg|webp)$`);
const ALLOWED_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"];

const isBlobEvent = (body: unknown): body is HandleUploadBody =>
  typeof body === "object" && body !== null && typeof (body as { type?: unknown }).type === "string" && (body as { type: string }).type.startsWith("blob.");

/**
 * Two ways in:
 *  - the classic server-side upload (multipart `file` or JSON `{ dataUrl }`), bytes sniffed
 *    and stored; on Vercel this path is capped by the platform's 4.5 MB request body limit;
 *  - with Blob storage, the browser uploads straight to the store (`@vercel/blob/client`) and
 *    this route only issues the short-lived token after checking the pathname, type and size.
 */
export const uploadRoutes = new Hono().post("/", limit, async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  let bytes: Uint8Array;
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) throw badRequest('Multipart upload must include a "file" field');
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    const body: unknown = await c.req.json();
    if (isBlobEvent(body)) {
      if (config.storage !== "blob") throw badRequest("Direct uploads need Vercel Blob storage");
      const result = await handleUpload({
        body,
        request: c.req.raw,
        onBeforeGenerateToken: async (pathname) => {
          if (!CLIENT_UPLOAD_PATH.test(pathname)) throw badRequest(`Upload path not allowed: ${pathname}`);
          return {
            allowedContentTypes: ALLOWED_UPLOAD_TYPES,
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: false,
            allowOverwrite: false,
            cacheControlMaxAge: IMMUTABLE_MAX_AGE,
          };
        },
        onUploadCompleted: async ({ blob }) => {
          log.info(`upload: ${blob.pathname} stored in blob`);
        },
      });
      return c.json(result);
    }
    const parsed = parseDataUrl(parse(uploadJsonSchema, body).dataUrl);
    if (!parsed) throw badRequest("dataUrl must be a base64 data URL");
    bytes = parsed.bytes;
  }
  const media = await saveUpload(bytes);
  const res: UploadResponse = { media };
  return c.json(res);
});
