/**
 * Video jobs: submit, then poll the provider every few seconds from the tab that holds the
 * job's lock, and store the finished clip in the library. The lock is taken before the record
 * exists, so a pending video without a polling url whose lock is free can only be a submit that
 * died with its tab.
 *
 * Three providers share that lifecycle: OpenRouter (`/api/v1/videos`, polling url, download with
 * the Bearer key), fal (queue submit, `status_url`, result json with a public CDN url) and kie.ai
 * (inputs uploaded first, `createTask`, `recordInfo` with the result urls and the credits charged).
 */
import type { Generation, GenerationInputs, MotionOrientation, ProviderId, VideoGenerateRequest, VideoModel, VideoParams } from "@shared/types";
import { lookupVideoModel } from "../catalog";
import { completeGeneration, getGeneration, insertGenerations, toPublic, toStored, type GenerationPatch, type StoredGeneration } from "../db/generations";
import { getMediaBlob } from "../db/media";
import type { MediaRow } from "../db/schema";
import { ApiClientError, badRequest, conflict } from "../errors";
import * as fal from "../fal";
import { buildFalVideoPayload } from "../fal-payloads";
import * as kie from "../kie";
import { buildKieVideoPayload } from "../kie-payloads";
import { publish } from "../live";
import { errorMessage, log } from "../log";
import { newGenerationId, outputMediaId } from "../media-ids";
import { parseMp4MetaFromRanges } from "../mp4-meta";
import * as or from "../openrouter";
import { buildVideoEditPayload, buildVideoPayload } from "../payloads";
import { getStoredKey } from "../settings";
import { isQuotaError } from "../storage-health";
import { sourceVideoProblem, validateVideoRequest } from "../validate";
import { DONE_STATUSES, FAILED_STATUSES, JOB_TIMEOUT_MS, limits, PENDING_STATUSES, timing } from "./constants";
import { assertInputsExist, inputDataUrl, inputDataUrls, inputVideoDataUrl } from "./inputs";
import { keyFor, resolveRun, videoRun } from "./provider";
import { failGeneration, isCancelled, NOT_ACQUIRED, savePublish, tryWithJobLock } from "./state";

const fmtCost = (c: number | undefined): string => (c === undefined ? "n/a" : `$${c.toFixed(4)}`);

/**
 * Only a 400 / 404 / 422 (or a url on a foreign origin) ends the job. 401 / 403 are
 * transient: the key may have just been rotated, so keep polling with whatever key
 * is configured until `JOB_TIMEOUT_MS` runs out.
 */
const isPermanent = (err: unknown): boolean =>
  err instanceof or.ForeignOriginError ||
  err instanceof fal.FalOriginError ||
  err instanceof kie.KieOriginError ||
  (err instanceof ApiClientError && [400, 404, 422].includes(err.status));

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

interface Submitted {
  jobId: string;
  pollingUrl: string;
}

interface PreparedVideo {
  id: string;
  provider: ProviderId;
  model: VideoModel;
  prompt: string;
  inputs: GenerationInputs;
  params: VideoParams;
  /** One line for the console. */
  summary: string;
  submit: (signal: AbortSignal) => Promise<Submitted>;
}

/** fal's limits on the motion-control reference video: 3 s minimum, 30 s following the video, 10 s following the image. */
export const MOTION_VIDEO_LIMITS = { minSec: 3, maxSec: { video: 30, image: 10 } } as const;

/** A stored video's length from its MP4 / MOV header; undefined for WebM, or when the header says nothing. */
async function storedVideoLength(blob: Blob): Promise<number | undefined> {
  if (blob.type === "video/webm") return undefined;
  const { durationSec } = await parseMp4MetaFromRanges(blob.size, async (start, end) => new Uint8Array(await blob.slice(start, end + 1).arrayBuffer()));
  return durationSec;
}

