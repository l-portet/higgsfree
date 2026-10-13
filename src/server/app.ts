import { STATUS_CODES } from "node:http";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "../shared/types.ts";
import { config } from "./config.ts";
import { HttpError } from "./errors.ts";
import { errorMessage, log } from "./log.ts";
import { eventsRoutes } from "./routes/events.ts";
import { generateRoutes } from "./routes/generate.ts";
import { generationsRoutes } from "./routes/generations.ts";
import { healthRoutes } from "./routes/health.ts";
import { mediaRoutes } from "./routes/media.ts";
import { modelsRoutes } from "./routes/models.ts";
import { creditsRoutes, settingsRoutes } from "./routes/settings.ts";
import { uploadRoutes } from "./routes/upload.ts";
import { securityGuard } from "./security.ts";

/**
 * The API as one Hono app, mounted by the Next.js route handlers under `/api/*` and
 * `/media/*`. Pages are Next's own; nothing here serves HTML.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    // Browsers must trust our Content-Type on /media/* and JSON, never sniff.
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    const ms = Math.round(performance.now() - started);
    log.info(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  });

  // Host / Origin / Content-Type guard, before every route (see security.ts).
  app.use("*", securityGuard({ allowedHosts: config.allowedHosts, trustHost: config.trustHost }));

  app.route("/api/health", healthRoutes);
  app.route("/api/settings", settingsRoutes);
  app.route("/api/credits", creditsRoutes);
  app.route("/api/models", modelsRoutes);
  app.route("/api/generate", generateRoutes);
  app.route("/api/generations", generationsRoutes);
  app.route("/api/upload", uploadRoutes);
  app.route("/api/events", eventsRoutes);
  app.route("/media", mediaRoutes);

  app.notFound((c) => {
    const body: ApiError = { error: `Not found: ${c.req.method} ${c.req.path}`, status: 404 };
    return c.json(body, 404);
  });

  app.onError((err, c) => {
    let body: ApiError;
    if (err instanceof HttpError) {
      body = err.toJSON();
    } else if (err instanceof HTTPException) {
      // e.g. hono's bodyLimit throws an HTTPException with an empty message and a bare Response.
      body = { error: err.message || err.res?.statusText || STATUS_CODES[err.status] || `HTTP ${err.status}`, status: err.status };
    } else if (err instanceof SyntaxError) {
      body = { error: `Invalid JSON body: ${err.message}`, status: 400 };
    } else {
      body = { error: errorMessage(err) || "Internal server error", status: 500 };
    }
    if (body.status >= 500) log.error(`${c.req.method} ${c.req.path} -> ${body.status}: ${body.error}`);
    return c.json(body, body.status as ContentfulStatusCode);
  });

  return app;
}
