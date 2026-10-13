/**
 * Video jobs: submit, then poll the provider every few seconds from the tab that holds the
 * job's lock, and stream the finished clip into the library. The lock is taken before the
 * record exists, so a pending video without a polling url whose lock is free can only be a
 * submit that died with its tab.
 */
import type { Generation, GenerationInputs, VideoGenerateRequest, VideoModel, VideoParams } from "@shared/types";
import { lookupVideoModel } from "../catalog";
import { completeGeneration, getGeneration, insertGenerations, toPublic, toStored, type StoredGeneration } from "../db/generations";
import type { MediaRow } from "../db/schema";
import { ApiClientError, badRequest, conflict } from "../errors";
import { publish } from "../live";
import { errorMessage, log } from "../log";
import { newGenerationId, outputMediaId } from "../media-ids";
import { parseMp4MetaFromRanges } from "../mp4-meta";
import * as or from "../openrouter";
import { buildVideoPayload, type VideoBody } from "../payloads";
import { getStoredKey, requireApiKey } from "../settings";
import { isQuotaError } from "../storage-health";
import { validateVideoRequest } from "../validate";
import { DONE_STATUSES, FAILED_STATUSES, JOB_TIMEOUT_MS, limits, PENDING_STATUSES, timing } from "./constants";
import { assertInputsExist, inputDataUrl, inputDataUrls } from "./inputs";
import { failGeneration, isCancelled, NOT_ACQUIRED, savePublish, tryWithJobLock } from "./state";

const fmtCost = (c: number | undefined): string => (c === undefined ? "n/a" : `$${c.toFixed(4)}`);

/**
 * Only a 400 / 404 (or a url on a foreign origin) ends the job. 401 / 403 are
 * transient: the key may have just been rotated, so keep polling with whatever key
 * is configured until `JOB_TIMEOUT_MS` runs out.
 */
const isPermanent = (err: unknown): boolean => err instanceof or.ForeignOriginError || (err instanceof ApiClientError && [400, 404].includes(err.status));

// ---------- a pause that ends early when the tab becomes visible or the job is cancelled ----------

const sleepers = new Set<() => void>();

/** Poll every running job now (a tab just became visible). */
export function nudgePolling(): void {
  for (const wake of [...sleepers]) wake();
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const wake = (): void => {
      clearTimeout(timer);
      sleepers.delete(wake);
      signal.removeEventListener("abort", wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    sleepers.add(wake);
    signal.addEventListener("abort", wake, { once: true });
  });
}

// ---------- submit ----------

interface PreparedVideo {
  id: string;
  key: string;
  model: VideoModel;
  prompt: string;
  inputs: GenerationInputs;
  body: VideoBody;
  params: VideoParams;
}

async function prepareVideo(req: VideoGenerateRequest): Promise<PreparedVideo> {
  const key = requireApiKey();
  const model = await lookupVideoModel(req.model, key);
  if (!model || model.hidden) throw badRequest(`Unknown video model: ${req.model}`);
  const prompt = req.prompt.trim();
  validateVideoRequest(model, req, prompt);
  const inputs: GenerationInputs = {};
  if (req.firstFrame) inputs.firstFrame = req.firstFrame;
  if (req.lastFrame) inputs.lastFrame = req.lastFrame;
  if (req.references?.length) inputs.referenceImages = req.references;
  await assertInputsExist(inputs);

  const frames: { firstFrame?: string; lastFrame?: string } = {};
  if (inputs.firstFrame) frames.firstFrame = await inputDataUrl(inputs.firstFrame);
  if (inputs.lastFrame) frames.lastFrame = await inputDataUrl(inputs.lastFrame);
  const refDataUrls = await inputDataUrls(inputs.referenceImages ?? []);
  const { body, effective } = buildVideoPayload(
    model,
    { prompt, duration: req.duration, aspectRatio: req.aspectRatio, resolution: req.resolution, audio: req.audio },
    frames,
    refDataUrls,
  );
  const params: VideoParams = { duration: effective.duration };
  if (effective.aspectRatio) params.aspectRatio = effective.aspectRatio;
  if (effective.resolution) params.resolution = effective.resolution;
  if (req.audio !== undefined) params.audio = req.audio;
  return { id: newGenerationId(), key, model, prompt, inputs, body, params };
}

/** Insert the pending record, submit, mark it running. Throws after failing the record. */
async function startVideo(p: PreparedVideo, signal: AbortSignal): Promise<StoredGeneration> {
  const ts = new Date().toISOString();
  const g: Generation = { id: p.id, type: "video", status: "pending", prompt: p.prompt, model: p.model.id, modelName: p.model.name, params: p.params, createdAt: ts, updatedAt: ts };
  if (Object.keys(p.inputs).length > 0) g.inputs = p.inputs;
  const row = toStored(g);
  await insertGenerations([row], limits.maxActiveJobs);
  publish({ type: "generation", generation: toPublic(row) });
  try {
    const submitted = await or.submitVideo(p.key, p.body, { signal });
    const running = await savePublish(p.id, { status: "running", providerJobId: submitted.id, pollingUrl: submitted.pollingUrl });
    if (!running) throw new ApiClientError(409, "Deleted before the provider accepted the job");
    log.info(
      `job ${p.id} video submitted model=${p.model.id} duration=${p.params.duration}s res=${p.params.resolution ?? "-"} ar=${p.params.aspectRatio ?? "-"} audio=${p.body.generate_audio ?? "-"} frames=${p.body.frame_images?.length ?? 0} provider=${submitted.id}`,
    );
    return running;
  } catch (err) {
    if (!isCancelled(signal)) await failGeneration(p.id, err);
    throw err;
  }
}

