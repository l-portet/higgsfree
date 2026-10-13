/**
 * Live updates by polling `GET /api/events` with the cursor from the previous answer.
 * There is no server-side stream: on Vercel a request is not a long-lived process, and
 * each poll is also what advances running video jobs. Fast while jobs are active, slow
 * when idle, slower in background tabs, exponential backoff while the server is
 * unreachable, and an immediate poll when a tab becomes visible again.
 *
 * The surface (`connectEvents`, `subscribeEvents`, `subscribeEventStatus`) is the one
 * the old SSE client had, so the stores and the shell are unchanged.
 */
import type { ServerEvent } from "@shared/types";
import * as api from "@/lib/api";

export type EventStatus = "connecting" | "open" | "closed";
type EventListener = (event: ServerEvent) => void;
type StatusListener = (status: EventStatus) => void;

export const ACTIVE_INTERVAL_MS = 2_500;
export const IDLE_INTERVAL_MS = 20_000;
export const HIDDEN_INTERVAL_MS = 60_000;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

const listeners = new Set<EventListener>();
const statusListeners = new Set<StatusListener>();

let status: EventStatus = "closed";
let wanted = false;
let inFlight = false;
let cursor: string | undefined;
let attempt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Active jobs as counted by the server on the last poll. */
let pendingJobs = 0;
/** Stay fast until then, set when a page just submitted something the server may not count yet. */
let busyUntil = 0;

function setStatus(next: EventStatus) {
  if (status === next) return;
  status = next;
  for (const fn of statusListeners) fn(next);
}

function dispatch(event: ServerEvent) {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      console.error("[live] listener failed", err);
    }
  }
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function nextDelay(): number {
  if (status === "closed") return Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** attempt) + Math.random() * 400;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return HIDDEN_INTERVAL_MS;
  return pendingJobs > 0 || Date.now() < busyUntil ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
}

function schedule(ms = nextDelay()) {
  if (!wanted) return;
  clearTimer();
  timer = setTimeout(() => {
    timer = null;
    void poll();
  }, ms);
}

async function poll(): Promise<void> {
  if (!wanted || inFlight) return;
  inFlight = true;
  try {
    const res = await api.getEvents(cursor);
    cursor = res.cursor;
    pendingJobs = res.pendingJobs;
    attempt = 0;
    setStatus("open");
    for (const ev of res.events) dispatch(ev);
  } catch {
    attempt = Math.min(attempt + 1, 6);
    setStatus("closed");
  } finally {
    inFlight = false;
    schedule();
  }
}

/** Start (idempotent). */
export function connectEvents(): void {
  wanted = true;
  if (inFlight || timer) return;
  setStatus("connecting");
  void poll();
}

export function subscribeEvents(fn: EventListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Subscribe to connection status; fires immediately with the current value. */
export function subscribeEventStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => {
    statusListeners.delete(fn);
  };
}

/** Something was just submitted: poll now and keep polling fast for a while. */
export function nudgeEvents(busyMs = 15_000): void {
  busyUntil = Math.max(busyUntil, Date.now() + busyMs);
  if (wanted && !inFlight) schedule(0);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wanted && !inFlight) {
      attempt = 0;
      schedule(0);
    }
  });
}