/** Check the reference video's length before anything is uploaded (MP4 / MOV; WebM is left to fal). */
async function assertMotionVideo(model: VideoModel, mediaId: string, orientation: MotionOrientation): Promise<void> {
  const blob = await getMediaBlob(mediaId);
  if (!blob) throw badRequest(`Reference video is no longer in the library (${mediaId})`);
  const durationSec = await storedVideoLength(blob);
  if (durationSec === undefined) return;
  const max = MOTION_VIDEO_LIMITS.maxSec[orientation];
  if (durationSec < MOTION_VIDEO_LIMITS.minSec) throw badRequest(`The reference video is ${durationSec.toFixed(1)} s. ${model.name} needs at least ${MOTION_VIDEO_LIMITS.minSec} s.`);
  if (durationSec > max + 0.05) {
    const hint = orientation === "image" ? " Switch to Follow video for up to 30 s." : "";
    throw badRequest(`The reference video is ${Math.round(durationSec)} s. ${model.name} takes up to ${max} s when following the ${orientation}.${hint}`);
  }
}

/**
 * Check the video to edit against the model's limits before it is uploaded or inlined (a length it cannot
 * read is left to the provider). Returns its length, which prices the run.
 */
async function assertSourceVideo(model: VideoModel, mediaId: string): Promise<number | undefined> {
  const blob = await getMediaBlob(mediaId);
  if (!blob) throw badRequest(`Video to edit is no longer in the library (${mediaId})`);
  const durationSec = await storedVideoLength(blob);
  const problem = sourceVideoProblem(model, durationSec, blob.size);
  if (problem) throw badRequest(problem);
  return durationSec;
}

