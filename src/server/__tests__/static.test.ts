/**
 * Production static serving (`static.ts`): the built client is served from
 * `dist/client`, unknown non-API paths fall back to `index.html`, `/api/*` and
 * `/media/*` never do (JSON 404), and hashed `/assets/*` files are immutable.
 *
 * `config.distDir` is fixed to `<project>/dist/client` (config.ts), so the test
 * points it at a throwaway build via `vi.mock` instead of relying on a real build.
 */
import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiError } from "../../shared/types.ts";

const state = await vi.hoisted(async () => {
  const fsm = await import("node:fs");
  const osm = await import("node:os");
  const pathm = await import("node:path");
  const root = fsm.mkdtempSync(pathm.join(osm.tmpdir(), "openhiggsfield-static-"));
  const distDir = pathm.join(root, "dist", "client");
  const emptyDist = pathm.join(root, "dist-empty");
  fsm.mkdirSync(pathm.join(distDir, "assets"), { recursive: true });
  fsm.mkdirSync(emptyDist, { recursive: true });
  fsm.writeFileSync(pathm.join(distDir, "index.html"), '<!doctype html><title>t</title><div id="root">SPA-SHELL</div>');
  fsm.writeFileSync(pathm.join(distDir, "assets", "app-abc123.js"), 'console.log("app")');
  fsm.writeFileSync(pathm.join(distDir, "assets", "app-abc123.css"), "body{margin:0}");
  fsm.writeFileSync(pathm.join(distDir, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  process.env.DATA_DIR = pathm.join(root, "data");
  process.env.NODE_ENV = "production";
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:9"; // never reached
  return { root, distDir, emptyDist, current: distDir };
});

vi.mock("../config.ts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../config.ts")>();
  // `distDir` is a getter so the second scenario below can repoint it without re-running this factory.
  const config = { ...mod.config, nodeEnv: "production", isProd: true };
  Object.defineProperty(config, "distDir", { enumerable: true, get: () => state.current });
  return { ...mod, config };
});

let app: Hono;
let dbmod: typeof import("../db.ts");
let server: ServerType;
let base = "";
const warnings: string[] = [];

beforeAll(async () => {
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
  app = (await import("../app.ts")).createApp();
  dbmod = await import("../db.ts");
  // A real listener for the cache-header checks: `serveStatic`'s `onFound` sets headers after the
  // Response is built, which only lands because `serve()` installs @hono/node-server's lightweight
  // Response (headers kept by reference). Under `app.request()` alone the header would be dropped.
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => resolve(info.port));
  });
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  dbmod.closeDatabase();
  fs.rmSync(state.root, { recursive: true, force: true });
});

const INDEX = fs.readFileSync(path.join(state.distDir, "index.html"), "utf8");

describe("static client in production", () => {
  it("serves index.html at / and static files by path, with nosniff", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe(INDEX);

    const svg = await app.request("/favicon.svg");
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toContain("image/svg+xml");
    expect(svg.headers.get("cache-control")).toBeNull(); // only /assets/* is immutable
    expect(svg.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("falls back to index.html for unknown non-API paths (client-side routing)", async () => {
    for (const p of ["/library", "/image/gen_abc", "/settings?tab=keys", "/deep/nested/route.with.dots"]) {
      const res = await app.request(p);
      expect(res.status, p).toBe(200);
      expect(res.headers.get("content-type"), p).toContain("text/html");
      expect(res.headers.get("cache-control"), p).toBe("no-cache");
      expect(res.headers.get("x-content-type-options"), p).toBe("nosniff");
      expect(await res.text(), p).toBe(INDEX);
    }
  });

  it("never serves the SPA shell for /api/* or /media/*: JSON 404s instead", async () => {
    const res = await app.request("/api/unknown");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Not found: GET /api/unknown", status: 404 });

    for (const p of ["/api", "/api/", "/api/health/extra", "/media", "/media/nope.png", "/media/"]) {
      const r = await app.request(p);
      expect(r.status, p).toBe(404);
      const body = (await r.json()) as ApiError;
      expect(body.status, p).toBe(404);
      expect(JSON.stringify(body), p).not.toContain("SPA-SHELL");
    }
    const post = await app.request("/api/unknown", { method: "POST" });
    expect(post.status).toBe(404);
    expect(((await post.json()) as ApiError).error).toBe("Not found: POST /api/unknown");
    // Real API routes are untouched by the static layer.
    expect((await app.request("/api/health")).status).toBe(200);
  });

  it("marks /assets/* as immutable with a one-year max-age and the right MIME (over a real socket)", async () => {
    const js = await fetch(`${base}/assets/app-abc123.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(js.headers.get("content-type")).toMatch(/javascript/);
    expect(js.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await js.text()).toBe('console.log("app")');

    const css = await fetch(`${base}/assets/app-abc123.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(css.headers.get("content-type")).toContain("text/css");

    // Everything else stays revalidatable: the shell (direct and via fallback) and root files.
    for (const p of ["/favicon.svg", "/"]) expect((await fetch(`${base}${p}`)).headers.get("cache-control"), p).toBeNull();
    const spa = await fetch(`${base}/library`);
    expect(spa.headers.get("cache-control")).toBe("no-cache");
    expect(await spa.text()).toBe(INDEX);
    const api = await fetch(`${base}/api/unknown`);
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: "Not found: GET /api/unknown", status: 404 });
  });

  it("does not leak files outside dist through dot segments", async () => {
    // WHATWG URL parsing collapses `..`; an encoded one must not be resolved by the file server.
    const res = await app.request("/assets/%2e%2e/%2e%2e/data/openhiggsfield.sqlite");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX); // SPA fallback, not the database
  });
});

describe("production without a built client", () => {
  beforeAll(async () => {
    dbmod.closeDatabase();
    vi.resetModules();
    state.current = state.emptyDist;
    warnings.length = 0;
    app = (await import("../app.ts")).createApp();
    dbmod = await import("../db.ts");
  });

  it("logs one warning and answers JSON 404 for page paths instead of hanging or crashing", async () => {
    expect(warnings.some((w) => w.includes("static:") && w.includes("index.html not found") && w.includes("pnpm build"))).toBe(true);
    const res = await app.request("/library");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found: GET /library", status: 404 });
    expect((await app.request("/api/health")).status).toBe(200);
  });
});
