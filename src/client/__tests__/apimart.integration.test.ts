/**
 * APIMart end to end against a mocked APIMart (and the other providers): images uploaded first, the task
 * submitted, polled until the result is there, the file stored with what APIMart charged; who runs what
 * once an APIMart key is set; failures and the key test.
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
import { APIMART_KEY, FAL_KEY, installMockOpenRouter, KIE_KEY, MP4, PNG_2X2, sleep, waitFor, type MockOpenRouter } from "./mock-openrouter";

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
  const g = (await api.generateVideo({ prompt: "a fox in the snow", model: "bytedance/seedance-2.0", duration: 5, ...req })).generations[0];
  if (!g) throw new Error("no generation");
  return g;
};

describe("APIMart videos", () => {
  it("uploads the frame, submits the task, polls it and stores the clip with what APIMart charged", async () => {
    setProviderKey("apimart", APIMART_KEY);
    const frame = await uploadImage();
    const g = await video({ resolution: "720p", firstFrame: frame, audio: false });
    expect(g).toMatchObject({ status: "running", provider: "apimart", providerJobId: "task_am_1", params: { duration: 5, resolution: "720p", audio: false } });

    expect(mock.apimart("/v1/uploads/images")[0]).toMatchObject({ host: "api.apimart.ai", auth: `Bearer ${APIMART_KEY}`, form: { file: `input.png (${PNG_2X2.length} bytes)` } });
    expect(mock.apimart("/v1/videos/generations")[0]?.body).toEqual({
      model: "seedance-2.0",
      prompt: "a fox in the snow",
      size: "adaptive",
      resolution: "720p",
      duration: 5,
      generate_audio: false,
      image_with_roles: [{ url: "https://upload.apimart.ai/f/image/up-1.png", role: "first_frame" }],
    });

    await waitFor(completed(g.id));
    const done = await api.getGeneration(g.id);
    expect(done).toMatchObject({ status: "completed", costUsd: 0.42, output: { id: `${g.id}.mp4`, mime: "video/mp4", durationSec: 5 } });
    expect(Array.from(new Uint8Array(await (await getMediaBlob(`${g.id}.mp4`))!.arrayBuffer()))).toEqual(Array.from(MP4));
    expect(mock.apimart("/v1/tasks/task_am_1").every((s) => s.auth === `Bearer ${APIMART_KEY}`)).toBe(true);
    expect(mock.apimart("/f/video/out.mp4")[0]?.auth).toBeUndefined(); // the file host never sees the key
  });

  it("with every key: a video goes to the cheapest of four", async () => {
    setStoredKey("test-key");
    setStoredFalKey(FAL_KEY);
    setProviderKey("kie", KIE_KEY);
    setProviderKey("apimart", APIMART_KEY);
    // Veo 3.1, 8 s at 1080p: $1.00 a clip on APIMart, $1.275 on kie, $3.20 on OpenRouter.
    expect((await video({ model: "google/veo-3.1", duration: 8, resolution: "1080p", aspectRatio: "16:9" })).provider).toBe("apimart");
    expect(mock.apimart("/v1/videos/generations")[0]?.body).toMatchObject({ model: "veo3.1-quality", duration: 8, resolution: "1080p", aspect_ratio: "16:9" });
    // Seedance 2.5 at 720p, 5 s: $1.08 on APIMart, $1.16 on OpenRouter, $1.58 on kie.
    expect((await video({ model: "bytedance/seedance-2.5", resolution: "720p", aspectRatio: "16:9" })).provider).toBe("apimart");
    // Kling 3.0 Pro without sound: $0.448 on APIMart and $0.45 on kie are the same price, so the first of them.
    expect((await video({ model: "kwaivgi/kling-v3.0-pro", audio: false })).provider).toBe("kie");
    // Picked in the composer, APIMart runs it.
    expect((await video({ model: "kwaivgi/kling-v3.0-pro", audio: false, provider: "apimart" })).provider).toBe("apimart");
  });

  it("PixVerse 6 Max, on fal, kie.ai and APIMart: a frame without a prompt runs on APIMart, the cheapest; an OpenRouter key does not help", async () => {
    setStoredKey("test-key");
    await expect(video({ model: "pixverse/pixverse-v6-max", prompt: "p" })).rejects.toMatchObject({ status: 401, error: expect.stringContaining("APIMart") });
    setStoredFalKey(FAL_KEY);
    setProviderKey("kie", KIE_KEY);
    setProviderKey("apimart", APIMART_KEY);
    const frame = await uploadImage();
    const g = await video({ model: "pixverse/pixverse-v6-max", prompt: "", resolution: "1080p", aspectRatio: "16:9", audio: true, firstFrame: frame });
    expect(g).toMatchObject({ provider: "apimart", params: { duration: 5, resolution: "1080p", audio: true } });
    expect(mock.apimart("/v1/videos/generations")[0]?.body).toEqual({
      model: "pixverse-v6-max",
      prompt: "",
      resolution: "1080p",
      duration: 5,
      audio: true,
      image_urls: ["https://upload.apimart.ai/f/image/up-1.png"],
    });
    expect(mock.kie("/api/v1/jobs/createTask")).toHaveLength(0);
    expect(mock.fal("/pixverse/v6/max/image-to-video")).toHaveLength(0);
    await waitFor(completed(g.id));
  });

  it("Seedance 1.5 Pro, on APIMart only since OpenRouter retired it: an OpenRouter key does not run it, an APIMart key does", async () => {
    setStoredKey("test-key");
    await expect(video({ model: "bytedance/seedance-1-5-pro" })).rejects.toMatchObject({ status: 401, error: expect.stringContaining("APIMart") });
    setProviderKey("apimart", APIMART_KEY);
    const g = await video({ model: "bytedance/seedance-1-5-pro", resolution: "720p", aspectRatio: "9:16", audio: false });
    expect(g).toMatchObject({ provider: "apimart", params: { duration: 5, resolution: "720p", aspectRatio: "9:16", audio: false } });
    expect(mock.apimart("/v1/videos/generations")[0]?.body).toEqual({
      model: "seedance-1-5-pro",
      prompt: "a fox in the snow",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: 5,
      audio: false,
    });
    expect(mock.calls("/api/v1/videos")).toHaveLength(0);
    await waitFor(completed(g.id));
  });

  it("Gemini Omni Flash 1.2 on APIMart: both frames uploaded, no duration sent, the cost recorded", async () => {
    // No kie.ai key: kie, which has a price, would run it.
    setStoredKey("test-key");
    await expect(video({ model: "google/gemini-omni-flash-1.2", duration: 8 })).rejects.toMatchObject({ status: 401, error: expect.stringContaining("APIMart") });
    setProviderKey("apimart", APIMART_KEY);
    const [first, last] = [await uploadImage(), await uploadImage()];
    const g = await video({ model: "google/gemini-omni-flash-1.2", duration: 8, resolution: "1080p", aspectRatio: "9:16", firstFrame: first, lastFrame: last });
    expect(g).toMatchObject({ provider: "apimart", params: { duration: 8, resolution: "1080p", aspectRatio: "9:16" } });
    expect(mock.apimart("/v1/videos/generations")[0]?.body).toEqual({
      model: "gemini-omni-1.2-flash",
      prompt: "a fox in the snow",
      resolution: "1080p",
      aspect_ratio: "9:16",
      first_frame_image: "https://upload.apimart.ai/f/image/up-1.png",
      last_frame_image: "https://upload.apimart.ai/f/image/up-2.png",
    });
    await waitFor(completed(g.id));
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", costUsd: 0.42 });
  });

  it("MAGI-2, on kie.ai and APIMart: APIMart, the cheaper, takes frames and reference images; kie a frame without a prompt", async () => {
    setStoredKey("test-key");
    await expect(video({ model: "sand-ai/magi-2" })).rejects.toMatchObject({ status: 401 });
    setProviderKey("kie", KIE_KEY);
    setProviderKey("apimart", APIMART_KEY);
    const [first, last] = [await uploadImage(), await uploadImage()];
    // 12 s at 1080p: $0.96 on APIMart, $1.056 on kie.
    const g = await video({ model: "sand-ai/magi-2", duration: 12, aspectRatio: "21:9", audio: false, firstFrame: first, lastFrame: last });
    expect(g).toMatchObject({ provider: "apimart", params: { duration: 12, resolution: "1080p", audio: false } });
    expect(mock.apimart("/v1/videos/generations")[0]?.body).toEqual({
      model: "magi-2",
      prompt: "a fox in the snow",
      duration: 12,
      resolution: "1080p",
      generate_audio: false,
      first_frame_image: "https://upload.apimart.ai/f/image/up-1.png",
      last_frame_image: "https://upload.apimart.ai/f/image/up-2.png",
    });
    await waitFor(completed(g.id));
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", provider: "apimart", costUsd: 0.42 });

    const ref = await uploadImage();
    const r = await video({ model: "sand-ai/magi-2", aspectRatio: "9:16", references: [ref] });
    expect(r).toMatchObject({ provider: "apimart", params: { duration: 5, resolution: "1080p", aspectRatio: "9:16", audio: true } });
    expect(mock.apimart("/v1/videos/generations")[1]?.body).toEqual({
      model: "magi-2",
      prompt: "a fox in the snow",
      duration: 5,
      resolution: "1080p",
      generate_audio: true,
      aspect_ratio: "9:16",
      image_with_roles: [{ url: expect.stringMatching(/^https:\/\/upload\.apimart\.ai\//), role: "reference_image" }],
      omni_reference_task_type: "reference",
    });
    await waitFor(completed(r.id));

    // APIMart needs a prompt with frames too: kie runs this one.
    const k = await video({ model: "sand-ai/magi-2", prompt: "", firstFrame: first });
    expect(k).toMatchObject({ provider: "kie" });
    expect(mock.kie("/api/v1/jobs/createTask")[0]?.body).toMatchObject({ model: "magi-2/image-to-video" });
    expect(mock.apimart("/v1/videos/generations")).toHaveLength(2);
    await waitFor(completed(k.id));
    expect(mock.calls("/api/v1/videos")).toHaveLength(0);
  });

  it("a task APIMart fails ends with its message; a refused submit is a 400", async () => {
    setProviderKey("apimart", APIMART_KEY);
    const g = await video({ prompt: "APIMART_FAIL" });
    await waitFor(failed(g.id));
    expect((await api.getGeneration(g.id)).error).toBe("The input image cannot be accessed");
    await expect(video({ prompt: "APIMART_REJECT" })).rejects.toMatchObject({ status: 400, error: "invalid size for this model" });
  });
});

describe("APIMart images", () => {
  it("runs on APIMart when picked, with the reference uploaded first", async () => {
    setStoredKey("test-key");
    setProviderKey("apimart", APIMART_KEY);
    const ref = await uploadImage();
    const g = (await api.generateImage({ prompt: "p", model: "google/gemini-3-pro-image", aspectRatio: "16:9", size: "2K", count: 1, referenceImages: [ref], provider: "apimart" })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g.provider).toBe("apimart");
    await waitFor(completed(g.id));
    expect(mock.apimart("/v1/images/generations")[0]?.body).toEqual({
      model: "gemini-3-pro-image-preview",
      prompt: "p",
      n: 1,
      image_urls: ["https://upload.apimart.ai/f/image/up-1.png"],
      size: "16:9",
      resolution: "2K",
    });
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", provider: "apimart", costUsd: 0.42, output: { mime: "image/png", width: 2, height: 2 } });
  });

  it("GPT Image 2.6, on APIMart only: refused without its key, then run there with the references uploaded, the cost recorded", async () => {
    setStoredKey("test-key");
    setStoredFalKey(FAL_KEY);
    setProviderKey("kie", KIE_KEY);
    const req = { prompt: "p", model: "openai/gpt-image-2.6", aspectRatio: "4:5" as const, size: "4K" as const, count: 1 };
    await expect(api.generateImage(req)).rejects.toMatchObject({ status: 401, error: "GPT Image 2.6 runs on APIMart. Add an APIMart key in Settings to use it." });
    expect((await api.listGenerations()).items).toHaveLength(0);
    setProviderKey("apimart", APIMART_KEY);
    const refs = [await uploadImage(), await uploadImage()];
    const g = (await api.generateImage({ ...req, referenceImages: refs })).generations[0];
    if (!g) throw new Error("no generation");
    expect(g).toMatchObject({ provider: "apimart", params: { aspectRatio: "4:5", size: "4K" } });
    await waitFor(completed(g.id));
    expect(mock.apimart("/v1/images/generations")[0]?.body).toEqual({
      model: "gpt-image-2.6",
      prompt: "p",
      n: 1,
      image_urls: ["https://upload.apimart.ai/f/image/up-1.png", "https://upload.apimart.ai/f/image/up-2.png"],
      size: "4:5",
      resolution: "4k",
    });
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", provider: "apimart", costUsd: 0.42 });
  });

  it("MiniMax H3 Image, on OpenRouter, fal, kie.ai and APIMart: an APIMart key alone runs it, `auto` and the resolution sent, the references uploaded", async () => {
    setProviderKey("apimart", APIMART_KEY);
    const req = { prompt: "a red fox", model: "minimax/minimax-h3-image", aspectRatio: "auto" as const, size: "2K" as const, count: 1 };
    const plain = (await api.generateImage(req)).generations[0];
    if (!plain) throw new Error("no generation");
    expect(plain.provider).toBe("apimart");
    await waitFor(completed(plain.id));
    const ref = await uploadImage();
    const edit = (await api.generateImage({ ...req, aspectRatio: "9:16", size: "4K", referenceImages: [ref] })).generations[0];
    if (!edit) throw new Error("no generation");
    expect(edit.provider).toBe("apimart");
    await waitFor(completed(edit.id));
    expect(mock.apimart("/v1/images/generations").map((c) => c.body)).toEqual([
      { model: "minimax-h3-image", prompt: "a red fox", n: 1, size: "auto", resolution: "2K" },
      { model: "minimax-h3-image", prompt: "a red fox", n: 1, image_urls: ["https://upload.apimart.ai/f/image/up-1.png"], size: "9:16", resolution: "4K" },
    ]);
    expect(mock.calls("/api/v1/images")).toHaveLength(0);
    expect(await api.getGeneration(edit.id)).toMatchObject({ status: "completed", provider: "apimart", costUsd: 0.42 });
  });

  it("Seedream 5.5, with kie.ai and APIMart keys: APIMart runs it, being the cheaper, as `seedream-5-5`, the tier alone for `auto`, the reference uploaded", async () => {
    setProviderKey("kie", KIE_KEY);
    setProviderKey("apimart", APIMART_KEY);
    const req = { prompt: "a red fox", model: "bytedance-seed/seedream-5-5", aspectRatio: "auto" as const, size: "1K" as const, count: 1 };
    const plain = (await api.generateImage(req)).generations[0];
    if (!plain) throw new Error("no generation");
    expect(plain.provider).toBe("apimart");
    await waitFor(completed(plain.id));
    const ref = await uploadImage();
    const edit = (await api.generateImage({ ...req, aspectRatio: "16:9", size: "2K", referenceImages: [ref] })).generations[0];
    if (!edit) throw new Error("no generation");
    expect(edit.provider).toBe("apimart");
    await waitFor(completed(edit.id));
    expect(mock.apimart("/v1/images/generations").map((c) => c.body)).toEqual([
      { model: "seedream-5-5", prompt: "a red fox", n: 1, size: "1K" },
      { model: "seedream-5-5", prompt: "a red fox", n: 1, image_urls: ["https://upload.apimart.ai/f/image/up-1.png"], size: "16:9", resolution: "2K" },
    ]);
    expect(mock.kie("/api/v1/jobs/createTask")).toHaveLength(0);
    expect(await api.getGeneration(edit.id)).toMatchObject({ status: "completed", provider: "apimart", costUsd: 0.42 });
  });
});

describe("APIMart key", () => {
  it("is tested against the balance, in dollars", async () => {
    expect(await api.testProviderKey("apimart", APIMART_KEY)).toEqual({ ok: true, balanceUsd: 12.5 });
    await expect(api.testProviderKey("apimart", "wrong")).rejects.toMatchObject({ status: 401, error: "Invalid APIMart key" });
  });
});
