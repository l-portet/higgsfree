/**
 * Upscalers end to end against mocked fal and kie.ai: one image or video in, no prompt, the scale sent as each provider
 * spells it, the result stored like any other run; and what the engine refuses before anything is sent.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import * as api from "@/lib/api";
import { cancelAllJobs } from "@/lib/engine";
import { limits, timing } from "@/lib/engine/constants";
import { subscribeEvents } from "@/lib/live";
import { resetLiveModels } from "@/lib/openrouter";
import { setProviderKey, setStoredFalKey, setStoredKey } from "@/lib/settings";
import { FAL_KEY, installMockOpenRouter, KIE_KEY, MP4, PNG_2X2, PNG_DATA_URL, sleep, waitFor, type MockOpenRouter } from "./mock-openrouter";

let mock: MockOpenRouter;
const received: Generation[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  mock = installMockOpenRouter();
  timing.pollIntervalMs = 5;
  limits.maxActiveJobs = 8;
  resetLiveModels();
  received.length = 0;
  unsubscribe = subscribeEvents((ev) => {
    if (ev.type === "generation") received.push(ev.generation);
  });
});

afterEach(async () => {
  unsubscribe();
  cancelAllJobs();
  await sleep(10);
});

const completed = (id: string) => (): boolean => received.some((g) => g.id === id && g.status === "completed");
const uploadImage = async (): Promise<string> => (await api.upload(new Blob([PNG_2X2], { type: "image/png" }))).media.id;
const uploadVideo = async (): Promise<string> => (await api.uploadVideo(new Blob([MP4], { type: "video/mp4" }))).media.id;
const upscaleImage = async (extra: Record<string, unknown>): Promise<Generation> => {
  const g = (await api.generateImage({ prompt: "", model: "topaz/upscale-image", aspectRatio: "auto", size: "1K", count: 1, ...extra })).generations[0];
  if (!g) throw new Error("no generation");
  return g;
};

describe("image upscalers", () => {
  it("Topaz on fal: the image and the scale, no prompt; the one image fal answers with is stored", async () => {
    setStoredFalKey(FAL_KEY);
    const g = await upscaleImage({ referenceImages: [await uploadImage()], upscale: 4 });
    expect(g).toMatchObject({ provider: "fal", prompt: "", params: { upscale: 4 } });
    await waitFor(completed(g.id));
    expect(mock.fal("/topaz/upscale/image/precision")[0]?.body).toEqual({ image_url: PNG_DATA_URL, upscale_factor: 4 });
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", output: { mime: "image/png" } });
  });

  it("Recraft Crisp on kie.ai: the image goes up first, as `image`, with no scale", async () => {
    setProviderKey("kie", KIE_KEY);
    const g = await upscaleImage({ model: "recraft/crisp-upscale", referenceImages: [await uploadImage()] });
    expect(g.provider).toBe("kie");
    await waitFor(completed(g.id));
    expect(mock.kie("/api/v1/jobs/createTask")[0]?.body).toEqual({ model: "recraft/crisp-upscale", input: { image: "https://tempfile.redpandaai.co/higgsfree/up-1.png" } });
    expect((await api.getGeneration(g.id)).params).not.toHaveProperty("upscale");
  });

  it("Topaz's creative mode runs on its generative endpoint, on fal only (kie.ai has none)", async () => {
    setStoredFalKey(FAL_KEY);
    setProviderKey("kie", KIE_KEY);
    const g = await upscaleImage({ referenceImages: [await uploadImage()], upscale: 2, creative: true });
    expect(g).toMatchObject({ provider: "fal", params: { upscale: 2, creative: true } });
    await waitFor(completed(g.id));
    expect(mock.fal("/topaz/upscale/image/generative")[0]?.body).toEqual({ image_url: PNG_DATA_URL, upscale_factor: 2 });
    expect(mock.kie("/api/v1/jobs/createTask")).toHaveLength(0);
  });

  it("SeedVR2 on fal: the image and the scale; it has no creative mode", async () => {
    setStoredFalKey(FAL_KEY);
    const id = await uploadImage();
    const g = await upscaleImage({ model: "bytedance/seedvr2-upscale", referenceImages: [id], upscale: 4 });
    await waitFor(completed(g.id));
    expect(mock.fal("/fal-ai/seedvr/upscale/image")[0]?.body).toEqual({ image_url: PNG_DATA_URL, upscale_factor: 4 });
    await expect(upscaleImage({ model: "bytedance/seedvr2-upscale", referenceImages: [id], creative: true })).rejects.toMatchObject({ status: 400, error: "SeedVR2 Upscale has no creative mode" });
  });

  it("refuses no image, two images, a batch and a scale the model does not offer", async () => {
    setStoredFalKey(FAL_KEY);
    const id = await uploadImage();
    await expect(upscaleImage({})).rejects.toMatchObject({ status: 400, error: "Topaz Upscale upscales one image at a time" });
    await expect(upscaleImage({ referenceImages: [id, id] })).rejects.toMatchObject({ status: 400, error: "Topaz Upscale upscales one image at a time" });
    await expect(upscaleImage({ referenceImages: [id], count: 2 })).rejects.toMatchObject({ status: 400, error: "Topaz Upscale makes one image per run" });
    await expect(upscaleImage({ referenceImages: [id], upscale: 3 })).rejects.toMatchObject({ status: 400, error: "Topaz Upscale upscales 2x or 4x" });
    await expect(api.generateImage({ prompt: "p", model: "google/gemini-3-pro-image", aspectRatio: "1:1", size: "1K", count: 1, upscale: 2 })).rejects.toMatchObject({ status: 400 });
    expect(mock.fal("/topaz/upscale/image/precision")).toHaveLength(0);
  });
});

describe("video upscalers", () => {
  it("Topaz on kie.ai: the video goes up through the stream upload, the scale as a string; the clip keeps its length", async () => {
    setProviderKey("kie", KIE_KEY);
    const source = await uploadVideo();
    const g = (await api.generateVideo({ prompt: "", model: "topaz/upscale-video", duration: 5, sourceVideo: source, upscale: 4 })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g).toMatchObject({ provider: "kie", params: { duration: 0, upscale: 4 } });
    expect(mock.kie("/api/v1/jobs/createTask")[0]?.body).toEqual({
      model: "topaz/video-upscale",
      input: { video_url: "https://tempfile.redpandaai.co/higgsfree/up-1.mp4", upscale_factor: "4" },
    });
    await waitFor(completed(g.id));
    expect(await api.getGeneration(g.id)).toMatchObject({ params: { duration: 5, upscale: 4 } });
  });

  it("ByteDance on fal: the uploaded video and the target resolution as fal spells it", async () => {
    setStoredFalKey(FAL_KEY);
    const source = await uploadVideo();
    const g = (await api.generateVideo({ prompt: "", model: "bytedance/video-upscaler", duration: 5, sourceVideo: source, resolution: "2K" })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g).toMatchObject({ provider: "fal", params: { resolution: "2K" } });
    expect(mock.fal("/fal-ai/bytedance-upscaler/upscale/video")[0]?.body).toEqual({ video_url: "https://v3b.fal.media/files/ref-1.mp4", target_resolution: "2k" });
    await waitFor(completed(g.id));
  });

  it("Gemini Omni Flash 1.2 on fal: the uploaded video and the target as `resolution`, as fal spells it", async () => {
    setStoredFalKey(FAL_KEY);
    const source = await uploadVideo();
    const g = (await api.generateVideo({ prompt: "", model: "fal/gemini-omni-flash-1.2-upscale", duration: 5, sourceVideo: source, resolution: "4K" })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g).toMatchObject({ provider: "fal", params: { resolution: "4K" } });
    expect(mock.fal("/google/gemini-omni-flash/v1.2/upscale")[0]?.body).toEqual({ video_url: "https://v3b.fal.media/files/ref-1.mp4", resolution: "4k" });
    await waitFor(completed(g.id));
  });

  it("Topaz Starlight (the creative mode) on fal, asking for H.264 so every browser plays the clip", async () => {
    setStoredFalKey(FAL_KEY);
    const source = await uploadVideo();
    const g = (await api.generateVideo({ prompt: "", model: "topaz/upscale-video", duration: 5, sourceVideo: source, upscale: 2, creative: true })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g).toMatchObject({ provider: "fal", params: { upscale: 2, creative: true } });
    expect(mock.fal("/topaz/upscale/video/generative")[0]?.body).toEqual({ H264_output: true, video_url: "https://v3b.fal.media/files/ref-1.mp4", upscale_factor: 2 });
    await waitFor(completed(g.id));
  });

  it("FLUX Video Upscale on OpenRouter: the clip inline, the scale and the creativity (0 or 1)", async () => {
    setStoredKey("test-key");
    const source = await uploadVideo();
    const g = (await api.generateVideo({ prompt: "", model: "black-forest-labs/flux-video-upscale", duration: 5, sourceVideo: source, upscale: 1.5 })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g).toMatchObject({ provider: "openrouter", params: { upscale: 1.5 } });
    expect(mock.last("/api/v1/videos")?.body).toMatchObject({ model: "black-forest-labs/flux-video-upscale", upscale_factor: 1.5, creativity: 0, input_references: [{ type: "video_url" }] });
    expect(mock.last("/api/v1/videos")?.body).not.toHaveProperty("prompt");
    await waitFor(completed(g.id));
  });

  it("FLUX Video Upscale on fal: the creative mode is its `creativity` field", async () => {
    setStoredFalKey(FAL_KEY);
    const source = await uploadVideo();
    const g = (await api.generateVideo({ prompt: "", model: "black-forest-labs/flux-video-upscale", duration: 5, sourceVideo: source, upscale: 3, creative: true })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g.provider).toBe("fal");
    expect(mock.fal("/blackforestlabs/flux-video-upscale")[0]?.body).toEqual({ video_url: "https://v3b.fal.media/files/ref-1.mp4", creativity: 1, upscale_factor: 3 });
  });

  it("refuses no video, other inputs, a scale on a resolution model and a resolution on a scale model", async () => {
    setProviderKey("kie", KIE_KEY);
    setStoredFalKey(FAL_KEY);
    const source = await uploadVideo();
    const run = (body: Record<string, unknown>) => api.generateVideo({ prompt: "", model: "topaz/upscale-video", duration: 5, ...body });
    await expect(run({})).rejects.toMatchObject({ status: 400, error: "Topaz Video Upscale needs a video to upscale" });
    await expect(run({ sourceVideo: source, firstFrame: await uploadImage() })).rejects.toMatchObject({ status: 400, error: "Topaz Video Upscale takes a video only" });
    await expect(run({ sourceVideo: source, resolution: "4K" })).rejects.toMatchObject({ status: 400, error: "Topaz Video Upscale takes a scale, not a resolution. Leave it unset." });
    await expect(run({ model: "bytedance/video-upscaler", sourceVideo: source, upscale: 2 })).rejects.toMatchObject({ status: 400, error: "ByteDance Video Upscaler takes a target resolution, not a scale" });
    expect(mock.kie("/api/v1/jobs/createTask")).toHaveLength(0);
  });
});
