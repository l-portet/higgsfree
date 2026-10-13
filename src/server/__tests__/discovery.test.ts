/**
 * Auto-discovery of video models: a slug OpenRouter lists under
 * `output_modalities=video` that the catalog does not know is exposed as a
 * synthesized "discovered" model, can be generated with (no `resolution` sent)
 * and set as the default. Also the catalog corrections verified against real
 * provider errors: FLUX.3 Video rejects style references, Wan 3.0 rejects a
 * last frame. Local mock of OpenRouter, no network.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IMAGE_MODELS, VIDEO_MODELS } from "../../shared/models.ts";
import type { Generation, VideoModel } from "../../shared/types.ts";

const UNKNOWN = "acme/dream-video-1";
const UNKNOWN_KNOWN_VENDOR = "minimax/hailuo-9";
const LIVE_VIDEO = [
  ...VIDEO_MODELS.map((m) => ({ id: m.id, name: m.name, architecture: { input_modalities: ["text", "image"] } })),
  { id: UNKNOWN, name: "Acme: Dream Video 1", description: "Acme's video model", architecture: { input_modalities: ["text", "image"] } },
  { id: UNKNOWN_KNOWN_VENDOR, name: "MiniMax: Hailuo 9", architecture: { input_modalities: ["text"] } },
];

interface Seen {
  url: string;
  body?: Record<string, unknown>;
}
const seen: Seen[] = [];

function mockOpenRouter(): Promise<{ server: http.Server; base: string }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const entry: Seen = { url: req.url ?? "" };
      if (raw) entry.body = JSON.parse(raw) as Record<string, unknown>;
      seen.push(entry);
      const json = (status: number, payload: unknown): void => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      const url = req.url ?? "";
      if (url === "/api/v1/models?output_modalities=image") return json(200, { data: IMAGE_MODELS.map((m) => ({ id: m.id })) });
      if (url === "/api/v1/models?output_modalities=video") return json(200, { data: LIVE_VIDEO });
      if (url === "/api/v1/images/models") return json(200, { data: [] });
      if (url === "/api/v1/videos") return json(202, { id: `vid_${seen.length}`, polling_url: `/api/v1/videos/vid_${seen.length}`, status: "pending" });
      if (url.startsWith("/api/v1/videos/")) return json(200, { status: "processing" });
      return json(404, { error: { message: `no route ${url}` } });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

let mock: http.Server;
let dataDir: string;
let app: Hono;
let jobs: typeof import("../jobs.ts");
let dbmod: typeof import("../db.ts");

beforeAll(async () => {
  const m = await mockOpenRouter();
  mock = m.server;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openhiggsfield-discovery-"));
  process.env.DATA_DIR = dataDir;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_BASE_URL = m.base;
  process.env.NODE_ENV = "test";
  app = (await import("../app.ts")).createApp();
  jobs = await import("../jobs.ts");
  dbmod = await import("../db.ts");
});

afterAll(() => {
  jobs.stopPoller();
  dbmod.closeDatabase();
  mock.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const post = async (url: string, body: unknown, method = "POST"): Promise<Response> =>
  app.request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const errorOf = async (res: Response): Promise<string> => ((await res.json()) as { error: string }).error;
const lastSubmit = (): Record<string, unknown> | undefined => seen.filter((s) => s.url === "/api/v1/videos").at(-1)?.body;

describe("discovered video models", () => {
  it("generates with a discovered slug before any page load primed the snapshot, sending no resolution", async () => {
    expect(seen.some((s) => s.url.includes("output_modalities=video"))).toBe(false);
    const res = await post("/api/generate/video", { prompt: "a fox", model: UNKNOWN, duration: 5, aspectRatio: "16:9" });
    expect(res.status).toBe(200);
    const g = ((await res.json()) as { generations: Generation[] }).generations[0];
    expect(g).toMatchObject({ type: "video", status: "running", model: UNKNOWN, modelName: "Dream Video 1", params: { duration: 5, aspectRatio: "16:9" } });
    expect(g?.params).not.toHaveProperty("resolution");
    const body = lastSubmit();
    expect(body).toEqual({ model: UNKNOWN, prompt: "a fox", duration: 5, aspect_ratio: "16:9" });
    expect(body).not.toHaveProperty("resolution");
    expect(body).not.toHaveProperty("generate_audio");
    await app.request(`/api/generations/${g?.id}`, { method: "DELETE" });
  });

  it("appears in GET /api/models with the synthesized shape, after the visible catalog", async () => {
    const res = (await (await app.request("/api/models")).json()) as { video: VideoModel[]; live?: { available: string[]; video?: unknown } };
    const ids = res.video.map((m) => m.id);
    expect(ids.slice(0, -2)).toEqual(VIDEO_MODELS.filter((m) => !m.hidden).map((m) => m.id));
    expect(ids).not.toContain("runway/aleph-2"); // hidden entries count as known, never re-discovered
    expect(res.live?.available).toContain(UNKNOWN);
    expect(res.live).not.toHaveProperty("video"); // the raw list stays server-side

    const acme = res.video.find((m) => m.id === UNKNOWN);
    expect(acme).toEqual({
      kind: "video",
      id: UNKNOWN,
      name: "Dream Video 1",
      provider: "openrouter",
      description: "New on OpenRouter. Limits and price not verified yet.",
      featured: false,
      badges: ["new"],
      caps: { textToVideo: true, imageToVideo: true, lastFrame: false, audio: false, references: false },
      durations: { min: 4, max: 10, step: 1 },
      defaultDuration: 5,
      resolutions: [],
      aspectRatios: ["16:9", "9:16", "1:1"],
      estCostPerSecUsd: {},
      verified: false,
      discovered: true,
    });
    expect(acme).not.toHaveProperty("defaultResolution");
    const hailuo9 = res.video.find((m) => m.id === UNKNOWN_KNOWN_VENDOR);
    expect(hailuo9).toMatchObject({ name: "Hailuo 9", provider: "minimax", caps: { textToVideo: true, imageToVideo: false }, discovered: true });
  });

  it("rejects options a discovered model cannot take, and can be set as the default", async () => {
    const res = await post("/api/generate/video", { prompt: "p", model: UNKNOWN, duration: 5, resolution: "1080p" });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("Dream Video 1 does not accept a resolution. Leave it unset.");
    const i2v = await post("/api/generate/video", { prompt: "p", model: UNKNOWN_KNOWN_VENDOR, duration: 5, firstFrame: "/media/up_x.png" });
    expect(i2v.status).toBe(400);
    expect(await errorOf(i2v)).toBe("Hailuo 9 does not support image-to-video");

    const put = await post("/api/settings", { defaults: { videoModel: UNKNOWN } }, "PUT");
    expect(put.status).toBe(200);
    expect(((await put.json()) as { defaults: { videoModel: string } }).defaults.videoModel).toBe(UNKNOWN);
    const unknown = await post("/api/settings", { defaults: { videoModel: "acme/not-listed" } }, "PUT");
    expect(unknown.status).toBe(400);
  });
});

describe("catalog corrections", () => {
  it("rejects style references for FLUX.3 Video with a 400 before touching the provider", async () => {
    const before = seen.filter((s) => s.url === "/api/v1/videos").length;
    const res = await post("/api/generate/video", {
      prompt: "p", model: "black-forest-labs/flux-3-video", duration: 5, firstFrame: "/media/up_x.png", references: ["/media/up_y.png"],
    });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("FLUX.3 Video does not accept style references");
    expect(seen.filter((s) => s.url === "/api/v1/videos").length).toBe(before);
  });

  it("rejects a last frame for Wan 3.0", async () => {
    const res = await post("/api/generate/video", { prompt: "p", model: "alibaba/wan-3.0", duration: 5, firstFrame: "/media/up_x.png", lastFrame: "/media/up_y.png" });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("Wan 3.0 does not support a last-frame anchor");
  });

  it("Hailuo 3 Max sends 768p and prices a 5 s clip at $0.40", async () => {
    const { estimateVideoCost, findVideoModel } = await import("../../shared/models.ts");
    const m = findVideoModel("minimax/hailuo-3-max");
    if (!m) throw new Error("catalog changed");
    expect(estimateVideoCost(m, 5)).toBeCloseTo(0.4, 10);
    const res = await post("/api/generate/video", { prompt: "p", model: m.id, duration: 5, aspectRatio: "4:3" });
    expect(res.status).toBe(200);
    expect(lastSubmit()).toMatchObject({ model: m.id, resolution: "768p", aspect_ratio: "4:3", duration: 5 });
    const g = ((await res.json()) as { generations: Generation[] }).generations[0];
    await app.request(`/api/generations/${g?.id}`, { method: "DELETE" });
  });
});
