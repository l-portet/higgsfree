/**
 * fal end to end against a mocked fal (and OpenRouter): who runs what for each combination of
 * keys and preference, fal images (sync), fal videos (queue → status → result → CDN download),
 * motion control with an uploaded reference video, video editing, failures, resume after a closed tab.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import * as api from "@/lib/api";
import { insertGenerations, toStored } from "@/lib/db/generations";
import { getMediaBlob } from "@/lib/db/media";
import { cancelAllJobs, resumeJobs } from "@/lib/engine";
import { limits, timing } from "@/lib/engine/constants";
import { subscribeEvents } from "@/lib/live";
import { resetLiveModels } from "@/lib/openrouter";
import { setStoredFalKey, setStoredKey } from "@/lib/settings";
import { FAL_CDN, FAL_KEY, installMockOpenRouter, MP4, PNG_2X2, PNG_DATA_URL, sleep, waitFor, type MockOpenRouter } from "./mock-openrouter";

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
const uploadVideo = async (): Promise<string> => (await api.uploadVideo(new Blob([MP4], { type: "video/mp4" }))).media.id;
/** The 5 s fixture stretched to `seconds` by rewriting its mvhd duration (timescale 1000). */
const uploadVideoOf = async (seconds: number): Promise<string> => {
  const long = Uint8Array.from(MP4);
  const at = Array.from(long).findIndex((_, i) => String.fromCharCode(...long.subarray(i, i + 4)) === "mvhd");
  new DataView(long.buffer).setUint32(at + 4 + 16, seconds * 1000);
  return (await api.uploadVideo(new Blob([long]))).media.id;
};
const image = async (extra: Record<string, unknown>): Promise<Generation> => {
  const res = await api.generateImage({ prompt: "p", model: "google/gemini-3-pro-image", aspectRatio: "16:9", size: "2K", count: 1, ...extra });
  const g = res.generations[0];
  if (!g) throw new Error("no generation");
  return g;
};
const falCalls = (): string[] => mock.seen.filter((s) => s.host !== "openrouter.ai").map((s) => `${s.method} ${s.host}${s.url}`);

describe("who runs a model", () => {
  it("only an OpenRouter key: a fal-only model is refused with the reason, nothing is created", async () => {
    setStoredKey("test-key");
    await expect(image({ model: "fal/z-image-turbo" })).rejects.toMatchObject({ status: 401, error: "Z-Image Turbo needs a fal or kie.ai key. Add one in Settings to use it." });
    expect((await api.listGenerations()).items).toHaveLength(0);
  });

  it("only a fal key: a fal-only image runs on fal.run, a model on both runs on fal, an OpenRouter-only one is refused", async () => {
    setStoredFalKey(FAL_KEY);
    const z = await image({ model: "fal/z-image-turbo", aspectRatio: "9:16", size: "1K" });
    expect(z.provider).toBe("fal");
    await waitFor(completed(z.id));
    expect(mock.fal("/fal-ai/z-image/turbo")[0]?.body).toEqual({ prompt: "p", image_size: "portrait_16_9" });
    const stored = await api.getGeneration(z.id);
    expect(stored).toMatchObject({ status: "completed", provider: "fal", output: { mime: "image/png", width: 2, height: 2 } });
    expect(stored.costUsd).toBeUndefined(); // fal does not report a cost
    expect(mock.seen.find((s) => s.url === `/files/out.png`)?.auth).toBeUndefined(); // the CDN never sees the key

    const banana = await image({});
    expect(banana.provider).toBe("fal");
    await waitFor(completed(banana.id));
    expect(mock.fal("/fal-ai/nano-banana-pro")[0]?.body).toEqual({ prompt: "p", aspect_ratio: "16:9", resolution: "2K" });
    expect(mock.calls("/api/v1/chat/completions")).toHaveLength(0);

    await expect(image({ model: "krea/krea-2-large", aspectRatio: "1:1" })).rejects.toMatchObject({ status: 401, error: "Krea 2 Large runs on OpenRouter. Add an OpenRouter key in Settings to use it." });
  });

  it("both keys: a model on both follows the preference (OpenRouter by default)", async () => {
    setStoredKey("test-key");
    setStoredFalKey(FAL_KEY);
    expect((await api.getSettings()).preferredProvider).toBe("openrouter");
    const viaOpenRouter = await image({});
    await waitFor(completed(viaOpenRouter.id));
    expect(viaOpenRouter.provider).toBe("openrouter");
    expect(mock.calls("/api/v1/chat/completions")).toHaveLength(1);

    await api.updateSettings({ preferredProvider: "fal" });
    const ref = await uploadImage();
    const viaFal = await image({ referenceImages: [ref] });
    await waitFor(completed(viaFal.id));
    expect(viaFal.provider).toBe("fal");
    expect(mock.fal("/fal-ai/nano-banana-pro/edit")[0]?.body).toEqual({ prompt: "p", image_urls: [PNG_DATA_URL], aspect_ratio: "16:9", resolution: "2K" });
    expect(mock.calls("/api/v1/chat/completions")).toHaveLength(1);
  });

  it("both keys: a video goes to the cheaper provider, and the preference only breaks a tie", async () => {
    setStoredKey("test-key");
    setStoredFalKey(FAL_KEY);
    await api.updateSettings({ preferredProvider: "fal" });
    const video = async (extra: Record<string, unknown>): Promise<Generation> => {
      const g = (await api.generateVideo({ prompt: "p", model: "kwaivgi/kling-v3.0-pro", duration: 5, ...extra })).generations[0];
      if (!g) throw new Error("no generation");
      return g;
    };
    // Seedance 2.5 at 720p: about $0.23/s on OpenRouter, $0.47/s on fal.
    expect((await video({ model: "bytedance/seedance-2.5", resolution: "720p", aspectRatio: "16:9" })).provider).toBe("openrouter");
    expect(mock.calls("/api/v1/videos")).toHaveLength(1);
    // Kling 3.0 Pro without sound: $0.112/s on both, so the preference.
    expect((await video({ audio: false })).provider).toBe("fal");
    expect(mock.fal("/fal-ai/kling-video/v3/pro/text-to-video")[0]?.body).toMatchObject({ generate_audio: false });
    // fal takes no style references: OpenRouter runs it, whatever the preference.
    expect((await video({ references: [await uploadImage()] })).provider).toBe("openrouter");
    expect(mock.calls("/api/v1/videos")).toHaveLength(2);
  });

  it("a fal error is shown verbatim on the failed card", async () => {
    setStoredFalKey(FAL_KEY);
    const g = await image({ model: "fal/flux-dev", prompt: "FAL_FAIL", aspectRatio: "1:1", size: "1K" });
    await waitFor(failed(g.id));
    expect((await api.getGeneration(g.id)).error).toBe("prompt: prompt rejected");
  });
});

