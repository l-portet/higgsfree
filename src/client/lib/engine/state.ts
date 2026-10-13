/** What this tab is driving right now, and the one way a job ends badly. */
import type { GenerationType } from "@shared/types";
import { patchGeneration, toPublic, type GenerationPatch, type StoredGeneration } from "../db/generations";
import { publish } from "../live";
import { errorMessage, log } from "../log";
import { isQuotaError, quotaMessage } from "../storage-health";
import { CANCELLED } from "./constants";
import { jobLockName, NOT_ACQUIRED, withLock } from "./locks";

interface Inflight {
  controller: AbortController;
  type: GenerationType;
}

const inflight = new Map<string, Inflight>();

export const isCancelled = (signal: AbortSignal): boolean => signal.aborted && signal.reason === CANCELLED;

/** Abort the run this tab drives for `id` (the record was deleted). No-op for jobs other tabs hold. */
export function cancelJob(id: string): void {
  inflight.get(id)?.controller.abort(CANCELLED);
}

export function cancelAllJobs(): void {
  for (const { controller } of inflight.values()) controller.abort(CANCELLED);
}

/** Image calls cannot be resumed: closing the tab loses them (and still pays). */
export function drivingImageCount(): number {
  let n = 0;
  for (const job of inflight.values()) if (job.type === "image") n++;
  return n;
}

/**
 * Take the job's lock and run `fn` with an abort signal wired to `cancelJob`; `NOT_ACQUIRED`
 * when another tab (or another call in this one) already drives it.
 */
export function tryWithJobLock<T>(id: string, type: GenerationType, fn: (signal: AbortSignal) => Promise<T>): Promise<T | typeof NOT_ACQUIRED> {
  return withLock(jobLockName(id), async () => {
    const controller = new AbortController();
    inflight.set(id, { controller, type });
    try {
      return await fn(controller.signal);
    } finally {
      if (inflight.get(id)?.controller === controller) inflight.delete(id);
    }
  });
}

/** Write a patch and tell every tab. Undefined when the record is gone. */
export async function savePublish(id: string, patch: GenerationPatch): Promise<StoredGeneration | undefined> {
  const row = await patchGeneration(id, patch);
  if (row) publish({ type: "generation", generation: toPublic(row) });
  return row;
}

export async function failGeneration(id: string, err: unknown, extra: { costUsd?: number } = {}): Promise<void> {
  let message = errorMessage(err) || "Unknown error";
  if (isQuotaError(err)) {
    message = extra.costUsd !== undefined ? `Generated (cost $${extra.costUsd.toFixed(4)}) but couldn't be saved. ${quotaMessage()}` : `Couldn't be saved. ${quotaMessage()}`;
  }
  const patch: GenerationPatch = { status: "failed", error: message, completedAt: new Date().toISOString(), pollingUrl: undefined };
  if (extra.costUsd !== undefined) patch.costUsd = extra.costUsd;
  const row = await savePublish(id, patch).catch((e: unknown) => {
    log.error(`job ${id}: could not record the failure: ${errorMessage(e)}`);
    return undefined;
  });
  if (row) log.error(`job ${id} ${row.type} failed model=${row.model}: ${message}`);
}

export { NOT_ACQUIRED };
