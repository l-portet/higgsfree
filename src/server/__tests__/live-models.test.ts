/**
 * Live availability must never hammer OpenRouter: without a key nothing is fetched;
 * a failed refresh is remembered for `LIVE_RETRY_MS` (the last good snapshot is served
 * meanwhile); a fresh snapshot is served for `LIVE_TTL_MS` without any request.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let hits = 0;
let healthy = false;
const LIVE_ID = "google/gemini-3-pro-image";

function mockOpenRouter(): Promise<{ server: http.Server; base: string }> {
  const server = http.createServer((_req, res) => {
    hits++;
    res.writeHead(healthy ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify(healthy ? { data: [{ id: LIVE_ID }] } : { error: { message: "User not found.", code: 401 } }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

/** The union fires its requests concurrently and rejects on the first failure; let the rest land. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 40));

let mock: http.Server;
let dataDir: string;
let app: Hono;
let or: typeof import("../openrouter.ts");
let dbmod: typeof import("../db.ts");

beforeAll(async () => {
  const m = await mockOpenRouter();
  mock = m.server;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "higgsfree-live-"));
  process.env.DATA_DIR = dataDir;
  process.env.OPENROUTER_API_KEY = "bad-key";
  process.env.OPENROUTER_BASE_URL = m.base;
  app = (await import("../app.ts")).createApp();
  or = await import("../openrouter.ts");
  dbmod = await import("../db.ts");
  vi.useFakeTimers({ toFake: ["Date"] }); // only the clock; sockets and timeouts stay real
});

afterAll(() => {
  vi.useRealTimers();
  dbmod.closeDatabase();
  mock.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const models = async (): Promise<{ live?: { available: string[] } }> => (await (await app.request("/api/models")).json()) as { live?: { available: string[] } };
const advance = (ms: number): void => {
  vi.setSystemTime(Date.now() + ms);
};
const N = 3; // endpoints unioned per refresh

describe("live model list", () => {
  it("never calls upstream without a key", async () => {
    expect(or.LIVE_MODEL_ENDPOINTS).toHaveLength(N);
    expect(await or.listLiveModels(undefined)).toBeUndefined();
    expect(await or.listLiveModels("")).toBeUndefined();
    await settle();
    expect(hits).toBe(0);
  });

  it("remembers a failed refresh: two page loads → one union, retried only after LIVE_RETRY_MS", async () => {
    expect((await models()).live).toBeUndefined();
    await settle();
    expect(hits).toBe(N);
    expect((await models()).live).toBeUndefined();
    await settle();
    expect(hits).toBe(N); // negative cache, no upstream traffic
    advance(or.LIVE_RETRY_MS + 1);
    expect((await models()).live).toBeUndefined();
    await settle();
    expect(hits).toBe(2 * N);
  });

  it("serves a fresh snapshot from cache, and the stale one while refreshes fail", async () => {
    healthy = true;
    advance(or.LIVE_RETRY_MS + 1);
    expect((await models()).live?.available).toEqual([LIVE_ID]);
    await settle();
    expect(hits).toBe(3 * N);
    expect((await models()).live?.available).toEqual([LIVE_ID]);
    await settle();
    expect(hits).toBe(3 * N); // fresh within LIVE_TTL_MS

    healthy = false;
    advance(or.LIVE_TTL_MS + 1);
    expect((await models()).live?.available).toEqual([LIVE_ID]); // stale-on-failure
    await settle();
    expect(hits).toBe(4 * N);
    expect((await models()).live?.available).toEqual([LIVE_ID]);
    await settle();
    expect(hits).toBe(4 * N); // and the failure is cached again
  });
});
