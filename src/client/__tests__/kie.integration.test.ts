/**
 * kie.ai end to end against a mocked kie (and OpenRouter): inputs uploaded first, createTask, recordInfo
 * polled until the result is there, the file stored with the credits kie charged; who runs what once a
 * kie key is set; failures and the key test.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import * as api from "@/lib/api";
import { getMediaBlob } from "@/lib/db/media";
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
const failed = (id: string) => (): boolean => received.some((g) => g.id === id && g.status === "failed");
const uploadImage = async (): Promise<string> => (await api.upload(new Blob([PNG_2X2], { type: "image/png" }))).media.id;
const video = async (req: Record<string, unknown>): Promise<Generation> => {
  const g = (await api.generateVideo({ prompt: "slow push in", model: "kwaivgi/kling-v3.0-pro", duration: 5, ...req })).generations[0];
  if (!g) throw new Error("no generation");
  return g;
};

describe("kie.ai videos", () => {
  it("uploads the frame, creates the task, polls it and stores the clip with what kie charged", async () => {
    setProviderKey("kie", KIE_KEY);
    const frame = await uploadImage();
    const g = await video({ duration: 6, firstFrame: frame, audio: false });
    expect(g).toMatchObject({ status: "running", provider: "kie", providerJobId: "task_1", inputs: { firstFrame: frame }, params: { duration: 6, audio: false } });

    expect(mock.kie("/api/file-base64-upload")[0]).toMatchObject({ host: "kieai.redpandaai.co", auth: `Bearer ${KIE_KEY}`, body: { base64Data: PNG_DATA_URL, uploadPath: "higgsfree" } });
    expect(mock.kie("/api/v1/jobs/createTask")[0]?.body).toEqual({
      model: "kling-3.0/video",
      input: { prompt: "slow push in", sound: false, duration: "6", mode: "pro", multi_shots: false, image_urls: ["https://tempfile.redpandaai.co/higgsfree/up-1.png"] },
    });

    await waitFor(completed(g.id));
    const done = await api.getGeneration(g.id);
    expect(done).toMatchObject({ status: "completed", costUsd: 0.315, output: { id: `${g.id}.mp4`, mime: "video/mp4", width: 720, height: 1280, durationSec: 5 } });
    expect(Array.from(new Uint8Array(await (await getMediaBlob(`${g.id}.mp4`))!.arrayBuffer()))).toEqual(Array.from(MP4));
    expect(mock.kie("/api/v1/jobs/recordInfo").every((s) => s.auth === `Bearer ${KIE_KEY}` && s.url === "/api/v1/jobs/recordInfo?taskId=task_1")).toBe(true);
    expect(mock.kie("/r/out.mp4")[0]?.auth).toBeUndefined(); // the CDN never sees the key
  });

  it("Kling 4.0 with a style reference: fal takes none, so kie runs it on reference-to-video", async () => {
    setStoredFalKey(FAL_KEY);
    setProviderKey("kie", KIE_KEY);
    const ref = await uploadImage();
    const g = await video({ model: "fal/kling-v4", resolution: "1080p", aspectRatio: "21:9", references: [ref] });
    expect(g).toMatchObject({ provider: "kie", inputs: { referenceImages: [ref] }, params: { duration: 5, resolution: "1080p", aspectRatio: "21:9" } });
    expect(mock.kie("/api/v1/jobs/createTask")[0]?.body).toEqual({
      model: "kling-4.0/reference-to-video",
      input: { prompt: "slow push in", duration: 5, resolution: "1080p", aspect_ratio: "21:9", image_urls: ["https://tempfile.redpandaai.co/higgsfree/up-1.png"] },
    });
    expect(mock.fal("/kling/v4/text-to-video")).toHaveLength(0);
    await waitFor(completed(g.id));
  });

  it("with every key: kie runs what it makes cheapest, the others what they do, and refusals go elsewhere", async () => {
    setStoredKey("test-key");
    setStoredFalKey(FAL_KEY);
    setProviderKey("kie", KIE_KEY);
    // Veo 3.1, 8 s at 1080p: $3.20 on OpenRouter, $1.275 a clip on kie.
    expect((await video({ model: "google/veo-3.1", duration: 8, resolution: "1080p", aspectRatio: "16:9" })).provider).toBe("kie");
    expect(mock.kie("/api/v1/jobs/createTask")[0]?.body).toMatchObject({ model: "veo-3-1", input: { model: "veo3", resolution: "1080p", duration: 8, generation_type: "TEXT_2_VIDEO" } });
    // kie's Veo always has sound: with it off, OpenRouter runs it.
    expect((await video({ model: "google/veo-3.1", duration: 8, resolution: "1080p", aspectRatio: "16:9", audio: false })).provider).toBe("openrouter");
    // Seedance 2.5 stays cheapest on OpenRouter.
    expect((await video({ model: "bytedance/seedance-2.5", resolution: "720p", aspectRatio: "16:9" })).provider).toBe("openrouter");
    expect(mock.calls("/api/v1/videos")).toHaveLength(2);
    expect(mock.kie("/api/v1/jobs/createTask")).toHaveLength(1);
  });

  it("video editing: the source video goes through the stream upload", async () => {
    setProviderKey("kie", KIE_KEY);
    const source = (await api.uploadVideo(new Blob([MP4], { type: "video/mp4" }))).media.id;
    const g = (await api.generateVideo({ prompt: "make it night", model: "fal/wan-2.7-edit", duration: 5, resolution: "720p", sourceVideo: source })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g).toMatchObject({ provider: "kie", params: { duration: 0, resolution: "720p" } });
    expect(mock.kie("/api/file-stream-upload")[0]?.form).toEqual({ file: `${source} (${MP4.length} bytes)`, uploadPath: "higgsfree" });
    expect(mock.kie("/api/v1/jobs/createTask")[0]?.body).toEqual({
      model: "wan/2-7-videoedit",
      input: { prompt: "make it night", video_url: "https://tempfile.redpandaai.co/higgsfree/up-1.mp4", resolution: "720p" },
    });
    await waitFor(completed(g.id));
    expect(await api.getGeneration(g.id)).toMatchObject({ params: { duration: 5, resolution: "720p" } });
  });

  it("a task kie fails ends with kie's message; a refused task is a 400 and nothing is left running", async () => {
    setProviderKey("kie", KIE_KEY);
    const g = await video({ prompt: "KIE_FAIL" });
    await waitFor(failed(g.id));
    expect((await api.getGeneration(g.id)).error).toBe("Content flagged by the provider");
    await expect(video({ prompt: "KIE_REJECT" })).rejects.toMatchObject({ status: 400, error: "prompt is not allowed" });
  });
});

describe("kie.ai images", () => {
  it("runs on kie when it is the cheapest: the reference is uploaded and the task polled until the image is there", async () => {
    setStoredKey("test-key");
    setProviderKey("kie", KIE_KEY);
    // Nano Banana Pro at 2K: $0.09 on kie, $0.134 on OpenRouter.
    const ref = await uploadImage();
    const g = (await api.generateImage({ prompt: "p", model: "google/gemini-3-pro-image", aspectRatio: "16:9", size: "2K", count: 1, referenceImages: [ref] })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g.provider).toBe("kie");
    await waitFor(completed(g.id));
    expect(mock.kie("/api/v1/jobs/createTask")[0]?.body).toEqual({
      model: "nano-banana-pro",
      input: { prompt: "p", aspect_ratio: "16:9", resolution: "2K", output_format: "png", image_input: ["https://tempfile.redpandaai.co/higgsfree/up-1.png"] },
    });
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", provider: "kie", costUsd: 0.315, output: { mime: "image/png", width: 2, height: 2 } });
    expect(mock.calls("/api/v1/chat/completions")).toHaveLength(0);
  });

  it.each(["flare", "sunburst"])("GPT Image 2.6 %s, billed in tokens: no estimate to route on, the edit model run with the reference, the cost recorded", async (tier) => {
    setProviderKey("kie", KIE_KEY);
    const ref = await uploadImage();
    const g = (await api.generateImage({ prompt: "p", model: `openai/gpt-image-2.6-${tier}`, aspectRatio: "21:9", size: "1K", count: 1, referenceImages: [ref] })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g.provider).toBe("kie");
    await waitFor(completed(g.id));
    expect(mock.kie("/api/v1/jobs/createTask")[0]?.body).toEqual({
      model: `gpt-image-2-6/${tier}-image-to-image`,
      input: { prompt: "p", aspect_ratio: "21:9", resolution: "1K", input_urls: ["https://tempfile.redpandaai.co/higgsfree/up-1.png"] },
    });
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", provider: "kie", costUsd: 0.315 });
  });

  it("GPT Image 2.6 Economy, on kie.ai only: no `resolution`, the edit model run with a reference, the cost recorded", async () => {
    setProviderKey("kie", KIE_KEY);
    const req = { prompt: "p", model: "openai/gpt-image-2.6-economy", aspectRatio: "16:9" as const, size: "1K" as const, count: 1 };
    const plain = (await api.generateImage(req)).generations[0];
    if (!plain) throw new Error("no generation");
    expect(plain.provider).toBe("kie");
    await waitFor(completed(plain.id));
    const ref = await uploadImage();
    const edit = (await api.generateImage({ ...req, referenceImages: [ref] })).generations[0];
    if (!edit) throw new Error("no generation");
    await waitFor(completed(edit.id));
    expect(mock.kie("/api/v1/jobs/createTask").map((c) => c.body)).toEqual([
      { model: "gpt-image-2-6/economy-text-to-image", input: { prompt: "p", aspect_ratio: "16:9" } },
      { model: "gpt-image-2-6/economy-image-to-image", input: { prompt: "p", aspect_ratio: "16:9", input_urls: ["https://tempfile.redpandaai.co/higgsfree/up-1.png"] } },
    ]);
    expect(await api.getGeneration(edit.id)).toMatchObject({ status: "completed", provider: "kie", costUsd: 0.315 });
  });

  it("goes to another provider when the one picked cannot take the request", async () => {
    setStoredFalKey(FAL_KEY);
    setProviderKey("kie", KIE_KEY);
    // kie's FLUX.1 Kontext has no 3:2; fal's does.
    const g = (await api.generateImage({ prompt: "p", model: "fal/flux-kontext-pro", aspectRatio: "3:2", size: "1K", count: 1, provider: "kie" })).generations[0];
    expect(g?.provider).toBe("fal");
  });
});

describe("kie.ai key", () => {
  it("is tested against the balance, which comes back in credits", async () => {
    expect(await api.testProviderKey("kie", KIE_KEY)).toEqual({ ok: true, credits: 1234.5 });
    await expect(api.testProviderKey("kie", "wrong")).rejects.toMatchObject({ status: 401, error: "Invalid kie.ai key" });
    await expect(api.testProviderKey("kie")).rejects.toMatchObject({ status: 400 });
  });
});
