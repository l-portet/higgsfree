import { Hono } from "hono";
import { collectEvents } from "../events.ts";
import { advanceJobs } from "../jobs.ts";

/**
 * Long-polling replacement for the old SSE stream: the client calls this every few
 * seconds with the cursor it got last time. Each call also moves every active video
 * job one step, which is what keeps jobs going without a resident process.
 */
export const eventsRoutes = new Hono().get("/", async (c) => {
  await advanceJobs();
  const res = await collectEvents(c.req.query("since"));
  return c.json(res, 200, { "Cache-Control": "no-store" });
});
