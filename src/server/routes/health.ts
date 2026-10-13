import { Hono } from "hono";
import type { HealthResponse } from "../../shared/types.ts";
import { config } from "../config.ts";
import { activeJobCount } from "../jobs.ts";
import { resolveApiKey } from "../settings.ts";

export const healthRoutes = new Hono().get("/", (c) => {
  const body: HealthResponse = { ok: true, version: config.version, hasKey: Boolean(resolveApiKey().key), pendingJobs: activeJobCount() };
  return c.json(body);
});
