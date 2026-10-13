/**
 * Generation lifecycle: image batches (parallel, in-process) and video jobs
 * (submit → poll every 6s → stream download to disk). Every status change is
 * persisted and pushed over the SSE bus.
 */
import { nanoid } from "nanoid";
import type {
  Generation, GenerationInputs, ImageGenerateRequest, ImageModel, ImageParams, VideoGenerateRequest, VideoModel, VideoParams,
} from "../shared/types.ts";
import { findImageModel } from "../shared/models.ts";
import { lookupVideoModel } from "./catalog.ts";
import { config } from "./config.ts";
import { badRequest, conflict, HttpError, notFound, UnsupportedOptionError } from "./errors.ts";
import { publishGeneration, publishGenerationDeleted } from "./events.ts";
import { errorMessage, log } from "./log.ts";
import {
  deleteMediaUrl, inputMediaUrls, mediaUrlToDataUrl, normalizeInputUrl, parseDataUrl, removeFile, saveImageOutput, saveVideoOutput, sweepTempFiles,
  videoDownloadPath,
} from "./media.ts";
import * as or from "./openrouter.ts";
import { buildImagePayload, buildVideoPayload, type VideoPayload } from "./payloads.ts";
import {
  countActiveGenerations, countGenerationsReferencingMedia, deleteGeneration, getGeneration, insertGeneration, listActiveGenerations, toPublic,
  updateGeneration, type StoredGeneration,
} from "./repo.ts";
import { requireApiKey, resolveApiKey } from "./settings.ts";

export const POLL_INTERVAL_MS = 6_000;
export const JOB_TIMEOUT_MS = 45 * 60_000;
const PENDING_STATUSES = new Set(["pending", "queued", "processing", "running", "in_progress", "starting"]);
const DONE_STATUSES = new Set(["completed", "succeeded", "success", "done"]);
const FAILED_STATUSES = new Set(["failed", "error", "errored", "cancelled", "canceled", "rejected"]);

const newId = (): string => `gen_${nanoid(12)}`;
const now = (): string => new Date().toISOString();
const fmtCost = (c: number | undefined): string => (c === undefined ? "n/a" : `$${c.toFixed(4)}`);

function save(id: string, patch: Partial<Omit<StoredGeneration, "id">>): StoredGeneration | undefined {
  const g = updateGeneration(id, patch);
  if (g) publishGeneration(toPublic(g));
  return g;
}

function failGeneration(id: string, err: unknown): void {
  const message = errorMessage(err) || "Unknown error";
  warnedUnknownStatus.delete(id);
  const g = save(id, { status: "failed", error: message, completedAt: now() });
  if (g) log.error(`job ${id} ${g.type} failed model=${g.model}: ${message}`);
}

export function activeJobCount(): number {
  return countActiveGenerations();
}

/** 429 when `requested` more jobs would push pending + running past `MAX_ACTIVE_JOBS`. */
function assertCapacity(requested: number): void {
  const max = config.maxActiveJobs;
  if (countActiveGenerations() + requested > max) {
    throw new HttpError(429, `Too many active generations (${max}). Wait for some to finish.`);
  }
}

const list = (values: readonly string[]): string => values.join(", ");

/**
 * Normalizes request inputs and remembers which `data:` ones it wrote to disk, so
 * a validation or capacity failure later in the same call can remove them again
 * instead of leaving orphan `up_*` files behind.
 */
class InputUploads {
  private readonly written: string[] = [];

  async one(input: string, label: string): Promise<string> {
    const url = await normalizeInputUrl(input, label);
    if (input.trim().startsWith("data:")) this.written.push(url);
    return url;
  }

  /** Every input is awaited (not just the first failure) so nothing written is missed by `discard`. */
  async many(inputs: readonly string[], label: string): Promise<string[]> {
    const results = await Promise.allSettled(inputs.map((r, i) => this.one(r, `${label}[${i}]`)));
    const urls: string[] = [];
    for (const r of results) {
      if (r.status === "rejected") throw r.reason as Error;
      urls.push(r.value);
    }
    return urls;
  }

  /** Best effort: the caller rethrows the original error regardless. */
  async discard(): Promise<void> {
    await Promise.all(this.written.map((u) => deleteMediaUrl(u)));
  }
}

// ---------- images ----------

