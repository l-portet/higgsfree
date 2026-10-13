/**
 * Work that must outlive the HTTP response (image generation, video downloads).
 * On Vercel, `waitUntil` keeps the function instance alive until the promise
 * settles (within the route's `maxDuration`); in `next dev`, Docker or tests the
 * process is long-lived and the promise simply keeps running.
 */
import { waitUntil } from "@vercel/functions";
import { errorMessage, log } from "./log.ts";

export function runInBackground(task: Promise<unknown>): void {
  const guarded = task.catch((err: unknown) => {
    log.error(`background task failed: ${errorMessage(err)}`);
  });
  try {
    waitUntil(guarded);
  } catch {
    /* no request context (tests, plain node): the promise is already running */
  }
}
