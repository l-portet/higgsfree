/** The archive format (`higgsfree-library` v1) and the sanitizers every imported record and folder go through. */
import type { Folder, Generation, GenerationInputs, GenerationStatus, GenerationType, MediaRef } from "@shared/types";
import { isFolderId, normalizeFolderName } from "../folders";
import { isGenerationId, isMediaId } from "../media-ids";

export const ARCHIVE_FORMAT = "higgsfree-library";
export const ARCHIVE_VERSION = 1;

export interface ArchiveManifest {
  format: string;
  version: number;
  exportedAt: string;
  app: { version: string };
  /** `folders` is absent in archives made before Favorites folders. */
  counts: { generations: number; media: number; folders?: number };
  /** Media bytes in the archive. */
  bytes: number;
}

export interface ArchiveProgress {
  phase: "listing" | "media" | "records" | "done";
  done: number;
  total: number;
  bytes: number;
}

export function isArchiveManifest(v: unknown): v is ArchiveManifest {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.format === "string" && typeof o.version === "number";
}

const TYPES = new Set<GenerationType>(["image", "video"]);
const STATUSES = new Set<GenerationStatus>(["pending", "running", "completed", "failed"]);

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const iso = (v: unknown): string | undefined => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : undefined);

function mediaRef(v: unknown): MediaRef | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (!isMediaId(o.id) || typeof o.mime !== "string" || num(o.bytes) === undefined) return undefined;
  const ref: MediaRef = { id: o.id, mime: o.mime, bytes: o.bytes as number };
  const width = num(o.width);
  const height = num(o.height);
  const durationSec = num(o.durationSec);
  if (width !== undefined) ref.width = width;
  if (height !== undefined) ref.height = height;
  if (durationSec !== undefined) ref.durationSec = durationSec;
  return ref;
}

function inputs(v: unknown): GenerationInputs | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const out: GenerationInputs = {};
  const refs = Array.isArray(o.referenceImages) ? o.referenceImages.filter(isMediaId) : [];
  if (refs.length > 0) out.referenceImages = refs;
  if (isMediaId(o.firstFrame)) out.firstFrame = o.firstFrame;
  if (isMediaId(o.lastFrame)) out.lastFrame = o.lastFrame;
  if (isMediaId(o.motionVideo)) out.motionVideo = o.motionVideo;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * A record out of an archive: known fields only, ids checked, a run that was active when
 * exported becomes a failed one (it cannot resume in another browser).
 */
export function sanitizeRecord(v: unknown): Generation | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const id = o.id;
  const type = o.type as GenerationType;
  const status = o.status as GenerationStatus;
  const prompt = str(o.prompt);
  const model = str(o.model);
  const modelName = str(o.modelName);
  const createdAt = iso(o.createdAt);
  const updatedAt = iso(o.updatedAt) ?? createdAt;
  if (!isGenerationId(id) || !TYPES.has(type) || !STATUSES.has(status) || prompt === undefined || !model || !modelName || !createdAt || !updatedAt) return undefined;
  if (typeof o.params !== "object" || o.params === null) return undefined;
  const g: Generation = { id, type, status, prompt, model, modelName, params: o.params as Generation["params"], createdAt, updatedAt };
  const ins = inputs(o.inputs);
  if (ins) g.inputs = ins;
  const output = mediaRef(o.output);
  if (output) g.output = output;
  const error = str(o.error);
  if (error) g.error = error;
  const costUsd = num(o.costUsd);
  if (costUsd !== undefined) g.costUsd = costUsd;
  const providerJobId = str(o.providerJobId);
  if (providerJobId) g.providerJobId = providerJobId;
  const batchId = str(o.batchId);
  if (batchId) g.batchId = batchId;
  if (o.provider === "openrouter" || o.provider === "fal") g.provider = o.provider;
  const batchIndex = num(o.batchIndex);
  if (batchIndex !== undefined) g.batchIndex = batchIndex;
  if (o.favorite === true) {
    g.favorite = true;
    // Kept only if the folder is in the library once the import is done (the importer checks).
    if (isFolderId(o.folder)) g.folder = o.folder;
  }
  const completedAt = iso(o.completedAt);
  if (completedAt) g.completedAt = completedAt;
  const elapsedMs = num(o.elapsedMs);
  if (elapsedMs !== undefined) g.elapsedMs = elapsedMs;
  if (status === "pending" || status === "running") {
    g.status = "failed";
    g.error = "Interrupted (imported while it was still running)";
    g.completedAt = updatedAt;
  }
  return g;
}

/** A folder out of `folders.json`: a checked id, a cleaned non-empty name, dates. */
export function sanitizeFolder(v: unknown): Folder | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const name = typeof o.name === "string" ? normalizeFolderName(o.name) : "";
  const createdAt = iso(o.createdAt);
  if (!isFolderId(o.id) || !name || !createdAt) return undefined;
  return { id: o.id, name, createdAt, updatedAt: iso(o.updatedAt) ?? createdAt };
}