function validateImageRequest(model: ImageModel, req: ImageGenerateRequest): void {
  // `auto` means "don't send an aspect ratio" and is valid for every model.
  if (req.aspectRatio !== "auto" && !model.aspectRatios.includes(req.aspectRatio)) {
    throw new UnsupportedOptionError(model.name, "aspect ratio", req.aspectRatio, model.aspectRatios);
  }
  if (!model.sizes.includes(req.size)) throw new UnsupportedOptionError(model.name, "size", req.size, model.sizes);
  const refs = req.referenceImages ?? [];
  if (refs.length > 0 && !model.caps.imageToImage) throw badRequest(`${model.name} does not accept reference images`);
  if (refs.length > model.caps.maxReferenceImages) {
    throw badRequest(`${model.name} accepts at most ${model.caps.maxReferenceImages} reference image(s)`);
  }
}

export async function createImageBatch(req: ImageGenerateRequest): Promise<Generation[]> {
  const key = requireApiKey();
  const model = findImageModel(req.model);
  if (!model) throw badRequest(`Unknown image model: ${req.model}`);
  validateImageRequest(model, req);
  assertCapacity(req.count); // early, so a full instance fails before any upload is written
  const uploads = new InputUploads();
  let refs: string[];
  try {
    refs = await uploads.many(req.referenceImages ?? [], "referenceImages");
    assertCapacity(req.count); // again: other requests were admitted while the inputs were persisted
  } catch (err) {
    await uploads.discard();
    throw err;
  }

  const params: ImageParams = { aspectRatio: req.aspectRatio, size: req.size };
  const inputs: GenerationInputs | undefined = refs.length > 0 ? { referenceImages: refs } : undefined;
  const batchId = `batch_${nanoid(10)}`;
  const gens: StoredGeneration[] = [];
  for (let i = 0; i < req.count; i++) {
    const ts = now();
    const g: StoredGeneration = {
      id: newId(), type: "image", status: "pending", prompt: req.prompt, model: model.id, modelName: model.name,
      params, batchId, batchIndex: i, createdAt: ts, updatedAt: ts,
    };
    if (inputs) g.inputs = inputs;
    insertGeneration(g);
    gens.push(g);
  }
  for (const g of gens) publishGeneration(toPublic(g));
  log.info(`batch ${batchId} submitted ${gens.length} image job(s) model=${model.id} refs=${refs.length}`);
  void runImageBatch(key, model, gens, refs);
  return gens.map(toPublic);
}

async function runImageBatch(key: string, model: ImageModel, gens: StoredGeneration[], refUrls: string[]): Promise<void> {
  let refDataUrls: string[];
  try {
    refDataUrls = await Promise.all(refUrls.map((u) => mediaUrlToDataUrl(u)));
  } catch (err) {
    for (const g of gens) failGeneration(g.id, err);
    return;
  }
  await Promise.allSettled(gens.map((g) => runImage(key, model, g, refDataUrls)));
}

async function runImage(key: string, model: ImageModel, g: StoredGeneration, refDataUrls: string[]): Promise<void> {
  const params = g.params as ImageParams;
  const startedAt = Date.now();
  if (!save(g.id, { status: "running" })) return; // deleted before it started: no provider call
  try {
    const payload = buildImagePayload(model, { prompt: g.prompt, aspectRatio: params.aspectRatio, size: params.size }, refDataUrls);
    let bytes: Uint8Array;
    let costUsd: number | undefined;
    if (payload.endpoint === "chat") {
      const r = await or.chatImage(key, payload.body);
      const parsed = parseDataUrl(r.dataUrl);
      if (!parsed) throw new Error("Provider returned an unreadable image data URL");
      bytes = parsed.bytes;
      costUsd = r.costUsd;
    } else {
      const r = await or.imagesGenerations(key, payload.body);
      bytes = new Uint8Array(Buffer.from(r.b64, "base64"));
      costUsd = r.costUsd;
    }
    const output = await saveImageOutput(g.id, bytes);
    if (!getGeneration(g.id)) {
      await deleteMediaUrl(output.url); // deleted while running
      return;
    }
    const elapsedMs = Date.now() - startedAt;
    const patch: Partial<StoredGeneration> = { status: "completed", output, completedAt: now(), elapsedMs };
    if (costUsd !== undefined) patch.costUsd = costUsd;
    save(g.id, patch);
    log.info(`job ${g.id} image completed model=${model.id} ${output.width ?? "?"}x${output.height ?? "?"} ${elapsedMs}ms cost=${fmtCost(costUsd)}`);
  } catch (err) {
    failGeneration(g.id, err);
  }
}

