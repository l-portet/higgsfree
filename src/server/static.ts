/** Production only: serve the built client from `dist/client` with an SPA fallback. */
import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { config } from "./config.ts";
import { log } from "./log.ts";

const isApiPath = (p: string): boolean => p === "/api" || p.startsWith("/api/") || p === "/media" || p.startsWith("/media/");

export function mountStatic(app: Hono): void {
  if (!config.isProd) return;
  const indexFile = path.join(config.distDir, "index.html");
  if (!fs.existsSync(indexFile)) {
    log.warn(`static: ${indexFile} not found; run \`pnpm build\` to serve the client`);
    return;
  }
  const root = path.relative(process.cwd(), config.distDir) || ".";
  const files = serveStatic({
    root,
    onFound: (filePath, c) => {
      c.header("X-Content-Type-Options", "nosniff");
      if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes("/assets/")) {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });
  app.use("*", async (c, next) => {
    if (isApiPath(c.req.path)) return next();
    return files(c, next);
  });
  app.get("*", async (c) => {
    if (isApiPath(c.req.path)) return c.notFound();
    const html = await fs.promises.readFile(indexFile, "utf8");
    return c.html(html, 200, { "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
  });
  log.info(`static: serving ${root} with SPA fallback`);
}