async function prepareVideo(req: VideoGenerateRequest): Promise<PreparedVideo> {
  const model = await lookupVideoModel(req.model, getStoredKey());
  if (!model || model.hidden) throw badRequest(`Unknown video model: ${req.model}`);
  // 401 now when no provider of the model has a key; which one runs it is settled below, once the inputs are known.
  const keyed = resolveRun(model);
  const prompt = req.prompt.trim();
  validateVideoRequest(model, req, prompt);
  const inputs: GenerationInputs = {};
  if (req.firstFrame) inputs.firstFrame = req.firstFrame;
  if (req.lastFrame) inputs.lastFrame = req.lastFrame;
  if (req.references?.length) inputs.referenceImages = req.references;
  if (req.motionVideo) inputs.motionVideo = req.motionVideo;
  if (req.sourceVideo) inputs.sourceVideo = req.sourceVideo;
  await assertInputsExist(inputs);
  if (inputs.motionVideo) await assertMotionVideo(model, inputs.motionVideo, req.orientation ?? "video");
  const sourceSec = inputs.sourceVideo ? await assertSourceVideo(model, inputs.sourceVideo) : undefined;

  // The cheaper provider that takes the request runs it; when none with a key does, the key-based choice
  // stands and its refusal below says why.
  const { provider, key } =
    videoRun(model, {
      prompt,
      duration: req.duration,
      resolution: req.resolution,
      aspectRatio: req.aspectRatio,
      audio: req.audio,
      firstFrame: Boolean(req.firstFrame),
      lastFrame: Boolean(req.lastFrame),
      references: Boolean(inputs.referenceImages?.length),
      videoSec: sourceSec,
    }) ?? keyed;

  const frames: { firstFrame?: string; lastFrame?: string } = {};
  if (inputs.firstFrame) frames.firstFrame = await inputDataUrl(inputs.firstFrame);
  if (inputs.lastFrame) frames.lastFrame = await inputDataUrl(inputs.lastFrame);
  const id = newGenerationId();

  if (provider === "fal") {
    if (inputs.referenceImages?.length) {
      throw badRequest(`${model.name} on fal does not take style references. Remove them, or add an OpenRouter key in Settings.`);
    }
    const { motionVideo, sourceVideo } = inputs;
    const payload = buildFalVideoPayload(
      model,
      { prompt, duration: req.duration, aspectRatio: req.aspectRatio, resolution: req.resolution, audio: req.audio, orientation: req.orientation },
      { ...frames, ...(motionVideo ? { motionVideo: "pending-upload" } : {}), ...(sourceVideo ? { sourceVideo: "pending-upload" } : {}) },
    );
    // Both go in `video_url`: the reference video's movement, or the video being edited.
    const video = motionVideo ?? sourceVideo;
    return {
      id, provider, model, prompt, inputs, params: payload.params,
      summary: `endpoint=${payload.endpoint} duration=${payload.params.duration}s res=${payload.params.resolution ?? "-"} ar=${payload.params.aspectRatio ?? "-"}`,
      submit: async (signal) => {
        const input = { ...payload.input };
        if (video) {
          const blob = await getMediaBlob(video);
          if (!blob) throw badRequest(`${motionVideo ? "Reference video" : "Video to edit"} is no longer in the library (${video})`);
          input.video_url = await fal.upload(key, blob, video, signal);
        }
        const queued = await fal.submit(key, payload.endpoint, input, signal);
        return { jobId: queued.requestId, pollingUrl: queued.statusUrl };
      },
    };
  }

  if (provider === "kie") {
    const refDataUrls = await inputDataUrls(inputs.referenceImages ?? []);
    const sourceVideo = inputs.sourceVideo;
    const params = { prompt, duration: req.duration, aspectRatio: req.aspectRatio, resolution: req.resolution, audio: req.audio };
    // Checked now with placeholders (a refusal is a 400 before anything exists), sent at submit with the uploaded urls.
    const placeholder = "https://pending-upload";
    const planned = buildKieVideoPayload(model, params, {
      firstFrame: frames.firstFrame && placeholder,
      lastFrame: frames.lastFrame && placeholder,
      references: refDataUrls.map(() => placeholder),
      sourceVideo: sourceVideo && placeholder,
    });
    return {
      id, provider, model, prompt, inputs, params: planned.params,
      summary: `model=${planned.model} duration=${planned.params.duration}s res=${planned.params.resolution ?? "-"} ar=${planned.params.aspectRatio ?? "-"} audio=${planned.params.audio ?? "-"}`,
      submit: async (signal) => {
        // kie takes inputs by url only: each one goes to kie's file host first (kept 24 h).
        const upload = (dataUrl: string | undefined): Promise<string | undefined> => (dataUrl ? kie.uploadDataUrl(key, dataUrl, signal) : Promise.resolve(undefined));
        const [firstFrame, lastFrame, ...references] = await Promise.all([upload(frames.firstFrame), upload(frames.lastFrame), ...refDataUrls.map(upload)]);
        let sourceUrl: string | undefined;
        if (sourceVideo) {
          const blob = await getMediaBlob(sourceVideo);
          if (!blob) throw badRequest(`Video to edit is no longer in the library (${sourceVideo})`);
          sourceUrl = await kie.uploadFile(key, blob, sourceVideo, signal);
        }
        const payload = buildKieVideoPayload(model, params, { firstFrame, lastFrame, references: references.filter((u): u is string => Boolean(u)), sourceVideo: sourceUrl });
        const taskId = await kie.createTask(key, payload.model, payload.input, signal);
        return { jobId: taskId, pollingUrl: kie.taskUrl(taskId) };
      },
    };
  }

  if (inputs.sourceVideo) {
    // Inlined as a data URL, like frames: OpenRouter has no upload, and the browser no public url to give it.
    const body = buildVideoEditPayload(model, prompt, await inputVideoDataUrl(inputs.sourceVideo));
    return {
      id, provider, model, prompt, inputs, params: { duration: 0 },
      summary: "edit (source video inline)",
      submit: async (signal) => {
        const submitted = await or.submitVideo(key, body, { signal });
        return { jobId: submitted.id, pollingUrl: submitted.pollingUrl };
      },
    };
  }

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
  return {
    id, provider, model, prompt, inputs, params,
    summary: `duration=${effective.duration}s res=${effective.resolution ?? "-"} ar=${effective.aspectRatio ?? "-"} audio=${body.generate_audio ?? "-"} frames=${body.frame_images?.length ?? 0}`,
    submit: async (signal) => {
      const submitted = await or.submitVideo(key, body, { signal });
      return { jobId: submitted.id, pollingUrl: submitted.pollingUrl };
    },
  };
}

