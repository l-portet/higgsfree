export const POLL_INTERVAL_MS = 6_000;
export const JOB_TIMEOUT_MS = 45 * 60_000;
/** An image request is one provider call that cannot be resumed: past this it has failed. */
export const IMAGE_TIMEOUT_MS = 10 * 60_000;
/** Ceiling on pending + running generations in this browser (all tabs). */
export const MAX_ACTIVE_JOBS = 8;
/** How often every tab looks for active jobs nobody is driving. */
export const STEWARD_INTERVAL_MS = 30_000;

export const PENDING_STATUSES = new Set(["pending", "queued", "processing", "running", "in_progress", "starting"]);
export const DONE_STATUSES = new Set(["completed", "succeeded", "success", "done"]);
export const FAILED_STATUSES = new Set(["failed", "error", "errored", "cancelled", "canceled", "rejected"]);

/** Mutable so tests can shorten the waits and the ceiling; production never changes them. */
export const timing = { pollIntervalMs: POLL_INTERVAL_MS, stewardIntervalMs: STEWARD_INTERVAL_MS };
export const limits = { maxActiveJobs: MAX_ACTIVE_JOBS };

/** Abort reason when the record was deleted while its job ran. */
export const CANCELLED = "higgsfree:cancelled";
