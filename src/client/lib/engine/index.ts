/**
 * Generation lifecycle, entirely in the browser.
 *
 *  - Image batches run in the tab that submitted them, in parallel, each one its own record.
 *  - Video jobs are submitted, then polled every few seconds by the tab holding the job's
 *    Web Lock; the finished clip is downloaded with the key into the library.
 *  - A steward tick in every open tab adopts video jobs nobody drives (a closed tab) and
 *    fails interrupted image jobs.
 *
 * Every status change is written to IndexedDB first, then published to every tab.
 */
import type { Generation, ImageGenerateRequest, ImageParams, VideoGenerateRequest, VideoParams } from "@shared/types";
import { lookupImageModel, lookupVideoModel } from "../catalog";
import { getGeneration, isActive, removeGeneration, toPublic } from "../db/generations";
import { sweepOrphanUploads } from "../db/media";
import { badRequest, conflict, notFound, UnsupportedOptionError } from "../errors";
import { publish, subscribeEvents } from "../live";
import { errorMessage, log } from "../log";
import { getStoredKey } from "../settings";
import { timing } from "./constants";
import { setOnCompleted, submitImageBatch } from "./image";
import { withLock } from "./locks";
import { resumeJobs } from "./resume";
import { cancelAllJobs, cancelJob } from "./state";
import { nudgePolling, setOnVideoCompleted, submitVideo } from "./video";

export { submitImageBatch } from "./image";
export { submitVideo } from "./video";
export { cancelAllJobs, cancelJob, drivingImageCount } from "./state";
export { resumeJobs } from "./resume";
export * from "./constants";

let started = false;
let steward: ReturnType<typeof setInterval> | undefined;
let unsubscribe: (() => void) | undefined;

function onVisibilityChange(): void {
  if (document.visibilityState !== "visible") return;
  nudgePolling();
  void resumeJobs();
}

/**
 * Boot the engine once per tab: sweep orphan uploads, resume jobs, start the steward. Browser only.
 * `onCompleted` fires for every finished run; `onVideoCompleted` for a finished video, in the tab that drove it.
 */
export function startEngine(opts: { onCompleted?: () => void; onVideoCompleted?: (g: Generation) => void } = {}): void {
  if (started || typeof window === "undefined") return;
  started = true;
  setOnCompleted(opts.onCompleted);
  setOnVideoCompleted((g) => {
    opts.onCompleted?.();
    opts.onVideoCompleted?.(g);
  });
  unsubscribe = subscribeEvents((ev) => {
    if (ev.type === "generation-deleted") cancelJob(ev.id);
    else if (ev.type === "reset") cancelAllJobs();
  });
  void withLock("higgsfree:sweep", () => sweepOrphanUploads())
    .then((n) => {
      if (typeof n === "number" && n > 0) log.info(`removed ${n} orphaned upload(s)`);
    })
    .catch((err: unknown) => log.warn(`sweep failed: ${errorMessage(err)}`));
  void resumeJobs();
  steward = setInterval(() => void resumeJobs(), timing.stewardIntervalMs);
  document.addEventListener("visibilitychange", onVisibilityChange);
}

/** Tests: stop the steward and abort what this tab drives. */
export function stopEngine(): void {
  if (!started) return;
  started = false;
  if (steward) clearInterval(steward);
  steward = undefined;
  unsubscribe?.();
  unsubscribe = undefined;
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
  cancelAllJobs();
}

const list = (values: readonly string[]): string => values.join(", ");

/**
 * Re-submit a finished record with its saved prompt, inputs and options. A failed record is
 * replaced (removed once the new one exists; its uploads survive because the new one references them).
 */
export async function retryGeneration(id: string): Promise<Generation[]> {
  const g = await getGeneration(id);
  if (!g) throw notFound(`Generation ${id} not found`);
  if (isActive(g)) throw conflict("Generation is still running");
  const known = g.type === "image" ? await lookupImageModel(g.model, getStoredKey()) : await lookupVideoModel(g.model, getStoredKey());
  if (!known || (known.kind === "video" && known.hidden)) {
    throw badRequest(`${g.modelName} (${g.model}) is no longer available. Generate a new one with a current model.`);
  }
  let out: Generation[];
  try {
    out = await resubmit(toPublic(g));
  } catch (err) {
    // The record was valid when it was made; if the catalog moved on since, say which saved value it is.
    if (err instanceof UnsupportedOptionError) {
      throw badRequest(
        `Saved ${err.option} ${err.value} is no longer supported by ${err.modelName} (allowed: ${list(err.allowed)}). Generate a new one with the current options.`,
      );
    }
    throw err;
  }
  if (g.status === "failed") {
    const removed = await removeGeneration(g.id);
    if (removed) publish({ type: "generation-deleted", id: g.id });
  }
  return out;
}

async function resubmit(g: Generation): Promise<Generation[]> {
  if (g.type === "image") {
    const p = g.params as ImageParams;
    const req: ImageGenerateRequest = { prompt: g.prompt, model: g.model, aspectRatio: p.aspectRatio ?? "auto", size: p.size ?? "1K", count: 1 };
    if (g.inputs?.referenceImages?.length) req.referenceImages = g.inputs.referenceImages;
    // An upscale runs again at the same scale and mode.
    if (p.upscale) req.upscale = p.upscale;
    if (p.creative) req.creative = true;
    return submitImageBatch(req);
  }
  const p = g.params as VideoParams;
  const req: VideoGenerateRequest = { prompt: g.prompt, model: g.model, duration: p.duration };
  if (p.aspectRatio) req.aspectRatio = p.aspectRatio;
  if (p.resolution) req.resolution = p.resolution;
  if (p.audio !== undefined) req.audio = p.audio;
  if (p.upscale) req.upscale = p.upscale;
  if (p.creative) req.creative = true;
  if (g.inputs?.firstFrame) req.firstFrame = g.inputs.firstFrame;
  if (g.inputs?.lastFrame) req.lastFrame = g.inputs.lastFrame;
  if (g.inputs?.referenceImages?.length) req.references = g.inputs.referenceImages;
  if (g.inputs?.motionVideo) req.motionVideo = g.inputs.motionVideo;
  if (g.inputs?.sourceVideo) req.sourceVideo = g.inputs.sourceVideo;
  if (p.orientation) req.orientation = p.orientation;
  return [await submitVideo(req)];
}