/** Insert the pending record, submit, mark it running. Throws after failing the record. */
async function startVideo(p: PreparedVideo, signal: AbortSignal): Promise<StoredGeneration> {
  const ts = new Date().toISOString();
  const g: Generation = {
    id: p.id, type: "video", status: "pending", prompt: p.prompt, model: p.model.id, modelName: p.model.name, params: p.params, provider: p.provider, createdAt: ts, updatedAt: ts,
  };
  if (Object.keys(p.inputs).length > 0) g.inputs = p.inputs;
  const row = toStored(g);
  await insertGenerations([row], limits.maxActiveJobs);
  publish({ type: "generation", generation: toPublic(row) });
  try {
    const submitted = await p.submit(signal);
    const running = await savePublish(p.id, { status: "running", providerJobId: submitted.jobId, pollingUrl: submitted.pollingUrl });
    if (!running) throw new ApiClientError(409, "Deleted before the provider accepted the job");
    log.info(`job ${p.id} video submitted model=${p.model.id} via=${p.provider} ${p.summary} job=${submitted.jobId}`);
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
        await pollLoop(jobOf(started), signal);
      });
      if (result === NOT_ACQUIRED) settle(() => reject(conflict("A job with this id is already running")));
    })();
  });
}

// ---------- poll + download ----------

export interface VideoJob {
  id: string;
  provider: ProviderId;
  pollingUrl: string;
  createdAt: string;
  /** The requested duration, used when the clip's own metadata has none (0 = unknown: motion control, video editing). */
  durationHint: number;
  params: VideoParams;
}

export function jobOf(row: StoredGeneration): VideoJob {
  const params = row.params as VideoParams;
  return { id: row.id, provider: row.provider ?? "openrouter", pollingUrl: row.pollingUrl ?? "", createdAt: row.createdAt, durationHint: params.duration, params };
}

/** One poll's verdict, the same for both providers. */
type PollOutcome =
  | { kind: "pending"; unknownStatus?: string }
  | { kind: "failed"; error: string }
  | { kind: "done"; costUsd?: number; download: () => Promise<Blob> };

async function pollOpenRouter(key: string, job: VideoJob, signal: AbortSignal): Promise<PollOutcome> {
  const poll = await or.pollVideo(key, job.pollingUrl, { signal });
  if (FAILED_STATUSES.has(poll.status)) return { kind: "failed", error: poll.error ?? `Provider reported status "${poll.status}"` };
  if (DONE_STATUSES.has(poll.status)) {
    const url = poll.urls[0];
    if (!url) return { kind: "failed", error: "Provider reported completion but returned no video url" };
    const out: PollOutcome = { kind: "done", download: async () => new Response(await or.openVideoStream(key, url, { signal })).blob() };
    if (poll.costUsd !== undefined) out.costUsd = poll.costUsd;
    return out;
  }
  if (PENDING_STATUSES.has(poll.status)) return { kind: "pending" };
  // Unknown status: an attached error means it is over; otherwise keep polling and say so once.
  return poll.error ? { kind: "failed", error: poll.error } : { kind: "pending", unknownStatus: poll.status };
}

async function pollKie(key: string, job: VideoJob, signal: AbortSignal): Promise<PollOutcome> {
  const t = await kie.task(key, job.pollingUrl, signal);
  if (t.state === "fail") return { kind: "failed", error: t.error ?? "kie.ai reported a failure" };
  if (t.state === "success") {
    const url = t.urls[0];
    if (!url) return { kind: "failed", error: "kie.ai reported success but returned no video url" };
    const out: PollOutcome = { kind: "done", download: () => kie.download(url, signal) };
    if (t.costUsd !== undefined) out.costUsd = t.costUsd;
    return out;
  }
  if (t.state === "waiting" || t.state === "queuing" || t.state === "generating") return { kind: "pending" };
  return { kind: "pending", unknownStatus: t.state };
}

async function pollFal(key: string, job: VideoJob, signal: AbortSignal): Promise<PollOutcome> {
  const st = await fal.status(key, job.pollingUrl, signal);
  if (st.status === "IN_QUEUE" || st.status === "IN_PROGRESS") return { kind: "pending" };
  if (st.status !== "COMPLETED") return { kind: "pending", unknownStatus: st.status };
  if (st.error) return { kind: "failed", error: st.error };
  const res = await fal.result<{ video?: { url?: string } }>(key, fal.responseUrlFor(job.pollingUrl), signal);
  const url = res.video?.url;
  if (!url) return { kind: "failed", error: "fal reported completion but returned no video url" };
  return { kind: "done", download: () => fal.download(url, signal) };
}

