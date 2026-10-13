/**
 * `/api/events` subscription with auto-reconnect.
 *
 * The browser's EventSource reconnects on its own when an open stream drops,
 * but gives up (readyState CLOSED) when the response isn't a valid stream;
 * e.g. the Vite proxy answering 500 while the API server is down. We cover
 * that case with exponential backoff and a visibility-change nudge.
 */
import type { ServerEvent } from "@shared/types";

export type EventStatus = "connecting" | "open" | "closed";
type EventListener = (event: ServerEvent) => void;
type StatusListener = (status: EventStatus) => void;

const EVENTS_URL = "/api/events";
const MIN_DELAY = 1_000;
const MAX_DELAY = 30_000;

const listeners = new Set<EventListener>();
const statusListeners = new Set<StatusListener>();

let source: EventSource | null = null;
let status: EventStatus = "closed";
let wanted = false;
let attempt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

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
      console.error("[sse] listener failed", err);
    }
  }
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function scheduleReconnect() {
  if (!wanted || timer) return;
  const base = Math.min(MAX_DELAY, MIN_DELAY * 2 ** attempt);
  const delay = base + Math.random() * 400;
  attempt = Math.min(attempt + 1, 6);
  timer = setTimeout(() => {
    timer = null;
    open();
  }, delay);
}

function open() {
  if (typeof EventSource === "undefined") return;
  if (source) {
    source.close();
    source = null;
  }
  setStatus("connecting");
  const es = new EventSource(EVENTS_URL);
  source = es;

  es.onopen = () => {
    attempt = 0;
    setStatus("open");
  };
  es.onmessage = (e: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(e.data) as ServerEvent;
      if (parsed && typeof parsed === "object" && "type" in parsed) dispatch(parsed);
    } catch {
      /* ignore malformed frames */
    }
  };
  es.onerror = () => {
    if (source !== es) return;
    if (es.readyState === EventSource.CLOSED) {
      es.close();
      source = null;
      setStatus("closed");
      scheduleReconnect();
    } else {
      setStatus("connecting");
    }
  };
}

/** Start (idempotent). */
export function connectEvents(): void {
  wanted = true;
  if (source) return;
  clearTimer();
  open();
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

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wanted && !source) {
      clearTimer();
      attempt = 0;
      open();
    }
  });
}
