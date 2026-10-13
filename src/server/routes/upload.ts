import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { UploadResponse } from "../../shared/types.ts";
import { badRequest, payloadTooLarge } from "../errors.ts";
import { MAX_UPLOAD_BYTES, parseDataUrl, saveUpload } from "../media.ts";
import { parse, uploadJsonSchema } from "../schemas.ts";

/** 25 MB file + base64 / multipart overhead. */
const limit = bodyLimit({
  maxSize: Math.ceil(MAX_UPLOAD_BYTES * 1.37) + 4096,
  onError: () => {
    throw payloadTooLarge(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit`);
  },
});

export const uploadRoutes = new Hono().post("/", limit, async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  let bytes: Uint8Array;
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) throw badRequest('Multipart upload must include a "file" field');
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    const body = parse(uploadJsonSchema, await c.req.json());
    const parsed = parseDataUrl(body.dataUrl);
    if (!parsed) throw badRequest("dataUrl must be a base64 data URL");
    bytes = parsed.bytes;
  }
  const media = await saveUpload(bytes);
  const res: UploadResponse = { media };
  return c.json(res);
});
