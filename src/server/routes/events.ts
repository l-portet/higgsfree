import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ServerEvent } from "../../shared/types.ts";
import { openStreamCount, subscribe, trackStream } from "../events.ts";
import { activeJobCount } from "../jobs.ts";
import { errorMessage, log } from "../log.ts";

const PING_MS = 15_000;

export const eventsRoutes = new Hono().get("/", (c) => {
  c.header("X-Accel-Buffering", "no");
  return streamSSE(
    c,
    async (stream) => {
      let finish: () => void = () => {};
      const closed = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let cleaned = false;
      let untrack: () => void = () => {};
      let unsubscribe: () => void = () => {};
      const ping = setInterval(() => {
        stream.write(": ping\n\n").catch(cleanup);
      }, PING_MS);
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(ping);
        unsubscribe();
        untrack();
        finish();
        log.info(`sse client disconnected (${openStreamCount()} open)`);
      };
      const send = (event: ServerEvent): Promise<void> => stream.writeSSE({ data: JSON.stringify(event) }).catch(cleanup);

      stream.onAbort(cleanup);
      untrack = trackStream(cleanup);
      log.info(`sse client connected (${openStreamCount()} open)`);
      unsubscribe = subscribe((event) => {
        void send(event);
      });

      await send({ type: "hello", pendingJobs: activeJobCount() });
      await closed;
    },
    async (err) => {
      log.warn(`sse stream error: ${errorMessage(err)}`);
    },
  );
});
