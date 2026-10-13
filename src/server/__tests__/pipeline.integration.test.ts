/**
 * End-to-end pipeline against a local mock of OpenRouter: image batches (chat +
 * images endpoints), video submit (202) → poll → authenticated streaming download,
 * SSE bus, provider-error passthrough, retry (and its guards), delete, live
 * availability, the active-job ceiling (including the re-check after async input
 * handling). No network, no real key.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IMAGE_MODELS, VIDEO_MODELS } from "../../shared/models.ts";
import type { Generation, ServerEvent } from "../../shared/types.ts";

const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const str = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const box = (type: string, ...payload: number[][]): number[] => {
  const body = payload.flat();
  return [...u32(8 + body.length), ...str(type), ...body];
};
const zeros = (n: number): number[] => new Array<number>(n).fill(0);
const PNG_2X2 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), ...str("IHDR"), ...u32(2), ...u32(2), 8, 6, 0, 0, 0, ...u32(0),
]);
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG_2X2).toString("base64")}`;
const MP4 = Uint8Array.from([
  ...box("ftyp", str("isom"), u32(0)),
  ...box(
    "moov",
    box("mvhd", [0, 0, 0, 0], u32(0), u32(0), u32(1000), u32(5000), u32(0x10000), [1, 0], zeros(10), zeros(36), zeros(24), u32(2)),
    box("trak", box("tkhd", [0, 0, 0, 3], u32(0), u32(0), u32(1), u32(0), u32(0), zeros(8), zeros(8), zeros(36), u32(720 << 16), u32(1280 << 16))),
  ),
  ...box("mdat", zeros(64)),
]);

interface Seen {
  method: string;
  url: string;
  auth?: string;
  body?: Record<string, unknown>;
}
const seen: Seen[] = [];
let pollCount = 0;
let unknownPolls = 0;

function mockOpenRouter(): Promise<{ server: http.Server; base: string }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
      const entry: Seen = { method: req.method ?? "", url: req.url ?? "" };
      if (req.headers.authorization) entry.auth = req.headers.authorization;
      if (body) entry.body = body;
      seen.push(entry);
      const json = (status: number, payload: unknown): void => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (req.headers.authorization !== "Bearer test-key") return json(401, { error: { message: "User not found.", code: 401 } });
      const url = req.url ?? "";
      // Live availability: images-endpoint models (Krea, gpt-image-2) are deliberately listed ONLY
      // under /images/models, so the union of all three lists is required to see the whole catalog.
      if (url === "/api/v1/models?output_modalities=image") {
        return json(200, { data: IMAGE_MODELS.filter((m) => m.endpoint === "chat").map((m) => ({ id: m.id })) });
      }
      if (url === "/api/v1/models?output_modalities=video") return json(200, { data: VIDEO_MODELS.map((m) => ({ id: m.id })) });
      if (url === "/api/v1/images/models") return json(200, { data: IMAGE_MODELS.filter((m) => m.endpoint === "images").map((m) => ({ id: m.id })) });
      if (url === "/api/v1/models") return json(200, { data: [] });
      if (url === "/api/v1/chat/completions") {
        if (JSON.stringify(body?.messages).includes("REFUSE")) return json(200, { choices: [{ message: { content: "I cannot draw that." } }] });
        return json(200, { choices: [{ message: { images: [{ image_url: { url: PNG_DATA_URL } }] } }], usage: { cost: 0.134 } });
      }
      if (url === "/api/v1/images/generations") return json(200, { data: [{ b64_json: Buffer.from(PNG_2X2).toString("base64") }] });
      if (url === "/api/v1/videos") {
        if (String(body?.resolution) === "4K") {
          return json(400, { error: { message: "Resolution 4K is not supported for this model. Supported resolutions: 480p, 720p", code: 400 } });
        }
        const prompt = String(body?.prompt ?? "");
        if (prompt.includes("POLL_UNKNOWN")) return json(202, { id: "vid_unknown", polling_url: "/api/v1/videos/vid_unknown", status: "pending" });
        if (prompt.includes("POLL_FORBIDDEN")) return json(202, { id: "vid_forbidden", polling_url: "/api/v1/videos/vid_forbidden", status: "pending" });
        if (prompt.includes("POLL_FOREIGN")) return json(202, { id: "vid_foreign", polling_url: "https://evil.example/poll", status: "pending" });
        return json(202, { id: "vid_1", polling_url: "/api/v1/videos/vid_1", status: "pending" });
      }
      if (url === "/api/v1/videos/vid_unknown") {
        unknownPolls++;
        return json(200, unknownPolls === 1 ? { status: "mystery" } : { status: "mystery", error: "exploded" });
      }
      if (url === "/api/v1/videos/vid_forbidden") return json(403, { error: { message: "key not allowed here", code: 403 } });
      if (url === "/api/v1/videos/vid_1") {
        pollCount++;
        if (pollCount === 1) return json(200, { status: "processing" });
        return json(200, { status: "completed", unsigned_urls: ["/api/v1/videos/vid_1/content?index=0"], usage: { cost: 1.17 } });
      }
      if (url.startsWith("/api/v1/videos/vid_1/content")) {
        res.writeHead(200, { "content-type": "video/mp4" });
        return res.end(Buffer.from(MP4));
      }
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

const waitFor = async (cond: () => boolean, ms = 5000): Promise<void> => {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 15));
  }
};

let mock: http.Server;
let dataDir: string;
let app: Hono;
let jobs: typeof import("../jobs.ts");
let events: typeof import("../events.ts");
let dbmod: typeof import("../db.ts");
const received: Generation[] = [];
const deleted: string[] = [];
const MAX_ACTIVE_JOBS = 4;

beforeAll(async () => {
  const m = await mockOpenRouter();
  mock = m.server;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openhiggsfield-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_BASE_URL = m.base;
  process.env.NODE_ENV = "test";
  process.env.MAX_ACTIVE_JOBS = String(MAX_ACTIVE_JOBS);
  const appMod = await import("../app.ts");
  app = appMod.createApp();
  jobs = await import("../jobs.ts");
  events = await import("../events.ts");
  dbmod = await import("../db.ts");
  events.subscribe((e: ServerEvent) => {
    if (e.type === "generation") received.push(e.generation);
    if (e.type === "generation-deleted") deleted.push(e.id);
  });
});

afterAll(() => {
  jobs.stopPoller();
  dbmod.closeDatabase();
  mock.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const post = async (url: string, body: unknown): Promise<Response> =>
  app.request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const getGen = async (id: string): Promise<Generation> => (await (await app.request(`/api/generations/${id}`)).json()) as Generation;
const submitVideo = async (extra: Record<string, unknown> = {}): Promise<Generation> => {
  const res = await post("/api/generate/video", { prompt: "p", model: "bytedance/seedance-2.5", duration: 5, ...extra });
  if (res.status !== 200) throw new Error(`submit failed: ${res.status} ${await res.text()}`);
  const g = ((await res.json()) as { generations: Generation[] }).generations[0];
  if (!g) throw new Error("no generation");
  return g;
};

describe("image pipeline", () => {
  it("runs a batch of 2 through chat/completions and persists outputs", async () => {
    const res = await post("/api/generate/image", { prompt: "a cat", model: "google/gemini-3-pro-image", aspectRatio: "9:16", size: "2K", count: 2 });
    expect(res.status).toBe(200);
    const { generations } = (await res.json()) as { generations: Generation[] };
    expect(generations).toHaveLength(2);
    expect(generations[0]?.status).toBe("pending");
    expect(generations[0]?.batchId).toBe(generations[1]?.batchId);
    expect(generations.map((g) => g.batchIndex)).toEqual([0, 1]);

    const ids = generations.map((g) => g.id);
    await waitFor(() => ids.every((id) => received.some((g) => g.id === id && g.status === "completed")));
    const done = (await (await app.request(`/api/generations/${ids[0]}`)).json()) as Generation;
    expect(done).toMatchObject({ status: "completed", costUsd: 0.134, modelName: "Nano Banana Pro", params: { aspectRatio: "9:16", size: "2K" } });
    expect(done.output).toMatchObject({ url: `/media/${ids[0]}.png`, mime: "image/png", width: 2, height: 2, bytes: PNG_2X2.length });
    expect(typeof done.elapsedMs).toBe("number");
    expect(fs.existsSync(path.join(dataDir, "media", `${ids[0]}.png`))).toBe(true);

    const calls = seen.filter((s) => s.url === "/api/v1/chat/completions");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.auth).toBe("Bearer test-key");
    expect(calls[0]?.body).toMatchObject({ modalities: ["image", "text"], image_config: { aspect_ratio: "9:16", image_size: "2K" } });

    const media = await app.request(`/media/${ids[0]}.png`, { headers: { range: "bytes=0-3" } });
    expect(media.status).toBe(206);
    expect(media.headers.get("content-range")).toBe(`bytes 0-3/${PNG_2X2.length}`);
    expect(Array.from(new Uint8Array(await media.arrayBuffer()))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("persists data-URL references as uploads and sends them back as data URLs", async () => {
    const res = await post("/api/generate/image", {
      prompt: "edit", model: "google/gemini-3-pro-image", aspectRatio: "auto", size: "1K", count: 1, referenceImages: [PNG_DATA_URL],
    });
    expect(res.status).toBe(200);
    const g = ((await res.json()) as { generations: Generation[] }).generations[0];
    if (!g) throw new Error("no generation");
    expect(g.inputs?.referenceImages?.[0]).toMatch(/^\/media\/up_[A-Za-z0-9_-]+\.png$/);
    await waitFor(() => received.some((x) => x.id === g.id && x.status === "completed"));
    const call = seen.filter((s) => s.url === "/api/v1/chat/completions").at(-1);
    const content = (call?.body?.messages as { content: unknown }[])[0]?.content;
    expect(content).toEqual([{ type: "text", text: "edit" }, { type: "image_url", image_url: { url: PNG_DATA_URL } }]);
    expect(call?.body?.image_config).toEqual({ image_size: "1K" }); // auto aspect → no aspect_ratio
  });

  it("uses images/generations for Krea", async () => {
    const res = await post("/api/generate/image", { prompt: "street", model: "krea/krea-2-large", aspectRatio: "1:1", size: "1K", count: 1 });
    const g = ((await res.json()) as { generations: Generation[] }).generations[0];
    if (!g) throw new Error("no generation");
    await waitFor(() => received.some((x) => x.id === g.id && x.status === "completed"));
    const call = seen.find((s) => s.url === "/api/v1/images/generations");
    expect(call?.body).toEqual({ model: "krea/krea-2-large", prompt: "street" });
  });

  it("marks a job failed when the model returns text instead of an image", async () => {
    const res = await post("/api/generate/image", { prompt: "REFUSE this", model: "google/gemini-3-pro-image", aspectRatio: "auto", size: "1K", count: 1 });
    expect(res.status).toBe(200);
    const g = ((await res.json()) as { generations: Generation[] }).generations[0];
    if (!g) throw new Error("no generation");
    await waitFor(() => received.some((x) => x.id === g.id && x.status === "failed"));
    const failed = (await (await app.request(`/api/generations/${g.id}`)).json()) as Generation;
    expect(failed.error).toBe("Model returned no image: I cannot draw that.");
    expect(failed.output).toBeUndefined();
  });
});

describe("video pipeline", () => {
  let id = "";
  it("submits image-to-video with frame_images and no aspect_ratio for Seedance", async () => {
    const res = await post("/api/generate/video", {
      prompt: "slow push in", model: "bytedance/seedance-2.5", duration: 7.4, aspectRatio: "9:16", resolution: "720p", firstFrame: PNG_DATA_URL,
    });
    expect(res.status).toBe(200);
    const g = ((await res.json()) as { generations: Generation[] }).generations[0];
    if (!g) throw new Error("no generation");
    id = g.id;
    expect(g).toMatchObject({ type: "video", status: "running", providerJobId: "vid_1", params: { duration: 7, resolution: "720p" } });
    expect(g.params).not.toHaveProperty("aspectRatio");
    expect(g.inputs?.firstFrame).toMatch(/^\/media\/up_/);
    expect(g).not.toHaveProperty("pollingUrl");
    const submit = seen.find((s) => s.url === "/api/v1/videos");
    expect(submit?.body).toMatchObject({ model: "bytedance/seedance-2.5", duration: 7, resolution: "720p" });
    expect(submit?.body).not.toHaveProperty("aspect_ratio");
    expect(submit?.body?.frame_images).toEqual([{ type: "image_url", image_url: { url: PNG_DATA_URL }, frame_type: "first_frame" }]);
    expect(jobs.pollerRunning()).toBe(true);
  });

  it("polls until completed, streams the download to disk with the Bearer header and records cost", async () => {
    await jobs.pollTick(); // processing
    expect(((await (await app.request(`/api/generations/${id}`)).json()) as Generation).status).toBe("running");
    const arrayBuffer = vi.spyOn(Response.prototype, "arrayBuffer");
    try {
      await jobs.pollTick(); // completed → download
    } finally {
      arrayBuffer.mockRestore();
    }
    expect(arrayBuffer).not.toHaveBeenCalled(); // never buffered in RAM
    const g = (await (await app.request(`/api/generations/${id}`)).json()) as Generation;
    expect(g).toMatchObject({ status: "completed", costUsd: 1.17 });
    expect(g.output).toMatchObject({ url: `/media/${id}.mp4`, mime: "video/mp4", width: 720, height: 1280, durationSec: 5, bytes: MP4.length });
    expect(Array.from(fs.readFileSync(path.join(dataDir, "media", `${id}.mp4`)))).toEqual(Array.from(MP4));
    expect(fs.readdirSync(path.join(dataDir, "media")).filter((f) => f.endsWith(".part"))).toEqual([]);
    const download = seen.find((s) => s.url.startsWith("/api/v1/videos/vid_1/content"));
    expect(download?.auth).toBe("Bearer test-key");
    const media = await app.request(`/media/${id}.mp4`, { headers: { range: "bytes=-8" } });
    expect(media.status).toBe(206);
    expect(media.headers.get("content-type")).toBe("video/mp4");
    expect(media.headers.get("content-length")).toBe("8");
    await jobs.pollTick(); // nothing left → poller stops itself
    expect(jobs.pollerRunning()).toBe(false);
  });

  it("surfaces the provider 400 body verbatim and keeps a failed record", async () => {
    const res = await post("/api/generate/video", { prompt: "p", model: "bytedance/seedance-2.0", duration: 5, aspectRatio: "16:9", resolution: "4K" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; status: number; provider?: unknown };
    expect(body.error).toContain("Supported resolutions: 480p, 720p");
    expect(body.provider).toEqual({ error: { message: "Resolution 4K is not supported for this model. Supported resolutions: 480p, 720p", code: 400 } });
    const failed = received.filter((g) => g.type === "video" && g.status === "failed").at(-1);
    expect(failed?.error).toContain("Supported resolutions");
  });

  it("retries with the same inputs under a new id, and delete removes row + file", async () => {
    pollCount = 0;
    const res = await post(`/api/generations/${id}/retry`, {});
    expect(res.status).toBe(200);
    const g = ((await res.json()) as { generations: Generation[] }).generations[0];
    if (!g) throw new Error("no generation");
    expect(g.id).not.toBe(id);
    expect(g.inputs?.firstFrame).toBe(((await (await app.request(`/api/generations/${id}`)).json()) as Generation).inputs?.firstFrame);
    await jobs.pollTick();
    await jobs.pollTick();
    expect(((await (await app.request(`/api/generations/${g.id}`)).json()) as Generation).status).toBe("completed");

    const file = path.join(dataDir, "media", `${id}.mp4`);
    expect(fs.existsSync(file)).toBe(true);
    expect(deleted).not.toContain(id);
    const del = await app.request(`/api/generations/${id}`, { method: "DELETE" });
    expect(await del.json()).toEqual({ ok: true });
    expect(fs.existsSync(file)).toBe(false);
    expect((await app.request(`/api/generations/${id}`)).status).toBe(404);
    expect(deleted).toContain(id); // generation-deleted published
    // The first frame upload is still referenced by the retried job → kept.
    const frame = (await getGen(g.id)).inputs?.firstFrame ?? "";
    expect(fs.existsSync(path.join(dataDir, "media", "uploads", path.basename(frame)))).toBe(true);
  });

  it("retrying a failed record replaces it and announces the old id", async () => {
    const res = await post("/api/generate/image", { prompt: "REFUSE again", model: "google/gemini-3-pro-image", aspectRatio: "auto", size: "1K", count: 1 });
    const g = ((await res.json()) as { generations: Generation[] }).generations[0];
    if (!g) throw new Error("no generation");
    await waitFor(() => received.some((x) => x.id === g.id && x.status === "failed"));
    const retry = await post(`/api/generations/${g.id}/retry`, {});
    expect(retry.status).toBe(200);
    const fresh = ((await retry.json()) as { generations: Generation[] }).generations[0];
    expect(fresh?.id).not.toBe(g.id);
    expect((await app.request(`/api/generations/${g.id}`)).status).toBe(404);
    expect(deleted).toContain(g.id);
    await waitFor(() => received.some((x) => x.id === fresh?.id && x.status === "failed"));
  });

  it("passes the audio flag through as generate_audio for audio-capable models", async () => {
    const g = await submitVideo({ audio: false });
    expect(g.params).toMatchObject({ audio: false });
    const submit = seen.filter((s) => s.url === "/api/v1/videos").at(-1);
    expect(submit?.body?.generate_audio).toBe(false);
    await app.request(`/api/generations/${g.id}`, { method: "DELETE" });
    const kling = await submitVideo({ model: "kwaivgi/kling-v3.0-pro", aspectRatio: "16:9", audio: true });
    expect(seen.filter((s) => s.url === "/api/v1/videos").at(-1)?.body).not.toHaveProperty("generate_audio");
    await app.request(`/api/generations/${kling.id}`, { method: "DELETE" });
  });
});

describe("retry guards", () => {
  const videoSubmits = (): number => seen.filter((s) => s.url === "/api/v1/videos").length;

  it("409s while the record is still pending / running", async () => {
    const g = await submitVideo();
    const res = await post(`/api/generations/${g.id}/retry`, {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Generation is still running", status: 409 });
    await app.request(`/api/generations/${g.id}`, { method: "DELETE" });
    await jobs.pollTick(); // nothing left → poller stops
  });

  it("names the saved option the model no longer lists, and leaves the record alone", async () => {
    const repo = await import("../repo.ts");
    const ts = new Date().toISOString();
    // Seedance 2.5 lists 480p/720p today; pretend this record was made when 4K was still offered.
    repo.insertGeneration({
      id: "gen_stale4k", type: "video", status: "completed", prompt: "p", model: "bytedance/seedance-2.5", modelName: "Seedance 2.5",
      params: { duration: 5, resolution: "4K" }, createdAt: ts, updatedAt: ts,
    });
    const before = videoSubmits();
    const res = await post("/api/generations/gen_stale4k/retry", {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Saved resolution 4K is no longer supported by Seedance 2.5 (allowed: 480p, 720p). Generate a new one with the current options.",
    );
    expect(videoSubmits()).toBe(before); // never reached the provider
    expect((await app.request("/api/generations/gen_stale4k")).status).toBe(200);
    await app.request("/api/generations/gen_stale4k", { method: "DELETE" });
  });

  it("explains a model that left the catalog (a failed record is only replaced after a successful re-submit)", async () => {
    const repo = await import("../repo.ts");
    const ts = new Date().toISOString();
    repo.insertGeneration({
      id: "gen_retired", type: "image", status: "failed", error: "boom", prompt: "p", model: "acme/retired-1", modelName: "Retired 1",
      params: { aspectRatio: "1:1", size: "1K" }, createdAt: ts, updatedAt: ts,
    });
    const res = await post("/api/generations/gen_retired/retry", {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Retired 1 (acme/retired-1) is no longer available. Generate a new one with a current model.",
    );
    expect((await app.request("/api/generations/gen_retired")).status).toBe(200);
    expect(deleted).not.toContain("gen_retired");
    await app.request("/api/generations/gen_retired", { method: "DELETE" });
  });
});

describe("request validation", () => {
  it("rejects options the catalog does not list for the model, naming the allowed values", async () => {
    const krea = await post("/api/generate/image", { prompt: "p", model: "krea/krea-2-large", aspectRatio: "9:16", size: "1K", count: 1 });
    expect(krea.status).toBe(400);
    expect(((await krea.json()) as { error: string }).error).toBe("Krea 2 Large does not support aspect ratio 9:16 (allowed: 1:1)");
    const size = await post("/api/generate/image", { prompt: "p", model: "google/gemini-2.5-flash-image", aspectRatio: "auto", size: "4K", count: 1 });
    expect(size.status).toBe(400);
    expect(((await size.json()) as { error: string }).error).toContain("allowed: 1K");
    const res = await post("/api/generate/video", { prompt: "p", model: "minimax/hailuo-3", duration: 5, resolution: "1080p" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("MiniMax Hailuo 3 does not support resolution 1080p (allowed: 2K)");
    const ar = await post("/api/generate/video", { prompt: "p", model: "kwaivgi/kling-v3.0-pro", duration: 5, aspectRatio: "21:9" });
    expect(ar.status).toBe(400);
    expect(((await ar.json()) as { error: string }).error).toContain("allowed: 16:9, 9:16, 1:1");
    // `auto` is always fine, and an aspect ratio that will be dropped on i2v is not validated.
    expect(seen.filter((s) => s.url === "/api/v1/videos" || s.url === "/api/v1/chat/completions").length).toBeGreaterThan(0);
  });

  it("returns 400 for a data URL with malformed percent-encoding", async () => {
    const res = await post("/api/upload", { dataUrl: "data:image/png,%E0%A4%A" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "dataUrl must be a base64 data URL", status: 400 });
  });
});

describe("active-job ceiling", () => {
  it(`returns 429 once MAX_ACTIVE_JOBS (${MAX_ACTIVE_JOBS}) generations are pending/running`, async () => {
    expect((await (await app.request("/api/health")).json()).pendingJobs).toBe(0);
    const running: Generation[] = [];
    for (let i = 0; i < MAX_ACTIVE_JOBS; i++) running.push(await submitVideo());
    const fifth = await post("/api/generate/video", { prompt: "p", model: "bytedance/seedance-2.5", duration: 5 });
    expect(fifth.status).toBe(429);
    expect(await fifth.json()).toEqual({ error: `Too many active generations (${MAX_ACTIVE_JOBS}). Wait for some to finish.`, status: 429 });
    const image = await post("/api/generate/image", { prompt: "p", model: "google/gemini-3-pro-image", aspectRatio: "auto", size: "1K", count: 1 });
    expect(image.status).toBe(429);
    // A batch that would cross the line is rejected as a whole, before anything is created.
    await app.request(`/api/generations/${running[0]?.id}`, { method: "DELETE" });
    const batch = await post("/api/generate/image", { prompt: "p", model: "google/gemini-3-pro-image", aspectRatio: "auto", size: "1K", count: 2 });
    expect(batch.status).toBe(429);
    for (const g of running.slice(1)) await app.request(`/api/generations/${g.id}`, { method: "DELETE" });
    expect((await (await app.request("/api/health")).json()).pendingJobs).toBe(0);
    await jobs.pollTick(); // nothing left → poller stops
  });

  it("re-checks capacity after the async input handling, so concurrent requests cannot overshoot", async () => {
    for (let i = 0; i < MAX_ACTIVE_JOBS - 1; i++) await submitVideo();
    const uploadsDir = path.join(dataDir, "media", "uploads");
    const uploadsBefore = fs.readdirSync(uploadsDir).length;
    // Both pass the early check (3 + 1 ≤ 4) before either has finished persisting its first frame;
    // the re-check right before the insert turns the second one into a 429 instead of a 5th job.
    const body = { prompt: "p", model: "bytedance/seedance-2.5", duration: 5, firstFrame: PNG_DATA_URL };
    const results = await Promise.all([post("/api/generate/video", body), post("/api/generate/video", body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
    expect((await (await app.request("/api/health")).json()).pendingJobs).toBe(MAX_ACTIVE_JOBS);
    // The rejected request's first frame was already on disk; it must not be left behind as an orphan.
    expect(fs.readdirSync(uploadsDir).length).toBe(uploadsBefore + 1);
    const { items } = (await (await app.request("/api/generations?status=running")).json()) as { items: Generation[] };
    for (const g of items) await app.request(`/api/generations/${g.id}`, { method: "DELETE" });
    expect((await (await app.request("/api/health")).json()).pendingJobs).toBe(0);
    await jobs.pollTick(); // nothing left → poller stops
    expect(jobs.pollerRunning()).toBe(false);
  });

  it("removes a persisted reference when validation fails on a later input of the same request", async () => {
    const uploadsDir = path.join(dataDir, "media", "uploads");
    const before = fs.readdirSync(uploadsDir).length;
    const res = await post("/api/generate/image", {
      prompt: "p", model: "google/gemini-3-pro-image", aspectRatio: "auto", size: "1K", count: 1, referenceImages: [PNG_DATA_URL, "/media/up_missing.png"],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("referenceImages[1] not found: /media/up_missing.png");
    expect(fs.readdirSync(uploadsDir).length).toBe(before);
  });
});

describe("poll error classification", () => {
  const status = async (id: string): Promise<string> => (await getGen(id)).status;

  it("keeps polling through a 403 (key rotation) instead of failing the job", async () => {
    const g = await submitVideo({ prompt: "POLL_FORBIDDEN" });
    await jobs.pollTick();
    await jobs.pollTick();
    expect(await status(g.id)).toBe("running");
    await app.request(`/api/generations/${g.id}`, { method: "DELETE" });
  });

  it("warns on an unknown status and fails the job once the provider attaches an error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const g = await submitVideo({ prompt: "POLL_UNKNOWN" });
      await jobs.pollTick(); // { status: "mystery" } → keep polling, warn once
      expect(await status(g.id)).toBe("running");
      expect(warn.mock.calls.filter((c) => String(c[0]).includes(`job ${g.id} unknown provider status "mystery"`))).toHaveLength(1);
      await jobs.pollTick(); // { status: "mystery", error: "exploded" } → failed
      const failed = await getGen(g.id);
      expect(failed.status).toBe("failed");
      expect(failed.error).toBe("exploded");
      await app.request(`/api/generations/${g.id}`, { method: "DELETE" });
    } finally {
      warn.mockRestore();
    }
  });

  it("fails the submit when the polling url points off OpenRouter, without sending the key there", async () => {
    const res = await post("/api/generate/video", { prompt: "POLL_FOREIGN", model: "bytedance/seedance-2.5", duration: 5 });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("Refusing to send the API key to evil.example");
    const failed = received.filter((g) => g.type === "video" && g.status === "failed").at(-1);
    expect(failed?.error).toBe("Refusing to send the API key to evil.example");
    await jobs.pollTick(); // nothing left → poller stops
  });
});

describe("uploads shared between generations", () => {
  it("deletes an input upload only when no other generation references it", async () => {
    const form = new FormData();
    form.append("file", new Blob([PNG_2X2], { type: "image/png" }), "ref.png");
    const up = (await (await app.request("/api/upload", { method: "POST", body: form })).json()) as { media: { url: string } };
    const file = path.join(dataDir, "media", "uploads", path.basename(up.media.url));
    expect(fs.existsSync(file)).toBe(true);
    const make = async (): Promise<Generation> => {
      const res = await post("/api/generate/image", { prompt: "edit", model: "google/gemini-3-pro-image", aspectRatio: "auto", size: "1K", count: 1, referenceImages: [up.media.url] });
      const g = ((await res.json()) as { generations: Generation[] }).generations[0];
      if (!g) throw new Error("no generation");
      await waitFor(() => received.some((x) => x.id === g.id && x.status === "completed"));
      return g;
    };
    const a = await make();
    const b = await make();
    await app.request(`/api/generations/${a.id}`, { method: "DELETE" });
    expect(fs.existsSync(file)).toBe(true); // b still references it
    await app.request(`/api/generations/${b.id}`, { method: "DELETE" });
    expect(fs.existsSync(file)).toBe(false); // last reference gone
    expect(deleted).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});

describe("live model availability", () => {
  it("unions models?output_modalities=image|video and images/models so every catalog slug is available", async () => {
    const res = (await (await app.request("/api/models")).json()) as { live?: { available: string[] }; video: { id: string }[] };
    expect(res.live).toBeDefined();
    const available = new Set(res.live?.available);
    for (const m of IMAGE_MODELS) expect(available.has(m.id), m.id).toBe(true);
    for (const m of VIDEO_MODELS.filter((v) => !v.hidden)) expect(available.has(m.id), m.id).toBe(true);
    expect(res.video.some((m) => m.id === "runway/aleph-2")).toBe(false); // hidden stays hidden
    const urls = seen.map((s) => s.url);
    expect(urls).toContain("/api/v1/models?output_modalities=image");
    expect(urls).toContain("/api/v1/models?output_modalities=video");
    expect(urls).toContain("/api/v1/images/models");
    expect(urls).not.toContain("/api/v1/models");
  });
});

describe("listing", () => {
  it("paginates newest-first with an opaque cursor", async () => {
    const page1 = (await (await app.request("/api/generations?limit=2")).json()) as { items: Generation[]; nextCursor?: string };
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    expect(Date.parse(page1.items[0]?.createdAt ?? "")).toBeGreaterThanOrEqual(Date.parse(page1.items[1]?.createdAt ?? ""));
    const page2 = (await (await app.request(`/api/generations?limit=2&cursor=${encodeURIComponent(page1.nextCursor ?? "")}`)).json()) as { items: Generation[] };
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page2.items.map((g) => g.id)).not.toContain(page1.items[0]?.id);
    const videos = (await (await app.request("/api/generations?type=video&status=failed")).json()) as { items: Generation[] };
    expect(videos.items.every((g) => g.type === "video" && g.status === "failed")).toBe(true);
    expect(videos.items.length).toBeGreaterThan(0);
  });

  it("health reflects pending jobs and settings never leak the key", async () => {
    expect(await (await app.request("/api/health")).json()).toMatchObject({ ok: true, hasKey: true, pendingJobs: 0 });
    const settings = (await (await app.request("/api/settings")).json()) as { keyMasked?: string; keySource: string };
    expect(settings.keySource).toBe("env");
    expect(JSON.stringify(settings)).not.toContain("test-key");
  });
});

describe("body limits", () => {
  it("caps settings bodies at 64 KB and inline generate bodies at about 69 MB", async () => {
    const { GENERATE_BODY_LIMIT, MAX_INLINE_IMAGES } = await import("../routes/generate.ts");
    expect(MAX_INLINE_IMAGES).toBe(2);
    expect(Math.round(GENERATE_BODY_LIMIT / 1024 / 1024)).toBe(69);
    const big = JSON.stringify({ apiKey: "x".repeat(70 * 1024) });
    const put = await app.request("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: big });
    expect(put.status).toBe(413);
    expect(await put.json()).toEqual({ error: "Request body exceeds 64 KB", status: 413 });
    const test = await app.request("/api/settings/test", { method: "POST", headers: { "content-type": "application/json" }, body: big });
    expect(test.status).toBe(413);
    const retry = await post("/api/generations/gen_none/retry", { pad: "x".repeat(70 * 1024) });
    expect(retry.status).toBe(413);
    expect((await app.request("/api/settings")).status).toBe(200);
  });

  it("reports a rejected key on /api/settings/test as a 401 for the client", async () => {
    const res = await post("/api/settings/test", { apiKey: "wrong-key" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Invalid API key", status: 401, provider: { error: { message: "User not found.", code: 401 } } });
  });
});