describe("fal videos", () => {
  it("motion control: uploads the reference video, queues the job, polls, downloads and stores the clip", async () => {
    setStoredKey("test-key");
    setStoredFalKey(FAL_KEY);
    const character = await uploadImage();
    const motion = await uploadVideo();
    expect(motion).toMatch(/^up_[A-Za-z0-9_-]+\.mp4$/);
    const { generations } = await api.generateVideo({ prompt: "", model: "fal/kling-v3-pro-motion-control", duration: 5, firstFrame: character, motionVideo: motion, orientation: "video" });
    const g = generations[0];
    if (!g) throw new Error("no generation");
    expect(g).toMatchObject({ status: "running", provider: "fal", providerJobId: "req_1", inputs: { firstFrame: character, motionVideo: motion }, params: { duration: 0, orientation: "video" } });

    // Upload: initiate with the key, then a keyless PUT to the presigned url.
    expect(mock.fal("/storage/upload/initiate?storage_type=fal-cdn-v3")[0]).toMatchObject({ auth: `Key ${FAL_KEY}`, body: { content_type: "video/mp4", file_name: motion } });
    const put = mock.seen.find((s) => s.method === "PUT");
    expect(put).toMatchObject({ host: "v3b.fal.media", url: "/upload/presigned-1" });
    expect(put?.auth).toBeUndefined();
    expect(mock.fal("/fal-ai/kling-video/v3/pro/motion-control")[0]?.body).toEqual({
      image_url: PNG_DATA_URL,
      video_url: `${FAL_CDN}/files/ref-1.mp4`,
      character_orientation: "video",
    });

    await waitFor(completed(g.id));
    const done = await api.getGeneration(g.id);
    expect(done).toMatchObject({ status: "completed", output: { id: `${g.id}.mp4`, mime: "video/mp4", width: 720, height: 1280, durationSec: 5 }, params: { duration: 5, orientation: "video" } });
    expect(Array.from(new Uint8Array(await (await getMediaBlob(`${g.id}.mp4`))!.arrayBuffer()))).toEqual(Array.from(MP4));
    expect(falCalls()).toEqual(expect.arrayContaining([
      "GET queue.fal.run/fal-ai/kling-video/requests/req_1/status",
      "GET queue.fal.run/fal-ai/kling-video/requests/req_1",
      "GET v3b.fal.media/files/out.mp4",
    ]));
  });

  it("a shared model routed to fal maps its options (Kling 3.0: start_image_url, string duration)", async () => {
    setStoredFalKey(FAL_KEY);
    const frame = await uploadImage();
    const { generations } = await api.generateVideo({ prompt: "push in", model: "kwaivgi/kling-v3.0-pro", duration: 6, aspectRatio: "9:16", firstFrame: frame, audio: false });
    const g = generations[0];
    if (!g) throw new Error("no generation");
    expect(mock.fal("/fal-ai/kling-video/v3/pro/image-to-video")[0]?.body).toEqual({ prompt: "push in", duration: "6", start_image_url: PNG_DATA_URL, generate_audio: false });
    await waitFor(completed(g.id));
    expect(await api.getGeneration(g.id)).toMatchObject({ provider: "fal", params: { duration: 6, audio: false } });
  });

  it("a job fal reports as failed ends with fal's message", async () => {
    setStoredFalKey(FAL_KEY);
    const { generations } = await api.generateVideo({ prompt: "FAL_FAIL", model: "fal/gemini-omni-flash-1.1", duration: 8, resolution: "1080p", aspectRatio: "16:9" });
    const g = generations[0];
    if (!g) throw new Error("no generation");
    expect(mock.fal("/google/gemini-omni-flash/v1.1/text-to-video")[0]?.body).toEqual({ prompt: "FAL_FAIL", duration: 8, aspect_ratio: "16:9", resolution: "1080p" });
    await waitFor(failed(g.id));
    expect((await api.getGeneration(g.id)).error).toBe("The reference video has no visible person");
  });

  it("checks the reference video's length against the orientation before uploading", async () => {
    setStoredFalKey(FAL_KEY);
    const character = await uploadImage();
    const motion = await uploadVideo(); // the fixture is 5 s
    const req = { prompt: "", model: "fal/kling-v3-pro-motion-control", duration: 5, firstFrame: character, motionVideo: motion };
    // A 5 s clip is fine both ways; a 12 s one only following the video.
    const longId = await uploadVideoOf(12);
    await expect(api.generateVideo({ ...req, motionVideo: longId, orientation: "image" })).rejects.toMatchObject({
      status: 400,
      error: "The reference video is 12 s. Kling 3.0 Motion Control takes up to 10 s when following the image. Switch to Follow video for up to 30 s.",
    });
    expect(mock.fal("/storage/upload/initiate?storage_type=fal-cdn-v3")).toHaveLength(0); // nothing uploaded
    const ok = await api.generateVideo({ ...req, motionVideo: longId, orientation: "video" });
    expect(ok.generations[0]?.params).toMatchObject({ orientation: "video" });
  });

  it("video editing: uploads the video, queues the edit endpoint with the prompt and resolution, stores the clip at its real length", async () => {
    setStoredFalKey(FAL_KEY);
    const source = await uploadVideo();
    const { generations } = await api.generateVideo({ prompt: "make it night", model: "fal/wan-2.7-edit", duration: 5, resolution: "720p", sourceVideo: source });
    const g = generations[0];
    if (!g) throw new Error("no generation");
    expect(g).toMatchObject({ status: "running", provider: "fal", inputs: { sourceVideo: source }, params: { duration: 0, resolution: "720p" } });
    expect(mock.fal("/storage/upload/initiate?storage_type=fal-cdn-v3")[0]).toMatchObject({ body: { content_type: "video/mp4", file_name: source } });
    expect(mock.fal("/fal-ai/wan/v2.7/edit-video")[0]?.body).toEqual({ prompt: "make it night", video_url: `${FAL_CDN}/files/ref-1.mp4`, resolution: "720p" });
    await waitFor(completed(g.id));
    expect(await api.getGeneration(g.id)).toMatchObject({ status: "completed", params: { duration: 5, resolution: "720p" }, output: { durationSec: 5 } });
  });

  it("checks the video to edit against the model's limits before uploading; a model that keeps the start takes any length", async () => {
    setStoredFalKey(FAL_KEY);
    const long = await uploadVideoOf(12);
    await expect(api.generateVideo({ prompt: "p", model: "fal/wan-2.7-edit", duration: 5, sourceVideo: long })).rejects.toMatchObject({
      status: 400,
      error: "The video is 12 s. Wan 2.7 Edit takes up to 10 s.",
    });
    await expect(api.generateVideo({ prompt: " ", model: "fal/kling-o3-edit", duration: 5, sourceVideo: long })).rejects.toMatchObject({ status: 400, error: "Say what to change in the video" });
    expect(mock.fal("/storage/upload/initiate?storage_type=fal-cdn-v3")).toHaveLength(0); // nothing uploaded
    expect((await api.listGenerations()).items).toHaveLength(0);
    await api.generateVideo({ prompt: "p", model: "fal/grok-imagine-edit", duration: 5, sourceVideo: long });
    expect(mock.fal("/xai/grok-imagine-video/edit-video")[0]?.body).toEqual({ prompt: "p", video_url: `${FAL_CDN}/files/ref-1.mp4`, resolution: "480p" });
  });

  it("an editor both providers offer runs on fal with only a fal key (FLUX Video Edit: the prompt and the video)", async () => {
    setStoredFalKey(FAL_KEY);
    const source = await uploadVideo();
    const { generations } = await api.generateVideo({ prompt: "remove the car", model: "black-forest-labs/flux-video-edit", duration: 5, resolution: "720p", sourceVideo: source });
    expect(generations[0]?.provider).toBe("fal");
    expect(mock.fal("/blackforestlabs/flux-3/edit-video")[0]?.body).toEqual({ prompt: "remove the car", video_url: `${FAL_CDN}/files/ref-1.mp4` });
    expect(mock.calls("/api/v1/videos")).toHaveLength(0);
  });

  it("validates motion-control inputs and refuses style references on fal", async () => {
    setStoredFalKey(FAL_KEY);
    const character = await uploadImage();
    await expect(api.generateVideo({ prompt: "", model: "fal/kling-v3-pro-motion-control", duration: 5, firstFrame: character })).rejects.toMatchObject({ status: 400, error: "Kling 3.0 Motion Control needs a reference video" });
    await expect(api.generateVideo({ prompt: "p", model: "kwaivgi/kling-v3.0-pro", duration: 5, references: [character] })).rejects.toMatchObject({ status: 400, error: expect.stringContaining("does not take style references") });
    await expect(api.generateVideo({ prompt: "p", model: "kwaivgi/kling-v3.0-pro", duration: 5, motionVideo: await uploadVideo() })).rejects.toMatchObject({ status: 400, error: "Kling 3.0 Pro does not take a reference video" });
  });

  it("deleting a running fal job asks fal to cancel it", async () => {
    setStoredFalKey(FAL_KEY);
    const { generations } = await api.generateVideo({ prompt: "p", model: "fal/kling-v3-turbo-pro", duration: 5, aspectRatio: "16:9" });
    const g = generations[0];
    if (!g) throw new Error("no generation");
    await api.deleteGeneration(g.id);
    await waitFor(() => mock.seen.some((s) => s.method === "PUT" && s.url === "/fal-ai/kling-video/requests/req_1/cancel"));
    expect(mock.seen.find((s) => s.url.endsWith("/cancel"))?.auth).toBe(`Key ${FAL_KEY}`);
  });

  it("resume adopts a fal job left by a closed tab", async () => {
    setStoredFalKey(FAL_KEY);
    const ts = new Date().toISOString();
    await insertGenerations(
      [toStored({
        id: "gen_falresume", type: "video", status: "running", prompt: "p", model: "fal/vidu-q4", modelName: "Vidu Q4", params: { duration: 5 }, provider: "fal",
        providerJobId: "req_1", pollingUrl: "https://queue.fal.run/fal-ai/vidu/requests/req_1/status", createdAt: ts, updatedAt: ts,
      })],
      10,
    );
    await resumeJobs();
    await waitFor(completed("gen_falresume"));
    expect(falCalls()).toContain("GET queue.fal.run/fal-ai/vidu/requests/req_1");
  });
});

