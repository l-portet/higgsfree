/**
 * Generation lifecycle without a resident process.
 *
 *  - Image batches run in the background of the request that created them
 *    (`runInBackground`: `waitUntil` on Vercel), in parallel, each one its own record.
 *  - Video jobs are submitted synchronously; from then on `advanceJobs()` moves every
 *    active job one step whenever a client asks for events (`GET /api/events`): it
 *    polls the provider, and when a clip is ready streams it into media storage.
 *    A per-row lease (`lock_until`) makes concurrent requests on other instances skip
 *    jobs somebody is already handling, and doubles as the 6 s poll spacing.
 *
 * Every status change is persisted with a fresh `updated_at`, which is what clients
 * poll for.
 */
import { nanoid } from "nanoid";
import type {
  Generation, GenerationInputs, ImageGenerateRequest, ImageModel, ImageParams, VideoGenerateRequest, VideoModel, VideoParams,
} from "../shared/types.ts";
import { findImageModel } from "../shared/models.ts";
import { runInBackground } from "./background.ts";
import { lookupVideoModel } from "./catalog.ts";
import { config } from "./config.ts";
import { badRequest, conflict, HttpError, notFound, UnsupportedOptionError } from "./errors.ts";
import { errorMessage, log } from "./log.ts";
import { deleteMediaUrl, inputMediaUrls, mediaUrlToDataUrl, normalizeInputUrl, parseDataUrl, saveImageOutput, saveVideoOutput, sweepTempFiles } from "./media.ts";
import * as or from "./openrouter.ts";
import { buildImagePayload, buildVideoPayload, type VideoPayload } from "./payloads.ts";
import {
  claimGeneration, countActiveGenerations, countGenerationsReferencingMedia, deleteGeneration, getGeneration, insertGeneration, listActiveGenerations,
  recordDeletion, setLease, toPublic, updateGeneration, type StoredGeneration,
} from "./repo.ts";
import { requireApiKey, resolveApiKey } from "./settings.ts";

export const POLL_INTERVAL_MS = 6_000;
export const JOB_TIMEOUT_MS = 45 * 60_000;
/** An image request is one provider call that cannot be resumed: past this the function that ran it is gone. */
export const IMAGE_TIMEOUT_MS = 10 * 60_000;
/** Lease held while one poll is in flight. */
const POLL_LEASE_MS = 30_000;
/** Lease held while a finished clip is being downloaded (it may outlive the request that started it). */
const DOWNLOAD_LEASE_MS = 10 * 60_000;
const PENDING_STATUSES = new Set(["pending", "queued", "processing", "running", "in_progress", "starting"]);
const DONE_STATUSES = new Set(["completed", "succeeded", "success", "done"]);
const FAILED_STATUSES = new Set(["failed", "error", "errored", "cancelled", "canceled", "rejected"]);

const newId = (): string => `gen_${nanoid(12)}`;
const now = (): string => new Date().toISOString();
const inMs = (ms: number): string => new Date(Date.now() + ms).toISOString();
const fmtCost = (c: number | undefined): string => (c === undefined ? "n/a" : `$${c.toFixed(4)}`);

const save = (id: string, patch: Partial<Omit<StoredGeneration, "id">>): Promise<StoredGeneration | undefined> => updateGeneration(id, patch);

async function failGeneration(id: string, err: unknown): Promise<void> {
  const message = errorMessage(err) || "Unknown error";
  warnedUnknownStatus.delete(id);
  const g = await save(id, { status: "failed", error: message, completedAt: now() });
  if (g) log.error(`job ${id} ${g.type} failed model=${g.model}: ${message}`);
}

export function activeJobCount(): Promise<number> {
  return countActiveGenerations();
}

/** 429 when `requested` more jobs would push pending + running past `MAX_ACTIVE_JOBS`. */
async function assertCapacity(requested: number): Promise<void> {
  const max = config.maxActiveJobs;
  if ((await countActiveGenerations()) + requested > max) {
    throw new HttpError(429, `Too many active generations (${max}). Wait for some to finish.`);
  }
}

const list = (values: readonly string[]): string => values.join(", ");

