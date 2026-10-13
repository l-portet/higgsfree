/**
 * Job ownership across tabs: whoever holds `higgsfree:job:<id>` drives that job. Web Locks
 * release themselves when a tab closes, crashes or is discarded, which is exactly when
 * another tab (or the next visit) should take over.
 */
import { log } from "../log";

export const NOT_ACQUIRED: unique symbol = Symbol("not-acquired");

const JOB_PREFIX = "higgsfree:job:";
let warned = false;
/** Fallback when Web Locks are missing (plain http on a LAN address): one tab assumed. */
const held = new Set<string>();

/** Run `fn` if the lock is free, else resolve `NOT_ACQUIRED` without waiting. */
export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T | typeof NOT_ACQUIRED> {
  if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks) {
    return navigator.locks.request(name, { ifAvailable: true }, async (lock) => (lock ? fn() : NOT_ACQUIRED)) as Promise<T | typeof NOT_ACQUIRED>;
  }
  if (!warned) {
    warned = true;
    log.warn("Web Locks unavailable (not a secure context?): assuming this is the only tab");
  }
  if (held.has(name)) return NOT_ACQUIRED;
  held.add(name);
  try {
    return await fn();
  } finally {
    held.delete(name);
  }
}

export const jobLockName = (id: string): string => `${JOB_PREFIX}${id}`;
