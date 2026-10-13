import { z } from "zod";
import type { GenerationStatus, GenerationType, ImageAspectRatio, ImageSize, VideoAspectRatio, VideoResolution } from "../shared/types.ts";
import { IMAGE_ASPECT_RATIOS, VIDEO_ASPECT_RATIOS } from "../shared/models.ts";
import { badRequest } from "./errors.ts";

const IMAGE_AR = IMAGE_ASPECT_RATIOS as [ImageAspectRatio, ...ImageAspectRatio[]];
const VIDEO_AR = VIDEO_ASPECT_RATIOS as [VideoAspectRatio, ...VideoAspectRatio[]];
const IMAGE_SIZES: [ImageSize, ...ImageSize[]] = ["1K", "2K", "4K"];
const VIDEO_RES: [VideoResolution, ...VideoResolution[]] = ["480p", "720p", "768p", "1080p", "2K", "4K"];
const GEN_TYPES: [GenerationType, ...GenerationType[]] = ["image", "video"];
const GEN_STATUS: [GenerationStatus, ...GenerationStatus[]] = ["pending", "running", "completed", "failed"];

const imageInput = z.string().min(1).max(64 * 1024 * 1024);

export const imageGenerateSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(8000),
  model: z.string().min(1),
  aspectRatio: z.enum(IMAGE_AR).default("auto"),
  size: z.enum(IMAGE_SIZES).default("1K"),
  count: z.number().int().min(1).max(4).default(1),
  referenceImages: z.array(imageInput).max(8).optional(),
});

export const videoGenerateSchema = z.object({
  prompt: z.string().trim().max(8000).default(""),
  model: z.string().min(1),
  duration: z.number().positive().max(120),
  aspectRatio: z.enum(VIDEO_AR).optional(),
  resolution: z.enum(VIDEO_RES).optional(),
  audio: z.boolean().optional(),
  firstFrame: imageInput.optional(),
  lastFrame: imageInput.optional(),
  references: z.array(imageInput).max(8).optional(),
});

export const listGenerationsSchema = z.object({
  type: z.enum(GEN_TYPES).optional(),
  status: z.enum(GEN_STATUS).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
});

export const updateSettingsSchema = z.object({
  apiKey: z.string().max(512).optional(),
  defaults: z
    .object({
      imageModel: z.string().min(1).optional(),
      videoModel: z.string().min(1).optional(),
    })
    .optional(),
});

export const testKeySchema = z.object({ apiKey: z.string().max(512).optional() });

export const uploadJsonSchema = z.object({ dataUrl: z.string().min(1) });

/** Parse with zod; failures become a readable 400. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data as z.infer<T>;
  const msg = result.error.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
  throw badRequest(`Invalid request: ${msg}`);
}