/**
 * Normalizes request inputs and remembers which `data:` ones it persisted, so a
 * validation or capacity failure later in the same call can remove them again
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
  const key = await requireApiKey();
  const model = findImageModel(req.model);
  if (!model) throw badRequest(`Unknown image model: ${req.model}`);
  validateImageRequest(model, req);
  await assertCapacity(req.count); // early, so a full instance fails before any upload is written
  const uploads = new InputUploads();
  let refs: string[];
  try {
    refs = await uploads.many(req.referenceImages ?? [], "referenceImages");
    await assertCapacity(req.count); // again: other requests were admitted while the inputs were persisted
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
    await insertGeneration(g);
    gens.push(g);
  }
  log.info(`batch ${batchId} submitted ${gens.length} image job(s) model=${model.id} refs=${refs.length}`);
  runInBackground(runImageBatch(key, model, gens, refs));
  return gens.map(toPublic);
}

async function runImageBatch(key: string, model: ImageModel, gens: StoredGeneration[], refUrls: string[]): Promise<void> {
  let refDataUrls: string[];
  try {
    refDataUrls = await Promise.all(refUrls.map((u) => mediaUrlToDataUrl(u)));
  } catch (err) {
    for (const g of gens) await failGeneration(g.id, err);
    return;
  }
  await Promise.allSettled(gens.map((g) => runImage(key, model, g, refDataUrls)));
}

async function runImage(key: string, model: ImageModel, g: StoredGeneration, refDataUrls: string[]): Promise<void> {
  const params = g.params as ImageParams;
  const startedAt = Date.now();
  if (!(await save(g.id, { status: "running" }))) return; // deleted before it started: no provider call
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
    if (!(await getGeneration(g.id))) {
      await deleteMediaUrl(output.url); // deleted while running
      return;
    }
    const elapsedMs = Date.now() - startedAt;
    const patch: Partial<StoredGeneration> = { status: "completed", output, completedAt: now(), elapsedMs };
    if (costUsd !== undefined) patch.costUsd = costUsd;
    await save(g.id, patch);
    log.info(`job ${g.id} image completed model=${model.id} ${output.width ?? "?"}x${output.height ?? "?"} ${elapsedMs}ms cost=${fmtCost(costUsd)}`);
  } catch (err) {
    await failGeneration(g.id, err);
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
  await assertCapacity(1); // again: other requests were admitted while the inputs were persisted and read back
  return { inputs, body, effective };
}

export async function createVideoGeneration(req: VideoGenerateRequest): Promise<Generation> {
  const key = await requireApiKey();
  const model = await lookupVideoModel(req.model, key);
  if (!model || model.hidden) throw badRequest(`Unknown video model: ${req.model}`);
  const prompt = req.prompt.trim();
  validateVideoRequest(model, req, prompt);
  await assertCapacity(1); // early, so a full instance fails before any upload is written

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
  await insertGeneration(g);

  try {
    const submitted = await or.submitVideo(key, body);
    const updated = await save(g.id, { status: "running", providerJobId: submitted.id, pollingUrl: submitted.pollingUrl });
    log.info(
      `job ${g.id} video submitted model=${model.id} duration=${effective.duration}s res=${effective.resolution ?? "-"} ar=${effective.aspectRatio ?? "-"} audio=${body.generate_audio ?? "-"} frames=${body.frame_images?.length ?? 0} provider=${submitted.id}`,
    );
    return toPublic(updated ?? g);
  } catch (err) {
    await failGeneration(g.id, err);
    throw err;
  }
}

// ---------- advancing active jobs ----------

/** Job ids already warned about a status outside the known sets (once per job, not every tick). */
const warnedUnknownStatus = new Set<string>();
let sweptTempFiles = false;

export interface AdvanceOptions {
  /** Await finished downloads instead of handing them to the background (tests). */
  wait?: boolean;
  /** Gap before the same job is polled again; `0` lets back-to-back ticks poll it (tests). */
  minIntervalMs?: number;
}

/**
 * Move every active job one step: fail what has timed out, poll each running video
 * whose lease is free, and start downloading finished clips. Cheap when nothing is
 * running (one indexed query). Called whenever a client asks for events.
 */
export async function advanceJobs(opts: AdvanceOptions = {}): Promise<void> {
  if (config.storage === "local" && !sweptTempFiles) {
    sweptTempFiles = true;
    const swept = sweepTempFiles();
    if (swept > 0) log.info(`removed ${swept} orphaned temp file(s) from ${config.mediaDir}`);
  }
  const active = await listActiveGenerations();
  if (active.length === 0) return;
  const polls: Promise<void>[] = [];
  const nowMs = Date.now();
  for (const g of active) {
    const age = nowMs - Date.parse(g.createdAt);
    if (g.type === "image") {
      if (age > IMAGE_TIMEOUT_MS) await failGeneration(g.id, "Timed out: the image request did not finish");
      continue;
    }
    if (!g.pollingUrl) {
      // Submit still in flight in another request, or that request died before it got a job id.
      if (age > IMAGE_TIMEOUT_MS) await failGeneration(g.id, "Timed out before the provider accepted the job");
      continue;
    }
    if (age > JOB_TIMEOUT_MS) {
      await failGeneration(g.id, "Timed out waiting for provider");
      continue;
    }
    polls.push(pollOne(g, opts));
  }
  await Promise.allSettled(polls);
}

/** One synchronous round for tests: every job is polled and finished downloads are awaited. */
export function pollTick(): Promise<void> {
  return advanceJobs({ wait: true, minIntervalMs: 0 });
}

