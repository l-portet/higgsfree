/**
 * Settings and credits routes: the DB-stored key round-trips masked (never in
 * full), an env key always wins over the DB, defaults are validated against the
 * catalog, `POST /api/settings/test` maps an upstream 401 to "Invalid API key",
 * and `GET /api/credits` is cached for 30 s per key. Upstream is a `fetch` stub.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiError, CreditsResponse, SettingsResponse } from "../../shared/types.ts";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "../../shared/models.ts";

const DB_KEY = "sk-or-v1-dbkey0000111122223333444455556666777788889999aaaa";
const ENV_KEY = "sk-or-v1-envkey00001111222233334444555566667777888899990000";
const TTL_MS = 30_000; // credits.ts

interface Upstream {
  path: string;
  auth?: string;
}
const upstream: Upstream[] = [];
let unauthorized = false;

const fetchStub = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers = new Headers(init?.headers);
  const entry: Upstream = { path: new URL(url).pathname };
  const auth = headers.get("authorization");
  if (auth) entry.auth = auth;
  upstream.push(entry);
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (unauthorized) return json(401, { error: { message: "User not found.", code: 401 } });
  if (entry.path === "/api/v1/key") return json(200, { data: { label: "studio", limit: null, usage: 2.5, is_free_tier: false } });
  if (entry.path === "/api/v1/credits") return json(200, { data: { total_credits: 10, total_usage: 2.5 } });
  return json(404, { error: { message: `no route ${entry.path}` } });
});

let dataDir: string;
let app: Hono;
let dbmod: typeof import("../db.ts");
let repo: typeof import("../repo.ts");

async function buildApp(): Promise<void> {
  app = (await import("../app.ts")).createApp();
  dbmod = await import("../db.ts");
  repo = await import("../repo.ts");
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "higgsfree-settings-"));
  process.env.DATA_DIR = dataDir;
  process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:9"; // fetch is stubbed, never reached
  // Empty string: `config.envApiKey` becomes undefined and the project `.env` cannot fill it in.
  process.env.OPENROUTER_API_KEY = "";
  vi.stubGlobal("fetch", fetchStub);
  await buildApp();
  vi.useFakeTimers({ toFake: ["Date"] }); // only the clock; sockets and timeouts stay real
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  dbmod.closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const json = async (method: string, url: string, body: unknown): Promise<Response> =>
  app.request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getSettings = async (): Promise<SettingsResponse> => (await (await app.request("/api/settings")).json()) as SettingsResponse;
const advance = (ms: number): void => {
  vi.setSystemTime(Date.now() + ms);
};
const creditsCalls = (): Upstream[] => upstream.filter((u) => u.path === "/api/v1/key" || u.path === "/api/v1/credits");

describe("settings without an env key", () => {
  it("starts with no key and refuses credits", async () => {
    const s = await getSettings();
    expect(s).toMatchObject({ hasKey: false, keySource: null, defaults: { imageModel: DEFAULT_IMAGE_MODEL, videoModel: DEFAULT_VIDEO_MODEL } });
    expect(s).not.toHaveProperty("keyMasked");
    expect(s.dataDir).toBe(dataDir);
    expect(s.storage).toBe("local");
    const res = await app.request("/api/credits");
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiError).error).toContain("No OpenRouter key configured");
    expect(creditsCalls()).toHaveLength(0);
  });

  it("PUT saves the key to the DB and GET returns it masked, never in full", async () => {
    const res = await json("PUT", "/api/settings", { apiKey: `  ${DB_KEY}  ` });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SettingsResponse;
    expect(body).toMatchObject({ hasKey: true, keySource: "db", keyMasked: `${DB_KEY.slice(0, 9)}…${DB_KEY.slice(-4)}` });
    expect(JSON.stringify(body)).not.toContain(DB_KEY);
    expect(await repo.getSetting("openrouter_api_key")).toBe(DB_KEY); // trimmed

    const again = await getSettings();
    expect(again).toMatchObject({ hasKey: true, keySource: "db", keyMasked: body.keyMasked });
    expect(JSON.stringify(again)).not.toContain(DB_KEY);
    expect(await (await app.request("/api/health")).json()).toMatchObject({ ok: true, hasKey: true });
  });

  it("GET /api/credits uses the DB key and caches the answer for 30 s", async () => {
    upstream.length = 0;
    const res = await app.request("/api/credits");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 10, used: 2.5, remaining: 7.5, key: { label: "studio", limit: null, usage: 2.5, isFreeTier: false } });
    expect(creditsCalls().map((u) => u.path).sort()).toEqual(["/api/v1/credits", "/api/v1/key"]);
    expect(creditsCalls().every((u) => u.auth === `Bearer ${DB_KEY}`)).toBe(true);

    advance(TTL_MS - 1);
    expect((await app.request("/api/credits")).status).toBe(200);
    expect(creditsCalls()).toHaveLength(2); // served from cache, no upstream traffic

    advance(2); // now past the TTL
    expect(await (await app.request("/api/credits")).json()).toMatchObject({ remaining: 7.5 });
    expect(creditsCalls()).toHaveLength(4);
  });

  it("saving a key invalidates the credits cache", async () => {
    upstream.length = 0;
    expect((await app.request("/api/credits")).status).toBe(200);
    expect(creditsCalls()).toHaveLength(0); // still fresh
    expect((await json("PUT", "/api/settings", { apiKey: DB_KEY })).status).toBe(200);
    expect((await app.request("/api/credits")).status).toBe(200);
    expect(creditsCalls()).toHaveLength(2);
  });

  it("rejects unknown or hidden default models with a 400 and keeps the old defaults", async () => {
    const image = await json("PUT", "/api/settings", { defaults: { imageModel: "acme/not-a-model" } });
    expect(image.status).toBe(400);
    expect(await image.json()).toEqual({ error: "Unknown image model: acme/not-a-model", status: 400 });

    const video = await json("PUT", "/api/settings", { defaults: { videoModel: "acme/not-a-video-model" } });
    expect(video.status).toBe(400);
    expect(await video.json()).toEqual({ error: "Unknown video model: acme/not-a-video-model", status: 400 });

    const hidden = await json("PUT", "/api/settings", { defaults: { videoModel: "runway/aleph-2" } });
    expect(hidden.status).toBe(400);
    expect(((await hidden.json()) as ApiError).error).toBe("Unknown video model: runway/aleph-2");

    // A valid image model paired with a bad video model is rejected as a whole.
    const mixed = await json("PUT", "/api/settings", { defaults: { imageModel: "krea/krea-2-large", videoModel: "acme/nope" } });
    expect(mixed.status).toBe(400);
    expect((await getSettings()).defaults).toEqual({ imageModel: DEFAULT_IMAGE_MODEL, videoModel: DEFAULT_VIDEO_MODEL });
  });

  it("stores valid defaults", async () => {
    const res = await json("PUT", "/api/settings", { defaults: { imageModel: "krea/krea-2-large", videoModel: "kwaivgi/kling-v3.0-pro" } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as SettingsResponse).defaults).toEqual({ imageModel: "krea/krea-2-large", videoModel: "kwaivgi/kling-v3.0-pro" });
    expect((await getSettings()).defaults).toEqual({ imageModel: "krea/krea-2-large", videoModel: "kwaivgi/kling-v3.0-pro" });
  });

  it("400s on a malformed body", async () => {
    const long = await json("PUT", "/api/settings", { apiKey: "x".repeat(513) });
    expect(long.status).toBe(400);
    expect(((await long.json()) as ApiError).error).toMatch(/^Invalid request: apiKey/);
    const notJson = await app.request("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: "{nope" });
    expect(notJson.status).toBe(400);
    expect(((await notJson.json()) as ApiError).error).toMatch(/^Invalid JSON body/);
  });

  it("POST /test maps an upstream 401 to a clear Invalid API key error", async () => {
    unauthorized = true;
    upstream.length = 0;
    try {
      const res = await json("POST", "/api/settings/test", { apiKey: "sk-or-v1-definitely-wrong" });
      expect(res.status).toBe(401);
      const body = (await res.json()) as ApiError;
      expect(body.error).toBe("Invalid API key");
      expect(body.status).toBe(401);
      expect(body.provider).toEqual({ error: { message: "User not found.", code: 401 } });
      expect(upstream.every((u) => u.auth === "Bearer sk-or-v1-definitely-wrong")).toBe(true);
    } finally {
      unauthorized = false;
    }
  });

  it("POST /test with no body tests the configured key, and reports credits on success", async () => {
    upstream.length = 0;
    const res = await app.request("/api/settings/test", { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()) as CreditsResponse).toMatchObject({ total: 10, used: 2.5, remaining: 7.5 });
    expect(creditsCalls().every((u) => u.auth === `Bearer ${DB_KEY}`)).toBe(true);
    // An explicit key in the body wins over the stored one.
    upstream.length = 0;
    expect((await json("POST", "/api/settings/test", { apiKey: "sk-or-v1-other" })).status).toBe(200);
    expect(creditsCalls().every((u) => u.auth === "Bearer sk-or-v1-other")).toBe(true);
  });

  it("PUT with an empty apiKey clears the stored key", async () => {
    const res = await json("PUT", "/api/settings", { apiKey: "" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hasKey: false, keySource: null });
    expect(await repo.getSetting("openrouter_api_key")).toBeUndefined();
    expect((await getSettings()).hasKey).toBe(false);
    expect((await app.request("/api/credits")).status).toBe(401);
    const test = await app.request("/api/settings/test", { method: "POST" });
    expect(test.status).toBe(400);
    expect(((await test.json()) as ApiError).error).toContain("No key to test");
    // Leave a DB key behind for the env-wins scenario below.
    expect((await json("PUT", "/api/settings", { apiKey: DB_KEY })).status).toBe(200);
    expect((await getSettings()).keySource).toBe("db");
  });
});

describe("settings with OPENROUTER_API_KEY set", () => {
  beforeAll(async () => {
    // Same DATA_DIR (the DB key saved above is still on disk), fresh module graph so config re-reads the env.
    dbmod.closeDatabase();
    vi.resetModules();
    process.env.OPENROUTER_API_KEY = ENV_KEY;
    await buildApp();
  });

  it("reports the env key masked and ignores the DB key", async () => {
    expect(await repo.getSetting("openrouter_api_key")).toBe(DB_KEY); // still stored, just not used
    const s = await getSettings();
    expect(s).toMatchObject({ hasKey: true, keySource: "env", keyMasked: `${ENV_KEY.slice(0, 9)}…${ENV_KEY.slice(-4)}` });
    const raw = JSON.stringify(s);
    expect(raw).not.toContain(ENV_KEY);
    expect(raw).not.toContain(DB_KEY);
  });

  it("credits and key tests go upstream with the env key, not the DB key", async () => {
    upstream.length = 0;
    expect((await app.request("/api/credits")).status).toBe(200);
    expect((await app.request("/api/settings/test", { method: "POST" })).status).toBe(200);
    expect(creditsCalls()).toHaveLength(4);
    expect(creditsCalls().every((u) => u.auth === `Bearer ${ENV_KEY}`)).toBe(true);
    expect(upstream.some((u) => u.auth === `Bearer ${DB_KEY}`)).toBe(false);
  });

  it("PUT still writes the DB key but the env key keeps winning", async () => {
    const res = await json("PUT", "/api/settings", { apiKey: "sk-or-v1-newdbkey0000111122223333" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ keySource: "env", keyMasked: `${ENV_KEY.slice(0, 9)}…${ENV_KEY.slice(-4)}` });
    expect(await repo.getSetting("openrouter_api_key")).toBe("sk-or-v1-newdbkey0000111122223333");
    expect((await json("PUT", "/api/settings", { apiKey: "" })).status).toBe(200);
    expect((await getSettings()).keySource).toBe("env");
  });
});