export async function pollLoop(job: VideoJob, signal: AbortSignal): Promise<void> {
  let warnedUnknown = false;
  while (!signal.aborted) {
    if (!(await getGeneration(job.id).catch(() => undefined))) return; // deleted (maybe in another tab)
    const key = keyFor(job.provider); // re-read each tick: a rotated key applies at once; none means wait for one
    if (key) {
      let outcome: PollOutcome | undefined;
      try {
        outcome = job.provider === "fal" ? await pollFal(key, job, signal) : job.provider === "kie" ? await pollKie(key, job, signal) : await pollOpenRouter(key, job, signal);
      } catch (err) {
        if (signal.aborted) return;
        if (isPermanent(err)) {
          await failGeneration(job.id, err);
          return;
        }
        log.warn(`job ${job.id} poll error (will retry): ${errorMessage(err)}`);
      }
      if (outcome?.kind === "failed") {
        await failGeneration(job.id, outcome.error);
        return;
      }
      if (outcome?.kind === "done" && (await finishVideo(job, outcome.download, outcome.costUsd, signal))) return;
      if (outcome?.kind === "pending") {
        if (outcome.unknownStatus && !warnedUnknown) {
          warnedUnknown = true;
          log.warn(`job ${job.id} unknown provider status "${outcome.unknownStatus}" (will keep polling)`);
        }
        if (Date.now() - Date.parse(job.createdAt) > JOB_TIMEOUT_MS) {
          await failGeneration(job.id, "Timed out waiting for provider");
          return;
        }
      }
    }
    await sleep(timing.pollIntervalMs, signal);
  }
}

/** Store the finished clip in the library. True when the job is over (completed, or failed for good); false to try again next tick. */
async function finishVideo(job: VideoJob, download: () => Promise<Blob>, costUsd: number | undefined, signal: AbortSignal): Promise<boolean> {
  try {
    const blob = await download();
    const meta = await parseMp4MetaFromRanges(blob.size, async (start, end) => new Uint8Array(await blob.slice(start, end + 1).arrayBuffer()));
    const mediaId = outputMediaId(job.id, "mp4");
    const typed = blob.type === "video/mp4" ? blob : new Blob([blob], { type: "video/mp4" });
    const media: MediaRow = { id: mediaId, kind: "output", mime: "video/mp4", bytes: blob.size, createdAt: new Date().toISOString(), blob: typed };
    const durationSec = meta.durationSec ?? (job.durationHint > 0 ? job.durationHint : undefined);
    const output: Generation["output"] = { id: mediaId, mime: "video/mp4", bytes: blob.size };
    if (durationSec !== undefined) output.durationSec = durationSec;
    if (meta.width && meta.height) {
      output.width = meta.width;
      output.height = meta.height;
    }
    const completedAt = new Date().toISOString();
    const elapsedMs = Date.parse(completedAt) - Date.parse(job.createdAt);
    const patch: GenerationPatch = { status: "completed", output, completedAt, elapsedMs, pollingUrl: undefined };
    if (costUsd !== undefined) patch.costUsd = costUsd;
    // Motion control and video editing: the clip is as long as the input video, known only now.
    if (job.durationHint === 0 && durationSec !== undefined) patch.params = { ...job.params, duration: Math.round(durationSec) };
    const done = await completeGeneration(job.id, patch, media);
    if (done) {
      publish({ type: "generation", generation: toPublic(done) });
      log.info(`job ${job.id} video completed via=${job.provider} ${output.width ?? "?"}x${output.height ?? "?"} ${Math.round(elapsedMs / 1000)}s cost=${fmtCost(costUsd)}`);
      onVideoCompleted?.(toPublic(done));
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

/** Called in the tab that finished the job (it holds the job's Web Lock), with the completed record. */
let onVideoCompleted: ((g: Generation) => void) | undefined;
export function setOnVideoCompleted(fn: ((g: Generation) => void) | undefined): void {
  onVideoCompleted = fn;
}