/**
 * Only a 400 / 404 (or a url on a foreign origin) ends the job. 401 / 403 are
 * transient: the key may have just been rotated, so keep polling with whatever key
 * is configured until `JOB_TIMEOUT_MS` runs out.
 */
const isPermanent = (err: unknown): boolean => err instanceof or.ForeignOriginError || (err instanceof HttpError && [400, 404].includes(err.status));

async function pollOne(g: StoredGeneration, opts: AdvanceOptions): Promise<void> {
  const minInterval = opts.minIntervalMs ?? POLL_INTERVAL_MS;
  const at = now();
  if (!(await claimGeneration(g.id, inMs(POLL_LEASE_MS), at))) return; // polled too recently, or another instance is on it
  let leaseKept = false;
  try {
    const { key } = await resolveApiKey();
    if (!key) return; // key removed: keep the job and wait for one
    let poll: or.VideoPollResult;
    try {
      poll = await or.pollVideo(key, g.pollingUrl ?? "");
    } catch (err) {
      if (isPermanent(err)) await failGeneration(g.id, err);
      else log.warn(`job ${g.id} poll error (will retry): ${errorMessage(err)}`);
      return;
    }
    if (FAILED_STATUSES.has(poll.status)) {
      await failGeneration(g.id, poll.error ?? `Provider reported status "${poll.status}"`);
      return;
    }
    if (PENDING_STATUSES.has(poll.status)) return;
    if (!DONE_STATUSES.has(poll.status)) {
      // Unknown status: an attached error means it is over; otherwise keep polling and say so once.
      if (poll.error) {
        await failGeneration(g.id, poll.error);
      } else if (!warnedUnknownStatus.has(g.id)) {
        warnedUnknownStatus.add(g.id);
        log.warn(`job ${g.id} unknown provider status "${poll.status}" (will keep polling)`);
      }
      return;
    }
    const url = poll.urls[0];
    if (!url) {
      await failGeneration(g.id, "Provider reported completion but returned no video url");
      return;
    }
    // Finished: keep the lease for the download, which may outlive this request.
    await setLease(g.id, inMs(DOWNLOAD_LEASE_MS));
    leaseKept = true;
    const download = finishVideo(g, key, url, poll.costUsd);
    if (opts.wait) await download;
    else runInBackground(download);
  } catch (err) {
    await failGeneration(g.id, err);
  } finally {
    if (!leaseKept) await setLease(g.id, minInterval > 0 ? inMs(minInterval) : null).catch(() => undefined);
  }
}

/** Stream the finished clip into media storage and complete the record. Transient failures release the lease so the next tick retries. */
async function finishVideo(g: StoredGeneration, key: string, url: string, costUsd: number | undefined): Promise<void> {
  try {
    const body = await or.openVideoStream(key, url);
    const output = await saveVideoOutput(g.id, body, (g.params as VideoParams).duration);
    if (!(await getGeneration(g.id))) {
      await deleteMediaUrl(output.url); // deleted while downloading
      return;
    }
    const completedAt = now();
    const elapsedMs = Date.parse(completedAt) - Date.parse(g.createdAt);
    const patch: Partial<StoredGeneration> = { status: "completed", output, completedAt, elapsedMs };
    if (costUsd !== undefined) patch.costUsd = costUsd;
    warnedUnknownStatus.delete(g.id);
    await save(g.id, patch);
    await setLease(g.id, null);
    log.info(`job ${g.id} video completed model=${g.model} ${output.width ?? "?"}x${output.height ?? "?"} ${Math.round(elapsedMs / 1000)}s cost=${fmtCost(costUsd)}`);
  } catch (err) {
    if (isPermanent(err)) {
      await failGeneration(g.id, err);
    } else {
      log.warn(`job ${g.id} download error (will retry): ${errorMessage(err)}`);
      await setLease(g.id, null).catch(() => undefined);
    }
  }
}

// ---------- delete / retry ----------

/**
 * Remove a record, its output file, and any uploaded inputs no other generation
 * still references. Leaves a tombstone so other open tabs drop the card.
 */
export async function removeGeneration(g: Generation): Promise<{ uploads: number }> {
  await deleteGeneration(g.id);
  await recordDeletion(g.id);
  await deleteMediaUrl(g.output?.url);
  let uploads = 0;
  for (const url of inputMediaUrls(g.inputs)) {
    if ((await countGenerationsReferencingMedia(url, g.id)) > 0) continue;
    await deleteMediaUrl(url);
    uploads++;
  }
  return { uploads };
}

export async function retryGeneration(id: string): Promise<Generation[]> {
  const g = await getGeneration(id);
  if (!g) throw notFound(`Generation ${id} not found`);
  if (g.status === "pending" || g.status === "running") throw conflict("Generation is still running");
  const known = g.type === "image" ? findImageModel(g.model) : await lookupVideoModel(g.model, (await resolveApiKey()).key);
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