// ---------- videos ----------

function validateVideoRequest(model: VideoModel, req: VideoGenerateRequest, prompt: string): void {
  const hasFrames = Boolean(req.firstFrame || req.lastFrame);
  if (hasFrames && !model.caps.imageToVideo) throw badRequest(`${model.name} does not support image-to-video`);
  if (!hasFrames && !model.caps.textToVideo) throw badRequest(`${model.name} is image-to-video only. Add a first frame.`);
  if (req.lastFrame && !model.caps.lastFrame) throw badRequest(`${model.name} does not support a last-frame anchor`);
  if ((req.references?.length ?? 0) > 0 && model.caps.references === false) throw badRequest(`${model.name} does not accept style references`);
  if (!hasFrames && !prompt) throw badRequest("Prompt is required for text-to-video");
  // aspect_ratio is dropped on i2v for `omitAspectRatioOnI2v` models, so only validate it when it will be sent.
  const aspectUsed = req.aspectRatio !== undefined && !(model.omitAspectRatioOnI2v && hasFrames);
  if (aspectUsed && req.aspectRatio && !model.aspectRatios.includes(req.aspectRatio)) {
    throw new UnsupportedOptionError(model.name, "aspect ratio", req.aspectRatio, model.aspectRatios);
  }
  if (req.resolution !== undefined && !model.resolutions.includes(req.resolution)) {
    // Discovered models list no resolutions at all: the provider picks, so there is nothing to allow.
    if (model.resolutions.length === 0) throw badRequest(`${model.name} does not accept a resolution. Leave it unset.`);
    throw new UnsupportedOptionError(model.name, "resolution", req.resolution, model.resolutions);
  }
}

interface PreparedVideo extends VideoPayload {
  inputs: GenerationInputs;
}

/** Persist inputs, read them back, build the payload, then re-check capacity; the last step can 429. */
async function prepareVideo(model: VideoModel, req: VideoGenerateRequest, prompt: string, uploads: InputUploads): Promise<PreparedVideo> {
  const inputs: GenerationInputs = {};
  if (req.firstFrame) inputs.firstFrame = await uploads.one(req.firstFrame, "firstFrame");
  if (req.lastFrame) inputs.lastFrame = await uploads.one(req.lastFrame, "lastFrame");
  const refs = await uploads.many(req.references ?? [], "references");
  if (refs.length > 0) inputs.referenceImages = refs;

  const frames: { firstFrame?: string; lastFrame?: string } = {};
  if (inputs.firstFrame) frames.firstFrame = await mediaUrlToDataUrl(inputs.firstFrame);
  if (inputs.lastFrame) frames.lastFrame = await mediaUrlToDataUrl(inputs.lastFrame);
  const refDataUrls = await Promise.all(refs.map((u) => mediaUrlToDataUrl(u)));

  const { body, effective } = buildVideoPayload(
    model,
    { prompt, duration: req.duration, aspectRatio: req.aspectRatio, resolution: req.resolution, audio: req.audio },
    frames,
    refDataUrls,
  );
  assertCapacity(1); // again: other requests were admitted while the inputs were persisted and read back
  return { inputs, body, effective };
}

export async function createVideoGeneration(req: VideoGenerateRequest): Promise<Generation> {
  const key = requireApiKey();
  const model = await lookupVideoModel(req.model, key);
  if (!model || model.hidden) throw badRequest(`Unknown video model: ${req.model}`);
  const prompt = req.prompt.trim();
  validateVideoRequest(model, req, prompt);
  assertCapacity(1); // early, so a full instance fails before any upload is written

  const uploads = new InputUploads();
  let prepared: PreparedVideo;
  try {
    prepared = await prepareVideo(model, req, prompt, uploads);
  } catch (err) {
    await uploads.discard();
    throw err;
  }
  const { inputs, body, effective } = prepared;
  const params: VideoParams = { duration: effective.duration };
  if (effective.aspectRatio) params.aspectRatio = effective.aspectRatio;
  if (effective.resolution) params.resolution = effective.resolution;
  if (req.audio !== undefined) params.audio = req.audio;

  const ts = now();
  const g: StoredGeneration = {
    id: newId(), type: "video", status: "pending", prompt, model: model.id, modelName: model.name, params, createdAt: ts, updatedAt: ts,
  };
  if (Object.keys(inputs).length > 0) g.inputs = inputs;
  insertGeneration(g);
  publishGeneration(toPublic(g));

  try {
    const submitted = await or.submitVideo(key, body);
    const updated = save(g.id, { status: "running", providerJobId: submitted.id, pollingUrl: submitted.pollingUrl });
    log.info(
      `job ${g.id} video submitted model=${model.id} duration=${effective.duration}s res=${effective.resolution ?? "-"} ar=${effective.aspectRatio ?? "-"} audio=${body.generate_audio ?? "-"} frames=${body.frame_images?.length ?? 0} provider=${submitted.id}`,
    );
    ensurePoller();
    return toPublic(updated ?? g);
  } catch (err) {
    failGeneration(g.id, err);
    throw err;
  }
}

