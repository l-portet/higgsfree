/**
 * The steward: every tab periodically looks for active records nobody is driving. A video
 * with a polling url is adopted; anything else was interrupted by a closed tab and is failed
 * (an image call cannot be resumed, and re-running it could bill twice).
 */
import { getGeneration, isActive, listActive } from "../db/generations";
import type { VideoParams } from "@shared/types";
import { errorMessage, log } from "../log";
import { pollLoop } from "./video";
import { failGeneration, NOT_ACQUIRED, tryWithJobLock } from "./state";

export const INTERRUPTED_IMAGE = "Interrupted: the page running this image was closed. OpenRouter may still have charged for it.";
export const INTERRUPTED_SUBMIT = "Interrupted before the provider accepted the job.";

/** One pass; safe to call often (a held lock is skipped without waiting). */
export async function resumeJobs(): Promise<void> {
  let active;
  try {
    active = await listActive();
  } catch (err) {
    log.warn(`steward: ${errorMessage(err)}`);
    return;
  }
  await Promise.allSettled(
    active.map((row) =>
      tryWithJobLock(row.id, row.type, async (signal) => {
        const fresh = await getGeneration(row.id); // the listing may be stale by now
        if (!fresh || !isActive(fresh)) return;
        if (fresh.type === "image") {
          await failGeneration(fresh.id, INTERRUPTED_IMAGE);
          return;
        }
        if (!fresh.pollingUrl) {
          await failGeneration(fresh.id, INTERRUPTED_SUBMIT);
          return;
        }
        log.info(`job ${fresh.id} video adopted`);
        await pollLoop({ id: fresh.id, pollingUrl: fresh.pollingUrl, createdAt: fresh.createdAt, durationHint: (fresh.params as VideoParams).duration }, signal);
      }).then((r) => {
        if (r === NOT_ACQUIRED) return; // another tab drives it
      }),
    ),
  );
}
