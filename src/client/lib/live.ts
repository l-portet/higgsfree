/**
 * Live updates without a server: every local write publishes a `ChangeEvent`, and a
 * BroadcastChannel carries it to the other tabs of this browser. The surface
 * (`connectEvents`, `subscribeEvents`, `subscribeEventStatus`) is the one the old
 * polling client had, so the stores and the shell are unchanged.
 */
import type { ChangeEvent } from "@shared/types";
import { countActive } from "./db/generations";
import { getDb } from "./db/index";
import { errorMessage, log } from "./log";

export type EventStatus = "connecting" | "open" | "closed";
type EventListener = (event: ChangeEvent) => void;
type StatusListener = (status: EventStatus) => void;

export const CHANNEL_NAME = "higgsfree:events";

const listeners = new Set<EventListener>();
const statusListeners = new Set<StatusListener>();

let status: EventStatus = "closed";
let connecting = false;
let channel: BroadcastChannel | undefined;

function setStatus(next: EventStatus): void {
  if (status === next) return;
  status = next;
  for (const fn of statusListeners) fn(next);
}

function dispatch(event: ChangeEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      console.error("[live] listener failed", err);
    }
  }
}

function isChangeEvent(v: unknown): v is ChangeEvent {
  return typeof v === "object" && v !== null && typeof (v as { type?: unknown }).type === "string";
}

/** Open the library and join the channel (idempotent). `closed` means IndexedDB is unavailable. */
export function connectEvents(): void {
  if (status === "open" || connecting) return;
  connecting = true;
  setStatus("connecting");
  void (async () => {
    try {
      await getDb();
    } catch (err) {
      connecting = false;
      setStatus("closed");
      log.warn(`library unavailable: ${errorMessage(err)}`);
      return;
    }
    if (!channel && typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e: MessageEvent<unknown>) => {
        if (isChangeEvent(e.data)) dispatch(e.data); // from another tab: dispatch, never re-broadcast
      };
    }
    connecting = false;
    setStatus("open");
    const pendingJobs = await countActive().catch(() => 0);
    dispatch({ type: "hello", pendingJobs });
  })();
}

/** Tests: leave the channel and forget the status. */
export function disconnectEvents(): void {
  channel?.close();
  channel = undefined;
  connecting = false;
  setStatus("closed");
}

/** Tell this tab and every other one about a write. */
export function publish(event: ChangeEvent): void {
  dispatch(event);
  try {
    channel?.postMessage(event);
  } catch (err) {
    log.warn(`broadcast failed: ${errorMessage(err)}`);
  }
}

export function subscribeEvents(fn: EventListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Subscribe to the feed status; fires immediately with the current value. */
export function subscribeEventStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => {
    statusListeners.delete(fn);
  };
}
