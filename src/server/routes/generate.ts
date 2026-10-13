import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { GenerateResponse } from "../../shared/types.ts";
import { payloadTooLarge } from "../errors.ts";
import { createImageBatch, createVideoGeneration } from "../jobs.ts";
import { MAX_UPLOAD_BYTES } from "../media.ts";
import { imageGenerateSchema, parse, videoGenerateSchema } from "../schemas.ts";

/**
 * Inline reference images arrive as base64 data URLs (×1.37). Two of them, each up
 * to the upload limit, fit in one body (about 69 MB); the client uploads through
 * /api/upload anyway, so larger sets never need this path. Anything bigger is a
 * 413 before it is buffered.
 */
export const MAX_INLINE_IMAGES = 2;
export const GENERATE_BODY_LIMIT = Math.ceil(MAX_INLINE_IMAGES * MAX_UPLOAD_BYTES * 1.37) + 64 * 1024;

const limit = bodyLimit({
  maxSize: GENERATE_BODY_LIMIT,
  onError: () => {
    throw payloadTooLarge(`Request body exceeds ${Math.round(GENERATE_BODY_LIMIT / 1024 / 1024)} MB. Upload reference images via /api/upload first.`);
  },
});

export const generateRoutes = new Hono()
  .post("/image", limit, async (c) => {
    const req = parse(imageGenerateSchema, await c.req.json());
    const generations = await createImageBatch(req);
    const res: GenerateResponse = { generations };
    return c.json(res);
  })
  .post("/video", limit, async (c) => {
    const req = parse(videoGenerateSchema, await c.req.json());
    const generation = await createVideoGeneration(req);
    const res: GenerateResponse = { generations: [generation] };
    return c.json(res);
  });