// ---------- poller ----------

let timer: NodeJS.Timeout | undefined;
const inFlight = new Set<string>();
/** Job ids already warned about a status outside the known sets (once per job, not every tick). */
const warnedUnknownStatus = new Set<string>();

export function ensurePoller(): void {
  if (timer) return;
  timer = setInterval(() => void pollTick(), POLL_INTERVAL_MS);
}

export function stopPoller(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}

export function pollerRunning(): boolean {
  return timer !== undefined;
}

function activeVideoJobs(): StoredGeneration[] {
  return listActiveGenerations().filter((g) => g.type === "video" && Boolean(g.pollingUrl));
}

export async function pollTick(): Promise<void> {
  const jobs = activeVideoJobs().filter((g) => !inFlight.has(g.id));
  if (jobs.length === 0 && inFlight.size === 0) {
    stopPoller();
    return;
  }
  await Promise.allSettled(jobs.map((g) => pollOne(g)));
}

/**
 * Only a 400 / 404 (or a url on a foreign origin) ends the job. 401 / 403 are
 * transient: the key may have just been rotated, so keep polling with whatever key
 * is configured until `JOB_TIMEOUT_MS` runs out.
 */
const isPermanent = (err: unknown): boolean => err instanceof or.ForeignOriginError || (err instanceof HttpError && [400, 404].includes(err.status));

async function pollOne(g: StoredGeneration): Promise<void> {
  inFlight.add(g.id);
  try {
    if (Date.now() - Date.parse(g.createdAt) > JOB_TIMEOUT_MS) {
      failGeneration(g.id, "Timed out waiting for provider");
      return;
    }
    const { key } = resolveApiKey();
    if (!key) return; // key removed: keep the job and wait for one
    let poll: or.VideoPollResult;
    try {
      poll = await or.pollVideo(key, g.pollingUrl ?? "");
    } catch (err) {
      if (isPermanent(err)) failGeneration(g.id, err);
      else log.warn(`job ${g.id} poll error (will retry): ${errorMessage(err)}`);
      return;
    }
    if (FAILED_STATUSES.has(poll.status)) {
      failGeneration(g.id, poll.error ?? `Provider reported status "${poll.status}"`);
      return;
    }
    if (PENDING_STATUSES.has(poll.status)) return;
    if (!DONE_STATUSES.has(poll.status)) {
      // Unknown status: an attached error means it is over; otherwise keep polling and say so once.
      if (poll.error) {
        failGeneration(g.id, poll.error);
      } else if (!warnedUnknownStatus.has(g.id)) {
        warnedUnknownStatus.add(g.id);
        log.warn(`job ${g.id} unknown provider status "${poll.status}" (will keep polling)`);
      }
      return;
    }

    const url = poll.urls[0];
    if (!url) {
      failGeneration(g.id, "Provider reported completion but returned no video url");
      return;
    }
    // Stream straight to a hidden temp file in the media dir; a 4K clip never sits in RAM.
    const partFile = videoDownloadPath(g.id);
    try {
      await or.downloadVideo(key, url, partFile);
    } catch (err) {
      if (isPermanent(err)) failGeneration(g.id, err);
      else log.warn(`job ${g.id} download error (will retry): ${errorMessage(err)}`);
      return;
    }
    if (!getGeneration(g.id)) {
      await removeFile(partFile); // deleted while downloading
      return;
    }
    const output = await saveVideoOutput(g.id, partFile, (g.params as VideoParams).duration);
    if (!getGeneration(g.id)) {
      await deleteMediaUrl(output.url);
      return;
    }
    const completedAt = now();
    const elapsedMs = Date.parse(completedAt) - Date.parse(g.createdAt);
    const patch: Partial<StoredGeneration> = { status: "completed", output, completedAt, elapsedMs };
    if (poll.costUsd !== undefined) patch.costUsd = poll.costUsd;
    warnedUnknownStatus.delete(g.id);
    save(g.id, patch);
    log.info(`job ${g.id} video completed model=${g.model} ${output.width ?? "?"}x${output.height ?? "?"} ${Math.round(elapsedMs / 1000)}s cost=${fmtCost(poll.costUsd)}`);
  } catch (err) {
    failGeneration(g.id, err);
  } finally {
    inFlight.delete(g.id);
  }
}

