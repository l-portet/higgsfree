/** Tiny in-process event bus feeding the SSE endpoint. */
import { EventEmitter } from "node:events";
import type { Generation, ServerEvent } from "../shared/types.ts";

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishGeneration(generation: Generation): void {
  const event: ServerEvent = { type: "generation", generation };
  bus.emit("event", event);
}

/** A record was removed: explicit DELETE, or a failed record replaced by a retry. */
export function publishGenerationDeleted(id: string): void {
  const event: ServerEvent = { type: "generation-deleted", id };
  bus.emit("event", event);
}

export function subscribe(listener: (event: ServerEvent) => void): () => void {
  bus.on("event", listener);
  return () => {
    bus.off("event", listener);
  };
}

/** Open SSE connections, so shutdown can close them cleanly. */
const closers = new Set<() => void>();
export function trackStream(close: () => void): () => void {
  closers.add(close);
  return () => {
    closers.delete(close);
  };
}
export function closeAllStreams(): void {
  for (const close of [...closers]) {
    try {
      close();
    } catch {
      /* ignore */
    }
  }
  closers.clear();
}
export function openStreamCount(): number {
  return closers.size;
}