describe("fal key and video uploads", () => {
  it("tests the fal key with an authenticated pricing lookup", async () => {
    await expect(api.testProviderKey("fal")).rejects.toMatchObject({ status: 400 });
    expect(await api.testProviderKey("fal", FAL_KEY)).toEqual({ ok: true });
    await expect(api.testProviderKey("fal", "wrong")).rejects.toMatchObject({ status: 401, error: "Invalid fal key" });
    const saved = await api.updateSettings({ keys: { fal: "abcdef12-3456-7890:secretsecretsecret" } });
    expect(saved.keys).toEqual({ fal: "abcdef12-…cret" });
    expect(JSON.stringify(saved)).not.toContain("secretsecret");
    expect((await api.updateSettings({ keys: { fal: "" } })).keys.fal).toBeUndefined();
    await expect(api.updateSettings({ preferredProvider: "nope" as never })).rejects.toMatchObject({ status: 400 });
    await expect(api.updateSettings({ keys: { nope: "x" } as never })).rejects.toMatchObject({ status: 400 });
  });

  it("stores MP4, MOV and WebM reference videos and refuses anything else", async () => {
    expect((await api.uploadVideo(new Blob([MP4]))).media).toMatchObject({ mime: "video/mp4", bytes: MP4.length });
    const mov = Uint8Array.from([0, 0, 0, 20, ...[..."ftypqt  "].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
    expect((await api.uploadVideo(new Blob([mov]))).media.id).toMatch(/\.mov$/);
    expect((await api.uploadVideo(new Blob([Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2])]))).media.mime).toBe("video/webm");
    await expect(api.uploadVideo(new Blob([PNG_2X2]))).rejects.toMatchObject({ status: 400 });
    await expect(api.uploadVideo(new Blob([]))).rejects.toMatchObject({ status: 400 });
  });
});