/**
 * Resolves once the provider accepted the job (the record is `running`); the poll loop
 * keeps going under the same lock until the clip is in the library or the job failed.
 */
export function submitVideo(req: VideoGenerateRequest): Promise<Generation> {
  return new Promise<Generation>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };
    void (async () => {
      let prepared: PreparedVideo;
      try {
        prepared = await prepareVideo(req);
      } catch (err) {
        settle(() => reject(err as Error));
        return;
      }
      const result = await tryWithJobLock(prepared.id, "video", async (signal) => {
        let started: StoredGeneration;
        try {
          started = await startVideo(prepared, signal);
        } catch (err) {
          settle(() => reject(err as Error));
          return;
        }
        settle(() => resolve(toPublic(started)));
        await pollLoop({ id: started.id, pollingUrl: started.pollingUrl ?? "", createdAt: started.createdAt, durationHint: prepared.params.duration }, signal);
      });
      if (result === NOT_ACQUIRED) settle(() => reject(conflict("A job with this id is already running")));
    })();
  });
}

// ---------- poll + download ----------

export interface VideoJob {
  id: string;
  pollingUrl: string;
  createdAt: string;
  /** The requested duration, used when the clip's own metadata has none. */
  durationHint: number;
}

export async function pollLoop(job: VideoJob, signal: AbortSignal): Promise<void> {
  let warnedUnknown = false;
  while (!signal.aborted) {
    if (!(await getGeneration(job.id).catch(() => undefined))) return; // deleted (maybe in another tab)
    const key = getStoredKey(); // re-read each tick: a rotated key applies at once; none means wait for one
    if (key) {
      let poll: or.VideoPollResult | undefined;
      try {
        poll = await or.pollVideo(key, job.pollingUrl, { signal });
      } catch (err) {
        if (signal.aborted) return;
        if (isPermanent(err)) {
          await failGeneration(job.id, err);
          return;
        }
        log.warn(`job ${job.id} poll error (will retry): ${errorMessage(err)}`);
      }
      if (poll) {
        if (FAILED_STATUSES.has(poll.status)) {
          await failGeneration(job.id, poll.error ?? `Provider reported status "${poll.status}"`);
          return;
        }
        if (DONE_STATUSES.has(poll.status)) {
          const url = poll.urls[0];
          if (!url) {
            await failGeneration(job.id, "Provider reported completion but returned no video url");
            return;
          }
          if (await finishVideo(job, key, url, poll.costUsd, signal)) return;
        } else {
          if (!PENDING_STATUSES.has(poll.status)) {
            // Unknown status: an attached error means it is over; otherwise keep polling and say so once.
            if (poll.error) {
              await failGeneration(job.id, poll.error);
              return;
            }
            if (!warnedUnknown) {
              warnedUnknown = true;
              log.warn(`job ${job.id} unknown provider status "${poll.status}" (will keep polling)`);
            }
          }
          if (Date.now() - Date.parse(job.createdAt) > JOB_TIMEOUT_MS) {
            await failGeneration(job.id, "Timed out waiting for provider");
            return;
          }
        }
      }
    }
    await sleep(timing.pollIntervalMs, signal);
  }
}

/** Stream the finished clip into the library. True when the job is over (completed, or failed for good); false to try again next tick. */
async function finishVideo(job: VideoJob, key: string, url: string, costUsd: number | undefined, signal: AbortSignal): Promise<boolean> {
  try {
    const stream = await or.openVideoStream(key, url, { signal });
    const blob = await new Response(stream).blob();
    const meta = await parseMp4MetaFromRanges(blob.size, async (start, end) => new Uint8Array(await blob.slice(start, end + 1).arrayBuffer()));
    const mediaId = outputMediaId(job.id, "mp4");
    const typed = blob.type === "video/mp4" ? blob : new Blob([blob], { type: "video/mp4" });
    const media: MediaRow = { id: mediaId, kind: "output", mime: "video/mp4", bytes: blob.size, createdAt: new Date().toISOString(), blob: typed };
    const output: Generation["output"] = { id: mediaId, mime: "video/mp4", bytes: blob.size, durationSec: meta.durationSec ?? job.durationHint };
    if (meta.width && meta.height) {
      output.width = meta.width;
      output.height = meta.height;
    }
    const completedAt = new Date().toISOString();
    const elapsedMs = Date.parse(completedAt) - Date.parse(job.createdAt);
    const patch = { status: "completed" as const, output, completedAt, elapsedMs, pollingUrl: undefined, ...(costUsd !== undefined ? { costUsd } : {}) };
    const done = await completeGeneration(job.id, patch, media);
    if (done) {
      publish({ type: "generation", generation: toPublic(done) });
      log.info(`job ${job.id} video completed ${output.width ?? "?"}x${output.height ?? "?"} ${Math.round(elapsedMs / 1000)}s cost=${fmtCost(costUsd)}`);
      onVideoCompleted?.();
    }
    return true;
  } catch (err) {
    if (isCancelled(signal)) return true;
    if (isPermanent(err) || isQuotaError(err)) {
      await failGeneration(job.id, err, costUsd !== undefined ? { costUsd } : {});
      return true;
    }
    log.warn(`job ${job.id} download error (will retry): ${errorMessage(err)}`);
    return false;
  }
}

let onVideoCompleted: (() => void) | undefined;
export function setOnVideoCompleted(fn: (() => void) | undefined): void {
  onVideoCompleted = fn;
}