/**
 * On boot: sweep temp files a previous process left behind, resume polling video
 * jobs that have a polling url, and fail anything else left in flight.
 */
export function resumePendingJobs(): void {
  const swept = sweepTempFiles();
  if (swept > 0) log.info(`removed ${swept} orphaned temp file(s) from ${config.mediaDir}`);
  let resumed = 0;
  for (const g of listActiveGenerations()) {
    if (g.type === "video" && g.pollingUrl) resumed++;
    else failGeneration(g.id, "Server restarted before the job finished");
  }
  if (resumed > 0) {
    log.info(`resuming ${resumed} pending video job(s)`);
    ensurePoller();
    void pollTick();
  }
}

// ---------- delete / retry ----------

/**
 * Remove a record, its output file, and any uploaded inputs no other generation
 * still references. Publishes `generation-deleted` so open tabs drop the card.
 */
export async function removeGeneration(g: Generation): Promise<{ uploads: number }> {
  deleteGeneration(g.id);
  publishGenerationDeleted(g.id);
  await deleteMediaUrl(g.output?.url);
  let uploads = 0;
  for (const url of inputMediaUrls(g.inputs)) {
    if (countGenerationsReferencingMedia(url, g.id) > 0) continue;
    await deleteMediaUrl(url);
    uploads++;
  }
  return { uploads };
}

export async function retryGeneration(id: string): Promise<Generation[]> {
  const g = getGeneration(id);
  if (!g) throw notFound(`Generation ${id} not found`);
  if (g.status === "pending" || g.status === "running") throw conflict("Generation is still running");
  const known = g.type === "image" ? findImageModel(g.model) : await lookupVideoModel(g.model, resolveApiKey().key);
  if (!known || (known.kind === "video" && known.hidden)) {
    throw badRequest(`${g.modelName} (${g.model}) is no longer available. Generate a new one with a current model.`);
  }
  let out: Generation[];
  try {
    out = await resubmit(g);
  } catch (err) {
    // The record was valid when it was made; if the catalog moved on since, say which saved value it is.
    if (err instanceof UnsupportedOptionError) {
      throw badRequest(
        `Saved ${err.option} ${err.value} is no longer supported by ${err.modelName} (allowed: ${list(err.allowed)}). Generate a new one with the current options.`,
      );
    }
    throw err;
  }
  // A failed record has no output; replace it instead of leaving a duplicate behind.
  // Its uploads are kept: the new record references them.
  if (g.status === "failed") await removeGeneration(g);
  return out;
}

async function resubmit(g: Generation): Promise<Generation[]> {
  if (g.type === "image") {
    const p = g.params as ImageParams;
    const req: ImageGenerateRequest = { prompt: g.prompt, model: g.model, aspectRatio: p.aspectRatio ?? "auto", size: p.size ?? "1K", count: 1 };
    if (g.inputs?.referenceImages?.length) req.referenceImages = g.inputs.referenceImages;
    return createImageBatch(req);
  }
  const p = g.params as VideoParams;
  const req: VideoGenerateRequest = { prompt: g.prompt, model: g.model, duration: p.duration };
  if (p.aspectRatio) req.aspectRatio = p.aspectRatio;
  if (p.resolution) req.resolution = p.resolution;
  if (p.audio !== undefined) req.audio = p.audio;
  if (g.inputs?.firstFrame) req.firstFrame = g.inputs.firstFrame;
  if (g.inputs?.lastFrame) req.lastFrame = g.inputs.lastFrame;
  if (g.inputs?.referenceImages?.length) req.references = g.inputs.referenceImages;
  return [await createVideoGeneration(req)];
}
