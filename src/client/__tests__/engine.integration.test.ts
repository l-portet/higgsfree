/**
 * End-to-end engine against a mocked OpenRouter: image batches (chat + images endpoints),
 * video submit (202) → poll → authenticated download into the library, the change feed,
 * provider-error passthrough, retry (and its guards), delete, reference counting, resume
 * after a closed tab, live availability, the active-job ceiling. No network, no real key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import type { Generation } from "@shared/types";
import * as api from "@/lib/api";
import { insertGenerations, toStored } from "@/lib/db/generations";
import { getMediaBlob, mediaExists } from "@/lib/db/media";
import { cancelAllJobs, resumeJobs } from "@/lib/engine";
import { limits, timing } from "@/lib/engine/constants";
import { INTERRUPTED_IMAGE, INTERRUPTED_SUBMIT } from "@/lib/engine/resume";
import { setOnVideoCompleted } from "@/lib/engine/video";
import { subscribeEvents } from "@/lib/live";
import { resetLiveModels } from "@/lib/openrouter";
import { setStoredKey } from "@/lib/settings";
import { installMockOpenRouter, MP4, PNG_2X2, PNG_DATA_URL, sleep, waitFor, type MockOpenRouter } from "./mock-openrouter";

let mock: MockOpenRouter;
const received: Generation[] = [];
const deleted: string[] = [];
let unsubscribe: () => void = () => undefined;

const MAX_ACTIVE_JOBS = 4;

beforeEach(() => {
  mock = installMockOpenRouter();
  setStoredKey("test-key");
  timing.pollIntervalMs = 5;
  limits.maxActiveJobs = MAX_ACTIVE_JOBS;
  resetLiveModels();
  received.length = 0;
  deleted.length = 0;
  unsubscribe = subscribeEvents((ev) => {
    if (ev.type === "generation") received.push(ev.generation);
    if (ev.type === "generation-deleted") deleted.push(ev.id);
  });
});

afterEach(async () => {
  unsubscribe();
  cancelAllJobs();
  await sleep(10);
});

const bytesOf = async (id: string): Promise<number[]> => Array.from(new Uint8Array(await (await getMediaBlob(id))!.arrayBuffer()));
const completed = (id: string) => (): boolean => received.some((g) => g.id === id && g.status === "completed");
const failed = (id: string) => (): boolean => received.some((g) => g.id === id && g.status === "failed");
const status = async (id: string): Promise<string> => (await api.getGeneration(id)).status;
const upload = async (): Promise<string> => (await api.upload(new Blob([PNG_2X2], { type: "image/png" }))).media.id;
const generateImage = async (extra: Record<string, unknown> = {}): Promise<Generation> => {
  const res = await api.generateImage({ prompt: "p", model: "google/gemini-3-pro-image", aspectRatio: "auto", size: "1K", count: 1, ...extra });
  const g = res.generations[0];
  if (!g) throw new Error("no generation");
  return g;
};
const submitVideo = async (extra: Record<string, unknown> = {}): Promise<Generation> => {
  const res = await api.generateVideo({ prompt: "p", model: "bytedance/seedance-2.5", duration: 5, ...extra });
  const g = res.generations[0];
  if (!g) throw new Error("no generation");
  return g;
};

describe("image pipeline", () => {
  it("runs a batch of 2 through chat/completions and stores the outputs", async () => {
    const { generations } = await api.generateImage({ prompt: "a cat", model: "google/gemini-3-pro-image", aspectRatio: "9:16", size: "2K", count: 2 });
    expect(generations).toHaveLength(2);
    expect(generations[0]?.status).toBe("pending");
    expect(generations[0]?.batchId).toBe(generations[1]?.batchId);
    expect(generations.map((g) => g.batchIndex)).toEqual([0, 1]);
    expect(received.filter((g) => g.status === "pending")).toHaveLength(2);

    const ids = generations.map((g) => g.id);
    await waitFor(() => ids.every((id) => completed(id)()));
    const done = await api.getGeneration(ids[0] ?? "");
    expect(done).toMatchObject({ status: "completed", costUsd: 0.134, modelName: "Nano Banana Pro", params: { aspectRatio: "9:16", size: "2K" } });
    expect(done.output).toMatchObject({ id: `${ids[0]}.png`, mime: "image/png", width: 2, height: 2, bytes: PNG_2X2.length });
    expect(typeof done.elapsedMs).toBe("number");
    expect(done).not.toHaveProperty("fav");
    expect(done).not.toHaveProperty("refs");
    expect(await bytesOf(`${ids[0]}.png`)).toEqual(Array.from(PNG_2X2));

    const calls = mock.calls("/api/v1/chat/completions");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.auth).toBe("Bearer test-key");
    expect(calls[0]?.body).toMatchObject({ modalities: ["image", "text"], image_config: { aspect_ratio: "9:16", image_size: "2K" } });
  });

  it("sends stored reference images back as data URLs", async () => {
    const ref = await upload();
    expect(ref).toMatch(/^up_[A-Za-z0-9_-]+\.png$/);
    const g = await generateImage({ prompt: "edit", referenceImages: [ref] });
    expect(g.inputs?.referenceImages).toEqual([ref]);
    await waitFor(completed(g.id));
    const call = mock.last("/api/v1/chat/completions");
    const content = (call?.body?.messages as { content: unknown }[])[0]?.content;
    expect(content).toEqual([{ type: "text", text: "edit" }, { type: "image_url", image_url: { url: PNG_DATA_URL } }]);
    expect(call?.body?.image_config).toEqual({ image_size: "1K" }); // auto aspect → no aspect_ratio
  });

  it("uses images/generations for Krea", async () => {
    const g = await generateImage({ prompt: "street", model: "krea/krea-2-large", aspectRatio: "1:1" });
    await waitFor(completed(g.id));
    expect(mock.last("/api/v1/images/generations")?.body).toEqual({ model: "krea/krea-2-large", prompt: "street" });
    expect((await api.getGeneration(g.id)).output).toMatchObject({ mime: "image/png", width: 2, height: 2 });
  });

  it("marks a job failed when the model returns text instead of an image", async () => {
    const g = await generateImage({ prompt: "REFUSE this" });
    await waitFor(failed(g.id));
    const record = await api.getGeneration(g.id);
    expect(record.error).toBe("Model returned no image: I cannot draw that.");
    expect(record.output).toBeUndefined();
    expect(record.completedAt).toBeTruthy();
  });
});

describe("video pipeline", () => {
  it("announces the pending record before the provider has the job, so the composer frees up while inputs upload", async () => {
    const queued: Generation[] = [];
    let submitsAtQueue = -1;
    const res = await api.generateVideo({ prompt: "p", model: "bytedance/seedance-2.5", duration: 5 }, (g) => {
      queued.push(g);
      submitsAtQueue = mock.calls("/api/v1/videos").length;
    });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ id: res.generations[0]?.id, status: "pending" });
    expect(submitsAtQueue).toBe(0);
  });

  it("submits image-to-video with frame_images and no aspect_ratio for Seedance, then polls, downloads and records cost", async () => {
    // The tab that finishes the job hears about it once, with the stored record (the ding / notification hook).
    const announced: Generation[] = [];
    setOnVideoCompleted((done) => announced.push(done));
    const frame = await upload();
    const g = await submitVideo({ prompt: "slow push in", duration: 7.4, aspectRatio: "9:16", resolution: "720p", firstFrame: frame });
    expect(g).toMatchObject({ type: "video", status: "running", providerJobId: "vid_1", params: { duration: 7, resolution: "720p" } });
    expect(g.params).not.toHaveProperty("aspectRatio");
    expect(g.inputs?.firstFrame).toBe(frame);
    expect(g).not.toHaveProperty("pollingUrl");
    const submit = mock.last("/api/v1/videos");
    expect(submit?.body).toMatchObject({ model: "bytedance/seedance-2.5", duration: 7, resolution: "720p" });
    expect(submit?.body).not.toHaveProperty("aspect_ratio");
    expect(submit?.body?.frame_images).toEqual([{ type: "image_url", image_url: { url: PNG_DATA_URL }, frame_type: "first_frame" }]);

    await waitFor(completed(g.id));
    const done = await api.getGeneration(g.id);
    expect(done).toMatchObject({ status: "completed", costUsd: 1.17 });
    expect(done.output).toMatchObject({ id: `${g.id}.mp4`, mime: "video/mp4", width: 720, height: 1280, durationSec: 5, bytes: MP4.length });
    expect(done).not.toHaveProperty("pollingUrl");
    expect(await bytesOf(`${g.id}.mp4`)).toEqual(Array.from(MP4));
    expect((await getMediaBlob(`${g.id}.mp4`))?.type).toBe("video/mp4");
    expect(mock.state.pollCount).toBeGreaterThanOrEqual(2);
    expect(mock.seen.find((s) => s.url.startsWith("/api/v1/videos/vid_1/content"))?.auth).toBe("Bearer test-key");
    expect(announced).toHaveLength(1);
    expect(announced[0]).toEqual(done);
    setOnVideoCompleted(undefined);
  });

  it("edits a video on OpenRouter: the clip goes inline as a video reference, nothing else is sent, and its length comes from the result", async () => {
    const source = (await api.uploadVideo(new Blob([MP4], { type: "video/mp4" }))).media.id;
    const g = await submitVideo({ prompt: "make it snow", model: "black-forest-labs/flux-video-edit", resolution: "720p", sourceVideo: source });
    expect(g).toMatchObject({ status: "running", provider: "openrouter", inputs: { sourceVideo: source }, params: { duration: 0 } });
    expect(mock.last("/api/v1/videos")?.body).toEqual({
      model: "black-forest-labs/flux-video-edit",
      prompt: "make it snow",
      input_references: [{ type: "video_url", video_url: { url: `data:video/mp4;base64,${Buffer.from(MP4).toString("base64")}` } }],
    });
    await waitFor(completed(g.id));
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", costUsd: 1.17, params: { duration: 5 }, output: { durationSec: 5 } });
  });

  it("surfaces the provider 400 body verbatim and keeps a failed record", async () => {
    const err = await api.generateVideo({ prompt: "p", model: "bytedance/seedance-2.0", duration: 5, aspectRatio: "16:9", resolution: "4K" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(api.ApiClientError);
    expect(err).toMatchObject({ status: 400, provider: { error: { message: "Resolution 4K is not supported for this model. Supported resolutions: 480p, 720p", code: 400 } } });
    expect((err as api.ApiClientError).error).toContain("Supported resolutions: 480p, 720p");
    await waitFor(() => received.some((g) => g.type === "video" && g.status === "failed" && (g.error ?? "").includes("Supported resolutions")));
  });

  it("retries with the same inputs under a new id; delete removes the record and its file, not a shared input", async () => {
    const frame = await upload();
    const first = await submitVideo({ firstFrame: frame });
    await waitFor(completed(first.id));
    mock.state.pollCount = 0;
    const { generations } = await api.retryGeneration(first.id);
    const again = generations[0];
    if (!again) throw new Error("no generation");
    expect(again.id).not.toBe(first.id);
    expect(again.inputs?.firstFrame).toBe(frame);
    await waitFor(completed(again.id));

    expect(await mediaExists(`${first.id}.mp4`)).toBe(true);
    expect(deleted).not.toContain(first.id);
    expect(await api.deleteGeneration(first.id)).toEqual({ ok: true });
    expect(await mediaExists(`${first.id}.mp4`)).toBe(false);
    await expect(api.getGeneration(first.id)).rejects.toMatchObject({ status: 404 });
    await expect(api.deleteGeneration(first.id)).rejects.toMatchObject({ status: 404 });
    expect(deleted).toContain(first.id);
    expect(await mediaExists(frame)).toBe(true); // the retried job still references it
    await api.deleteGeneration(again.id);
    expect(await mediaExists(frame)).toBe(false); // last reference gone
  });

  it("retrying a failed record replaces it and announces the old id", async () => {
    const g = await generateImage({ prompt: "REFUSE again" });
    await waitFor(failed(g.id));
    const { generations } = await api.retryGeneration(g.id);
    const fresh = generations[0];
    expect(fresh?.id).not.toBe(g.id);
    await expect(api.getGeneration(g.id)).rejects.toMatchObject({ status: 404 });
    expect(deleted).toContain(g.id);
    await waitFor(failed(fresh?.id ?? ""));
  });

  it("passes the audio flag through as generate_audio for audio-capable models only", async () => {
    const g = await submitVideo({ audio: false });
    expect(g.params).toMatchObject({ audio: false });
    expect(mock.last("/api/v1/videos")?.body?.generate_audio).toBe(false);
    await api.deleteGeneration(g.id);
    const silent = await submitVideo({ model: "minimax/hailuo-3-max", aspectRatio: "16:9", audio: true });
    expect(mock.last("/api/v1/videos")?.body).not.toHaveProperty("generate_audio");
    await api.deleteGeneration(silent.id);
  });

  it("stops polling when the record is deleted mid-run", async () => {
    const g = await submitVideo({ prompt: "POLL_FORBIDDEN" });
    await waitFor(() => mock.calls("/api/v1/videos/vid_forbidden").length >= 2);
    await api.deleteGeneration(g.id);
    await sleep(30);
    const n = mock.calls("/api/v1/videos/vid_forbidden").length;
    await sleep(60);
    expect(mock.calls("/api/v1/videos/vid_forbidden").length).toBe(n);
  });
});

describe("retry guards", () => {
  it("409s while the record is still running", async () => {
    const g = await submitVideo({ prompt: "POLL_FORBIDDEN" });
    await expect(api.retryGeneration(g.id)).rejects.toMatchObject({ status: 409, error: "Generation is still running" });
    await api.deleteGeneration(g.id);
  });

  it("names the saved option the model no longer lists, and leaves the record alone", async () => {
    const ts = new Date().toISOString();
    // Seedance 2.5 lists 480p/720p today; pretend this record was made when 4K was still offered.
    await insertGenerations(
      [toStored({ id: "gen_stale4k00", type: "video", status: "completed", prompt: "p", model: "bytedance/seedance-2.5", modelName: "Seedance 2.5", params: { duration: 5, resolution: "4K" }, createdAt: ts, updatedAt: ts })],
      10,
    );
    const before = mock.calls("/api/v1/videos").length;
    await expect(api.retryGeneration("gen_stale4k00")).rejects.toMatchObject({
      status: 400,
      error: "Saved resolution 4K is no longer supported by Seedance 2.5 (allowed: 480p, 720p). Generate a new one with the current options.",
    });
    expect(mock.calls("/api/v1/videos").length).toBe(before); // never reached the provider
    expect(await status("gen_stale4k00")).toBe("completed");
  });

  it("explains a model that left the catalog (a failed record is only replaced after a successful re-submit)", async () => {
    const ts = new Date().toISOString();
    await insertGenerations(
      [toStored({ id: "gen_retired00", type: "image", status: "failed", error: "boom", prompt: "p", model: "acme/retired-1", modelName: "Retired 1", params: { aspectRatio: "1:1", size: "1K" }, createdAt: ts, updatedAt: ts })],
      10,
    );
    await expect(api.retryGeneration("gen_retired00")).rejects.toMatchObject({
      status: 400,
      error: "Retired 1 (acme/retired-1) is no longer available. Generate a new one with a current model.",
    });
    expect(await status("gen_retired00")).toBe("failed");
    expect(deleted).not.toContain("gen_retired00");
  });
});

describe("request validation", () => {
  it("rejects options the catalog does not list for the model, naming the allowed values", async () => {
    await expect(generateImage({ model: "krea/krea-2-large", aspectRatio: "9:16" })).rejects.toMatchObject({ status: 400, error: "Krea 2 Large does not support aspect ratio 9:16 (allowed: 1:1)" });
    await expect(generateImage({ model: "google/gemini-2.5-flash-image", size: "4K" })).rejects.toMatchObject({ status: 400, error: expect.stringContaining("allowed: 1K") });
    await expect(submitVideo({ model: "minimax/hailuo-3", resolution: "1080p" })).rejects.toMatchObject({ status: 400, error: "MiniMax H3 does not support resolution 1080p (allowed: 2K)" });
    await expect(submitVideo({ model: "kwaivgi/kling-v3.0-pro", aspectRatio: "21:9" })).rejects.toMatchObject({ status: 400, error: expect.stringContaining("allowed: 16:9, 1:1, 9:16") });
    await expect(submitVideo({ prompt: "   " })).rejects.toMatchObject({ status: 400, error: "Prompt is required for text-to-video" });
    await expect(submitVideo({ model: "runway/aleph-2" })).rejects.toMatchObject({ status: 400, error: "Runway Aleph 2 needs a video to edit" });
    await expect(submitVideo({ sourceVideo: "up_abc123.mp4" })).rejects.toMatchObject({ status: 400, error: "Seedance 2.5 does not edit videos" });
    await expect(generateImage({ count: 5 })).rejects.toMatchObject({ status: 400 });
    expect(mock.seen.filter((s) => s.url === "/api/v1/videos" || s.url === "/api/v1/chat/completions")).toHaveLength(0);
  });

  it("refuses inputs that are not in the library, before anything is created", async () => {
    const ref = await upload();
    await expect(generateImage({ referenceImages: [ref, "up_missing123.png"] })).rejects.toMatchObject({ status: 400, error: "Reference image 2 is no longer in the library (up_missing123.png)" });
    await expect(generateImage({ referenceImages: ["data:image/png;base64,AAAA"] })).rejects.toMatchObject({ status: 400 });
    expect((await api.listGenerations()).items).toHaveLength(0);
  });

  it("rejects a key-less call with a 401 that says what to do", async () => {
    setStoredKey("");
    await expect(generateImage()).rejects.toMatchObject({ status: 401, error: "No OpenRouter key configured. Add one in Settings." });
  });
});

describe("active-job ceiling", () => {
  it(`returns 429 once ${MAX_ACTIVE_JOBS} generations are pending/running`, async () => {
    const running: Generation[] = [];
    for (let i = 0; i < MAX_ACTIVE_JOBS; i++) running.push(await submitVideo({ prompt: "POLL_FORBIDDEN" }));
    await expect(submitVideo({ prompt: "POLL_FORBIDDEN" })).rejects.toMatchObject({ status: 429, error: `Too many active generations (${MAX_ACTIVE_JOBS}). Wait for some to finish.` });
    await expect(generateImage()).rejects.toMatchObject({ status: 429 });
    // A batch that would cross the line is rejected as a whole, before anything is created.
    await api.deleteGeneration(running[0]?.id ?? "");
    await expect(generateImage({ count: 2 })).rejects.toMatchObject({ status: 429 });
    for (const g of running.slice(1)) await api.deleteGeneration(g.id);
    expect((await api.listGenerations({ status: "running" })).items).toHaveLength(0);
    expect((await api.listGenerations({ status: "pending" })).items).toHaveLength(0);
  });
});

describe("poll error classification", () => {
  it("keeps polling through a 403 (key rotation) instead of failing the job", async () => {
    const g = await submitVideo({ prompt: "POLL_FORBIDDEN" });
    await waitFor(() => mock.calls("/api/v1/videos/vid_forbidden").length >= 3);
    expect(await status(g.id)).toBe("running");
    await api.deleteGeneration(g.id);
  });

  it("warns on an unknown status and fails the job once the provider attaches an error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const g = await submitVideo({ prompt: "POLL_UNKNOWN" });
    await waitFor(failed(g.id));
    const record = await api.getGeneration(g.id);
    expect(record.error).toBe("exploded");
    expect(warn.mock.calls.filter((c) => String(c[0]).includes(`job ${g.id} unknown provider status "mystery"`))).toHaveLength(1);
  });

  it("fails the submit when the polling url points off OpenRouter, without sending the key there", async () => {
    await expect(submitVideo({ prompt: "POLL_FOREIGN" })).rejects.toMatchObject({ status: 502, error: "Refusing to send the API key to evil.example" });
    expect(received.some((g) => g.type === "video" && g.status === "failed" && g.error === "Refusing to send the API key to evil.example")).toBe(true);
    expect(mock.seen.some((s) => s.url.includes("evil.example"))).toBe(false);
  });
});

describe("reference counting", () => {
  it("deletes an input upload only when no other generation references it", async () => {
    const ref = await upload();
    const make = async (): Promise<Generation> => {
      const g = await generateImage({ prompt: "edit", referenceImages: [ref] });
      await waitFor(completed(g.id));
      return g;
    };
    const a = await make();
    const b = await make();
    await api.deleteGeneration(a.id);
    expect(await mediaExists(ref)).toBe(true); // b still references it
    await api.deleteGeneration(b.id);
    expect(await mediaExists(ref)).toBe(false); // last reference gone
  });

  it("keeps a video's output alive while an edit uses it as its source (Edit video)", async () => {
    const video = await submitVideo();
    await waitFor(completed(video.id));
    const output = `${video.id}.mp4`;
    const edit = await submitVideo({ prompt: "POLL_FORBIDDEN make it snow", model: "black-forest-labs/flux-video-edit", sourceVideo: output });
    expect(edit.inputs?.sourceVideo).toBe(output);
    await api.deleteGeneration(video.id);
    expect(await mediaExists(output)).toBe(true);
    await api.deleteGeneration(edit.id);
    expect(await mediaExists(output)).toBe(false);
  });

  it("keeps an image's output alive while a video uses it as first frame (Animate)", async () => {
    const image = await generateImage();
    await waitFor(completed(image.id));
    const output = `${image.id}.png`;
    const video = await submitVideo({ prompt: "POLL_FORBIDDEN", firstFrame: output });
    await api.deleteGeneration(image.id);
    expect(await mediaExists(output)).toBe(true); // the video's input thumbnail and Reuse still work
    await api.deleteGeneration(video.id);
    expect(await mediaExists(output)).toBe(false);
  });
});

describe("resume after a closed tab", () => {
  it("fails interrupted image jobs, fails a video that was never accepted, and adopts a running video", async () => {
    const ts = new Date().toISOString();
    await insertGenerations(
      [
        toStored({ id: "gen_image0000", type: "image", status: "running", prompt: "p", model: "google/gemini-3-pro-image", modelName: "M", params: { aspectRatio: "1:1", size: "1K" }, createdAt: ts, updatedAt: ts }),
        toStored({ id: "gen_nosubmit0", type: "video", status: "pending", prompt: "p", model: "bytedance/seedance-2.5", modelName: "M", params: { duration: 5 }, createdAt: ts, updatedAt: ts }),
        toStored({ id: "gen_adopted00", type: "video", status: "running", prompt: "p", model: "bytedance/seedance-2.5", modelName: "M", params: { duration: 5 }, providerJobId: "vid_1", pollingUrl: "/api/v1/videos/vid_1", createdAt: ts, updatedAt: ts }),
      ],
      10,
    );
    await resumeJobs();
    expect(await api.getGeneration("gen_image0000")).toMatchObject({ status: "failed", error: INTERRUPTED_IMAGE });
    expect(await api.getGeneration("gen_nosubmit0")).toMatchObject({ status: "failed", error: INTERRUPTED_SUBMIT });
    await waitFor(completed("gen_adopted00"));
    expect((await api.getGeneration("gen_adopted00")).output).toMatchObject({ id: "gen_adopted00.mp4", durationSec: 5 });
    expect(await bytesOf("gen_adopted00.mp4")).toEqual(Array.from(MP4));
  });
});

describe("live model catalog", () => {
  it("reads OpenRouter's public video and image catalogs, without a key, and caches them", async () => {
    setStoredKey("");
    const res = await api.getModels();
    expect(res.live).toBeDefined();
    const available = new Set(res.live?.available);
    for (const m of IMAGE_MODELS.filter((x) => !x.offOpenRouter)) expect(available.has(m.id), m.id).toBe(true);
    for (const m of VIDEO_MODELS.filter((x) => !x.offOpenRouter)) expect(available.has(m.id), m.id).toBe(true);
    expect(mock.seen.map((s) => s.url).sort()).toEqual(["/api/v1/images/models", "/api/v1/videos/models"]);
    expect(mock.seen.every((s) => s.auth === undefined)).toBe(true);
    const before = mock.seen.length;
    await api.getModels(); // cached (and mirrored to localStorage)
    expect(mock.seen.length).toBe(before);
    expect(localStorage.getItem("higgsfree.live-models")).toContain('"version":2');
  });

  it("offers every generative video model OpenRouter lists, with its live options, and hides the rest", async () => {
    const { video } = await api.getModels();
    const ids = video.map((m) => m.id);
    expect(ids).toContain("x-ai/grok-imagine-video-1.5-lite");
    expect(ids).not.toContain("black-forest-labs/flux-video-upscale"); // upscaling
    expect(ids).not.toContain("heygen/avatar-iv"); // needs audio
    // Curated editors stay, with their own options and OpenRouter's price (and minimum).
    expect(video.find((m) => m.id === "black-forest-labs/flux-video-edit")).toMatchObject({ caps: { videoEdit: true }, resolutions: ["720p"], estCostPerSecUsd: { "720p": 0.03 } });
    expect(video.find((m) => m.id === "runway/aleph-2")).toMatchObject({ caps: { videoEdit: true }, estCostPerSecUsd: { "720p": 0.28 }, minCostUsd: 0.56 });
    const discovered = video.find((m) => m.id === "acme/motion-1");
    expect(discovered).toMatchObject({
      name: "Motion 1",
      discovered: true,
      verified: false,
      caps: { textToVideo: true, imageToVideo: true, lastFrame: false, audio: true, references: false },
      durations: { options: [4, 8] },
      resolutions: ["480p", "1080p"], // 8K is not an option the app knows
      aspectRatios: ["16:9", "9:16"],
      estCostPerSecUsd: { "480p": 0.05, "1080p": 0.2 },
    });
    // Curated quirks survive the merge; options come from OpenRouter.
    const seedance = video.find((m) => m.id === "bytedance/seedance-2.0");
    expect(seedance).toMatchObject({ omitAspectRatioOnI2v: true, caps: { realFaces: false, audio: true }, resolutions: ["480p", "720p", "1080p", "4K"] });
    // A discovered model is usable end to end.
    const g = await submitVideo({ model: "acme/motion-1", duration: 5, resolution: "1080p", aspectRatio: "9:16" });
    expect(mock.last("/api/v1/videos")?.body).toMatchObject({ model: "acme/motion-1", duration: 4, resolution: "1080p", aspect_ratio: "9:16" });
    await api.deleteGeneration(g.id);
  });

  it("serves image models OpenRouter adds through the native images API", async () => {
    const { image } = await api.getModels();
    const banana = image.find((m) => m.id === "google/gemini-nano-banana-2.1");
    expect(banana).toMatchObject({ endpoint: "native", discovered: true, sizes: ["1K", "2K", "4K"], supportsImageSize: true, caps: { maxReferenceImages: 8 } });
    expect(image.some((m) => m.id === "recraft/recraft-v4-vector")).toBe(false); // SVG only
    expect(image.find((m) => m.id === "recraft/recraft-v4-styles")?.caps.textToImage).toBe(false); // needs a reference
    expect(image.find((m) => m.id === "google/gemini-3-pro-image")?.endpoint).toBe("chat"); // curated route kept

    const ref = await upload();
    const g = await generateImage({ model: "google/gemini-nano-banana-2.1", aspectRatio: "16:9", size: "2K", referenceImages: [ref] });
    await waitFor(completed(g.id));
    expect(mock.last("/api/v1/images")?.body).toEqual({
      model: "google/gemini-nano-banana-2.1",
      prompt: "p",
      aspect_ratio: "16:9",
      resolution: "2K",
      input_references: [{ type: "image_url", image_url: { url: PNG_DATA_URL } }],
    });
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", costUsd: 0.039, output: { mime: "image/png", width: 2, height: 2 } });
    await expect(generateImage({ model: "recraft/recraft-v4-styles" })).rejects.toMatchObject({ status: 400, error: expect.stringContaining("needs at least one reference image") });
  });

  it("falls back to the curated catalog while OpenRouter's catalog is unreachable", async () => {
    mock.state.catalogDown = true;
    const res = await api.getModels();
    expect(res.live).toBeUndefined();
    expect(res.video.map((m) => m.id)).toEqual(VIDEO_MODELS.filter((m) => !m.hidden).map((m) => m.id));
    expect(res.image).toEqual(IMAGE_MODELS);
  });
});

describe("account", () => {
  it("tests a key against OpenRouter and maps a rejection to 401 Invalid API key", async () => {
    expect(await api.testSettings()).toEqual({ total: 10, used: 2.5, remaining: 7.5, key: { label: "test key", limit: null, usage: 2.5, isFreeTier: false } });
    await expect(api.testSettings("wrong-key")).rejects.toMatchObject({ status: 401, error: "Invalid API key", provider: { error: { message: "User not found.", code: 401 } } });
    expect(JSON.stringify(await api.getSettings())).not.toContain("test-key");
  });
});

describe("listing and stats", () => {
  it("paginates newest-first with an opaque cursor and counts the library", async () => {
    const a = await generateImage();
    const b = await generateImage();
    await waitFor(() => completed(a.id)() && completed(b.id)());
    const failedOne = await submitVideo({ model: "bytedance/seedance-2.0", resolution: "4K" }).catch(() => undefined);
    expect(failedOne).toBeUndefined();
    const page1 = await api.listGenerations({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await api.listGenerations({ limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(1);
    expect(page2.items.map((g) => g.id)).not.toContain(page1.items[0]?.id);
    expect((await api.listGenerations({ type: "video", status: "failed" })).items).toHaveLength(1);
    const stats = await api.getStorageStats();
    expect(stats.image).toEqual({ count: 2, completed: 2, bytes: PNG_2X2.length * 2 });
    expect(stats.video).toEqual({ count: 1, completed: 0, bytes: 0 });
    await api.deleteLibrary();
    expect((await api.listGenerations()).items).toHaveLength(0);
    expect(await mediaExists(`${a.id}.png`)).toBe(false);
  });
});
