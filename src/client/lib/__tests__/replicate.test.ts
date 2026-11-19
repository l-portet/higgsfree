/** Replicate: the request each model gets, what it refuses, its prices, when a run goes there, and where the key may go. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedDurations, findImageModel, findVideoModel, IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import { REPLICATE_MODELS, replicateKey } from "@shared/replicate-models";
import { isReplicateFileUrl, isReplicateModel } from "@shared/replicate-proxy";
import type { ImageModel, VideoModel } from "@shared/types";
import { quoteImage } from "../image-cost";
import { modelProviders } from "../providers";
import { assertReplicateOrigin, download, inlineImage, prediction, ReplicateDownloadBlockedError, replicateMessage, ReplicateOriginError, REPLICATE_NO_SERVER, submit, taskUrl, testKey } from "../replicate";
import { buildReplicateImagePayload, buildReplicateVideoPayload } from "../replicate-payloads";
import { estimateReplicateImageCost, estimateReplicateVideoCost } from "../replicate-pricing";
import { quoteVideo } from "../video-cost";

const video = (id: string): VideoModel => {
  const m = findVideoModel(id);
  if (!m) throw new Error(`catalog has no ${id}`);
  return m;
};
const image = (id: string): ImageModel => {
  const m = findImageModel(id);
  if (!m) throw new Error(`catalog has no ${id}`);
  return m;
};
const FRAME = "data:image/png;base64,AAAA";
const img = (id: string, req: Partial<{ prompt: string; aspectRatio: ImageModel["aspectRatios"][number]; size: ImageModel["sizes"][number] }> = {}, refs: string[] = []) =>
  buildReplicateImagePayload(image(id), { prompt: "a fox", aspectRatio: "auto", size: "1K", ...req }, refs);
const vid = (id: string, req: Partial<Parameters<typeof buildReplicateVideoPayload>[1]> = {}, media: Parameters<typeof buildReplicateVideoPayload>[2] = {}) =>
  buildReplicateVideoPayload(video(id), { prompt: "a fox runs", duration: 5, ...req }, media);

describe("routes", () => {
  it("every Replicate route names an official model in the bundled list, of the same kind", () => {
    const routed = [...IMAGE_MODELS, ...VIDEO_MODELS].filter((m) => m.replicate);
    expect(routed).toHaveLength(37);
    for (const m of routed) {
      const route = m.replicate;
      if (!route) continue;
      expect(isReplicateModel(route.model), m.id).toBe(true);
      expect(REPLICATE_MODELS[replicateKey(route)]?.kind, m.id).toBe(m.kind);
      expect(modelProviders(m)).toContain("replicate");
    }
    // And no entry is left without a model that routes to it.
    const used = new Set(routed.map((m) => (m.replicate ? replicateKey(m.replicate) : "")));
    expect(Object.keys(REPLICATE_MODELS).filter((k) => !used.has(k))).toEqual([]);
  });

  it("no video editor, upscaler or motion-control model is routed: Replicate gets no video from here", () => {
    for (const m of VIDEO_MODELS) {
      if (m.caps.videoEdit || m.caps.upscale || m.caps.motionControl) expect(m.replicate, m.id).toBeUndefined();
    }
  });

  it("every routed video model can run its default request, at a known price", () => {
    for (const m of VIDEO_MODELS) {
      if (!m.replicate) continue;
      const info = REPLICATE_MODELS[replicateKey(m.replicate)];
      const needsFrame = info?.kind === "video" && info.imageOnly;
      const req = { prompt: "p", duration: m.defaultDuration, resolution: m.defaultResolution, aspectRatio: "16:9" as const, firstFrame: needsFrame };
      // Models billed per clip, or with fixed lengths, may not make the catalog's default: any length they list will do.
      const durations = allowedDurations(m);
      const priced = durations.map((d) => estimateReplicateVideoCost(m, { ...req, duration: d })).filter((usd) => usd !== undefined);
      expect(priced.length, m.id).toBeGreaterThan(0);
      for (const usd of priced) expect(usd, m.id).toBeGreaterThan(0);
    }
  });

  it("every routed image model has a price for the request it takes", () => {
    for (const m of IMAGE_MODELS) {
      if (!m.replicate) continue;
      const info = REPLICATE_MODELS[replicateKey(m.replicate)];
      const withRefs = info?.kind === "image" && Boolean(info.needsRef);
      expect(estimateReplicateImageCost(m, { aspectRatio: "auto", size: "1K" }, 2, withRefs), m.id).toBeGreaterThan(0);
    }
  });
});

describe("image requests", () => {
  it("Nano Banana Pro: the prompt, references as a list, the size as `resolution`, the ratio when one is picked", () => {
    expect(img("google/gemini-3-pro-image", { size: "4K", aspectRatio: "16:9" }, [FRAME, FRAME])).toMatchObject({
      model: "google/nano-banana-pro",
      input: { prompt: "a fox", image_input: [FRAME, FRAME], resolution: "4K", aspect_ratio: "16:9" },
    });
    // `auto` leaves the ratio out: Replicate's default follows the input image.
    expect(img("google/gemini-3-pro-image").input).toEqual({ prompt: "a fox", resolution: "1K" });
  });

  it("GPT Image says `auto` itself; a model with one input image gets it alone, not a list", () => {
    expect(img("openai/gpt-image-2").input).toEqual({ prompt: "a fox", aspect_ratio: "auto" });
    expect(img("openai/gpt-image-2", { aspectRatio: "3:2" }, [FRAME]).input).toEqual({ prompt: "a fox", input_images: [FRAME], aspect_ratio: "3:2" });
    expect(img("fal/flux-kontext-pro", { aspectRatio: "21:9" }, [FRAME])).toMatchObject({ model: "black-forest-labs/flux-kontext-pro", input: { prompt: "a fox", input_image: FRAME, aspect_ratio: "21:9" } });
    // Never the fields that would spend someone else's money or change the result's type.
    expect(Object.keys(img("openai/gpt-image-2").input)).not.toContain("openai_api_key");
  });

  it("refuses what the model does not take, which sends the run elsewhere", () => {
    expect(() => img("fal/flux-schnell", {}, [FRAME])).toThrow("Takes no reference images");
    expect(() => img("fal/flux-kontext-pro", {}, [FRAME, FRAME])).toThrow("Takes up to 1 reference image");
    expect(() => img("fal/qwen-image-edit-2511")).toThrow("Needs a reference image");
    expect(() => img("fal/gpt-image-1.5", { aspectRatio: "16:9" })).toThrow("Takes no 16:9");
    expect(() => img("krea/krea-2-large", {}, [FRAME])).toThrow("Takes no reference images");
    expect(() => buildReplicateImagePayload(image("fal/z-image-turbo"), { prompt: "p", aspectRatio: "auto", size: "1K" }, [])).toThrow("is not available on Replicate");
  });

  it("Recraft Crisp Upscale takes the one image and nothing else", () => {
    expect(img("recraft/crisp-upscale", {}, [FRAME])).toMatchObject({ model: "recraft-ai/recraft-crisp-upscale", input: { image: FRAME } });
    expect(() => img("recraft/crisp-upscale")).toThrow("needs an image to upscale");
    expect(() => img("recraft/crisp-upscale", {}, [FRAME, FRAME])).toThrow("Takes one image to upscale");
  });
});

describe("video requests", () => {
  it("Seedance: its own field names, the ratio with a prompt, `adaptive` with a frame", () => {
    expect(vid("bytedance/seedance-2.0", { resolution: "4K", aspectRatio: "21:9", audio: false })).toMatchObject({
      model: "bytedance/seedance-2.0",
      input: { prompt: "a fox runs", duration: 5, resolution: "4k", aspect_ratio: "21:9", generate_audio: false },
      params: { duration: 5, resolution: "4K", aspectRatio: "21:9", audio: false },
    });
    const framed = vid("bytedance/seedance-2.5", { resolution: "720p", aspectRatio: "9:16" }, { firstFrame: FRAME, lastFrame: FRAME });
    expect(framed.input).toEqual({ prompt: "a fox runs", duration: 5, resolution: "720p", aspect_ratio: "adaptive", generate_audio: true, image: FRAME, last_frame_image: FRAME });
    expect(framed.params.aspectRatio).toBeUndefined();
    expect(vid("bytedance/seedance-2.0-fast", { resolution: "480p", aspectRatio: "1:1" }, { references: [FRAME, FRAME] }).input).toMatchObject({ reference_images: [FRAME, FRAME], aspect_ratio: "1:1" });
  });

  it("Kling 3.0: the tier is `mode`, Standard and Pro on one Replicate model", () => {
    expect(vid("kwaivgi/kling-v3.0-std", { aspectRatio: "9:16" }, {})).toMatchObject({ model: "kwaivgi/kling-v3-video", input: { mode: "standard", duration: 5, aspect_ratio: "9:16", generate_audio: true } });
    const pro = vid("kwaivgi/kling-v3.0-pro", { audio: false }, { firstFrame: FRAME, lastFrame: FRAME });
    expect(pro).toMatchObject({ model: "kwaivgi/kling-v3-video", input: { mode: "pro", start_image: FRAME, end_image: FRAME, generate_audio: false } });
    // A frame sets the shape: no ratio, and no `resolution` field at all (the mode is the resolution).
    expect(Object.keys(pro.input)).not.toContain("aspect_ratio");
    expect(Object.keys(pro.input)).not.toContain("resolution");
  });

  it("Veo 3.1 keeps the ratio with a frame, and takes references on 8 s clips only", () => {
    expect(vid("google/veo-3.1", { duration: 6, resolution: "1080p", aspectRatio: "9:16" }, { firstFrame: FRAME }).input).toEqual({
      prompt: "a fox runs", duration: 6, resolution: "1080p", aspect_ratio: "9:16", generate_audio: true, image: FRAME,
    });
    expect(vid("google/veo-3.1", { duration: 8, resolution: "720p" }, { references: [FRAME] }).input).toMatchObject({ reference_images: [FRAME], duration: 8 });
    expect(() => vid("google/veo-3.1", { duration: 6, resolution: "720p" }, { references: [FRAME] })).toThrow("Takes style references on 8 s clips only");
    expect(() => vid("google/veo-3.1", { duration: 8, resolution: "4K" })).toThrow("Takes no 4K");
    expect(() => vid("google/veo-3.1-fast", { duration: 8, resolution: "720p" }, { references: [FRAME] })).toThrow("Takes no style references");
  });

  it("FLUX.3 Video: frames in one list, the duration as a string, the draft as a flag", () => {
    expect(vid("black-forest-labs/flux-3-video", { duration: 7, resolution: "1080p" }, { firstFrame: FRAME, lastFrame: FRAME }).input).toEqual({
      prompt: "a fox runs", duration: "7", resolution: "1080p", generate_audio: true, images: [FRAME, FRAME],
    });
    expect(vid("fal/flux-3-video-draft", { duration: 5, aspectRatio: "16:9" })).toMatchObject({ model: "black-forest-labs/flux-3", input: { draft: true, duration: "5", resolution: "720p", aspect_ratio: "16:9" } });
    // HappyHorse 1.1's list holds the first frame only.
    expect(vid("alibaba/happyhorse-1.1", { resolution: "720p" }, { firstFrame: FRAME }).input).toMatchObject({ images: [FRAME] });
    expect(() => vid("alibaba/happyhorse-1.1", { resolution: "720p" }, { firstFrame: FRAME, lastFrame: FRAME })).toThrow("Takes no last frame");
  });

  it("spells each model's resolution and ratio its way", () => {
    expect(vid("minimax/hailuo-3", { resolution: "2K", aspectRatio: "4:3" }).input).toMatchObject({ resolution: "2K", ratio: "4:3" });
    expect(vid("minimax/hailuo-3", { resolution: "2K" }, { firstFrame: FRAME, lastFrame: FRAME }).input).toMatchObject({ first_frame_image: FRAME, last_frame_image: FRAME, ratio: "adaptive" });
    expect(vid("fal/pixverse-v6", { duration: 8, resolution: "1080p", audio: true }).input).toMatchObject({ quality: "1080p", generate_audio_switch: true, duration: 8 });
    expect(vid("google/gemini-omni-flash-1.2", { duration: 10, resolution: "4K", aspectRatio: "9:16" }, { firstFrame: FRAME, lastFrame: FRAME }).input).toMatchObject({ resolution: "4k", aspect_ratio: "9:16", last_frame: FRAME });
    // Models with no resolution field are sent none.
    expect(Object.keys(vid("runway/gen-4.5", { duration: 10, aspectRatio: "21:9" }).input).sort()).toEqual(["aspect_ratio", "duration", "prompt"]);
  });

  it("refuses what Replicate cannot take from a browser: any video, reference audio", () => {
    expect(() => vid("bytedance/seedance-2.5", { resolution: "720p" }, { referenceVideos: ["https://v"] })).toThrow("Takes no video from here");
    expect(() => vid("bytedance/seedance-2.5", { resolution: "720p" }, { referenceAudios: ["https://a"] })).toThrow("Takes no reference video or audio");
    expect(() => vid("fal/kling-v4", { resolution: "720p" }, { sourceVideo: "https://v" })).toThrow("Takes no video from here");
    expect(() => buildReplicateVideoPayload(video("fal/wan-2.7-edit"), { prompt: "p", duration: 5 }, { sourceVideo: "https://v" })).toThrow("is not available on Replicate");
  });

  it("refuses the lengths, frames and ratios a model does not make", () => {
    expect(() => vid("fal/pixverse-v6", { duration: 7, resolution: "720p" })).toThrow("Takes clips of 5, 8, 10 or 15 s");
    expect(() => vid("runway/gen-4.5", { duration: 7 })).toThrow("Takes clips of 5 or 10 s");
    expect(() => vid("google/gemini-omni-flash-1.2", { duration: 12, resolution: "720p" }, { firstFrame: FRAME, lastFrame: FRAME })).toThrow("up to 10 s between two frames");
    expect(() => vid("x-ai/grok-imagine-video-1.5", { resolution: "720p" })).toThrow("Needs a first frame");
    expect(() => vid("x-ai/grok-imagine-video-1.5", { resolution: "1080p" }, { firstFrame: FRAME })).toThrow("Takes no 1080p");
    expect(() => vid("alibaba/wan-3.0", { resolution: "720p" }, { firstFrame: FRAME, lastFrame: FRAME })).toThrow("Takes no last frame");
    expect(() => vid("alibaba/wan-3.0", { resolution: "720p" }, { references: [FRAME] })).toThrow("Takes no style references");
    expect(() => vid("bytedance/seedance-2.0", { resolution: "720p" }, { lastFrame: FRAME })).toThrow("Needs a first frame with the last frame");
    expect(() => vid("bytedance/seedance-2.0", { resolution: "720p" }, { firstFrame: FRAME, references: [FRAME] })).toThrow("frames or style references, not both");
    expect(() => vid("fal/kling-v4", { resolution: "720p", aspectRatio: "4:3" })).toThrow("Takes no 4:3");
    expect(() => vid("bytedance/seedance-2.0", { prompt: "  ", resolution: "720p" }, { firstFrame: FRAME })).toThrow("Needs a prompt");
    // Hailuo 2.3 is sold per clip: 10 s exists at 768p only, and the catalog lists it at 1080p.
    expect(() => vid("minimax/hailuo-2.3", { duration: 10, resolution: "1080p" })).toThrow("Takes no 10 s clip at 1080p");
  });
});

describe("prices", () => {
  it("per second by resolution, dearer with sound where Replicate says so, per clip for Hailuo 2.3", () => {
    expect(estimateReplicateVideoCost(video("bytedance/seedance-2.5"), { prompt: "p", duration: 5, resolution: "720p" })).toBeCloseTo(1.156, 3);
    expect(estimateReplicateVideoCost(video("bytedance/seedance-2.0"), { prompt: "p", duration: 10, resolution: "1080p" })).toBeCloseTo(4.5);
    expect(estimateReplicateVideoCost(video("google/veo-3.1"), { prompt: "p", duration: 8, resolution: "1080p", audio: true })).toBeCloseTo(3.2);
    expect(estimateReplicateVideoCost(video("google/veo-3.1"), { prompt: "p", duration: 8, resolution: "1080p", audio: false })).toBeCloseTo(1.6);
    expect(estimateReplicateVideoCost(video("kwaivgi/kling-v3.0-std"), { prompt: "p", duration: 5, audio: false })).toBeCloseTo(0.84);
    expect(estimateReplicateVideoCost(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 5, audio: true })).toBeCloseTo(1.68);
    expect(estimateReplicateVideoCost(video("fal/pixverse-v6"), { prompt: "p", duration: 5, resolution: "720p", audio: true })).toBeCloseTo(0.6);
    expect(estimateReplicateVideoCost(video("runway/gen-4.5"), { prompt: "p", duration: 10 })).toBeCloseTo(1.2);
    expect(estimateReplicateVideoCost(video("minimax/hailuo-2.3"), { prompt: "p", duration: 6, resolution: "1080p" })).toBeCloseTo(0.49);
    // No price for what it refuses; an unknown prompt is priced as if there were one.
    expect(estimateReplicateVideoCost(video("minimax/hailuo-2.3"), { prompt: "p", duration: 10, resolution: "1080p" })).toBeUndefined();
    expect(estimateReplicateVideoCost(video("alibaba/wan-3.0"), { duration: 5, resolution: "480p" })).toBeCloseTo(0.175);
    expect(estimateReplicateVideoCost(video("alibaba/wan-3.0"), { prompt: "", duration: 5, resolution: "480p" })).toBeUndefined();
  });

  it("per image, by size where the model has sizes", () => {
    expect(estimateReplicateImageCost(image("google/gemini-3-pro-image"), { aspectRatio: "auto", size: "4K" }, 2, false)).toBeCloseTo(0.6);
    expect(estimateReplicateImageCost(image("google/gemini-3.1-flash-image"), { aspectRatio: "1:1", size: "2K" }, 1, true)).toBeCloseTo(0.101);
    expect(estimateReplicateImageCost(image("fal/flux-schnell"), { aspectRatio: "16:9", size: "1K" }, 4, false)).toBeCloseTo(0.012);
    expect(estimateReplicateImageCost(image("recraft/crisp-upscale"), { aspectRatio: "auto", size: "1K" }, 1, true)).toBeCloseTo(0.006);
    expect(estimateReplicateImageCost(image("fal/flux-schnell"), { aspectRatio: "16:9", size: "1K" }, 1, true)).toBeUndefined();
  });
});

describe("routing", () => {
  it("a run goes to Replicate when it is the only provider with a key, or the cheapest of those with one", () => {
    const m = video("runway/gen-4.5");
    const q = quoteVideo(m, { prompt: "p", duration: 10, aspectRatio: "16:9" }, { replicate: true });
    expect(q).toMatchObject({ provider: "replicate", reason: "one-ready" });
    expect(q.quotes.find((x) => x.provider === "replicate")?.usd).toBeCloseTo(1.2);
    // Krea 2 Medium: $0.03 an image on Replicate, $0.04 on OpenRouter.
    expect(quoteImage(image("krea/krea-2-medium"), { aspectRatio: "1:1", size: "1K", count: 1, references: 0 }, { openrouter: true, replicate: true })).toMatchObject({ provider: "replicate", reason: "cheaper" });
    // FLUX.1 [schnell]: $0.003 on both, so fal keeps it (the first in the catalog's order).
    expect(quoteImage(image("fal/flux-schnell"), { aspectRatio: "1:1", size: "1K", count: 1, references: 0 }, { fal: true, replicate: true })).toMatchObject({ provider: "fal", reason: "tie" });
    // GPT Image 2.6 is billed by token everywhere else: its $0.25 route on Replicate is left out, or it would take every run.
    expect(image("openai/gpt-image-2.6-flare").replicate).toBeUndefined();
    expect(image("openai/gpt-image-2.6-sunburst").replicate).toBeUndefined();
  });

  it("a request Replicate refuses is quoted with the reason and goes elsewhere", () => {
    // Veo 3.1 at 4K: kie.ai renders it, Replicate's Veo stops at 1080p.
    const q = quoteVideo(video("google/veo-3.1"), { prompt: "p", duration: 8, resolution: "4K", aspectRatio: "16:9" }, { replicate: true, kie: true });
    expect(q.quotes.find((x) => x.provider === "replicate")).toMatchObject({ refusal: "Takes no 4K", noKey: false });
    expect(q.quotes.find((x) => x.provider === "kie")?.refusal).toBeUndefined();
    expect(q.provider).toBe("kie");
    const media = quoteVideo(video("bytedance/seedance-2.5"), { prompt: "p", duration: 5, resolution: "720p", referenceVideos: true, referenceVideoSec: 4 }, { replicate: true });
    expect(media.quotes.find((x) => x.provider === "replicate")).toMatchObject({ refusal: "Takes no video from here" });
    expect(media.provider).toBeUndefined();
  });
});

describe("client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("only ever calls the pass-through on this origin", () => {
    expect(assertReplicateOrigin("/api/replicate/v1/account")).toBe("/api/replicate/v1/account");
    for (const url of ["https://api.replicate.com/v1/account", "https://evil.example/api/replicate/v1/account", "/api/bytedance/v3/x", "/api/replicate/v2/account", "//evil.example/api/replicate/v1/account"]) {
      expect(() => assertReplicateOrigin(url), url).toThrow(ReplicateOriginError);
    }
    expect(taskUrl("gm3qorzdhgbfurvjtvhg6dckhu")).toBe("/api/replicate/v1/predictions/gm3qorzdhgbfurvjtvhg6dckhu");
    expect(() => taskUrl("abc/../../account")).toThrow(/does not recognise/);
  });

  it("refuses a model name or a request the pass-through would not take, before sending anything", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    await expect(submit("r8_x", "../account", {})).rejects.toMatchObject({ status: 400 });
    await expect(submit("r8_x", "google/veo-3.1", { image: `data:image/png;base64,${"A".repeat(4 * 1024 * 1024)}` })).rejects.toMatchObject({ status: 413, error: expect.stringContaining("4 MB") });
    expect(fetched).not.toHaveBeenCalled();
  });

  it("reads Replicate's errors, and says when this copy of the app has no server", async () => {
    expect(replicateMessage({ title: "Input validation failed", detail: "- input.duration: must be 5 or 10", status: 422 })).toBe("- input.duration: must be 5 or 10");
    expect(replicateMessage({ title: "Unauthenticated" })).toBe("Unauthenticated");
    expect(replicateMessage("<html>")).toBeUndefined();

    const answer = (status: number, body: string, type = "application/json") => vi.stubGlobal("fetch", async () => new Response(body, { status, headers: { "content-type": type } }));
    answer(404, "<!doctype html><title>404</title>", "text/html");
    await expect(testKey("r8_x")).rejects.toMatchObject({ status: 501, error: REPLICATE_NO_SERVER });
    answer(401, JSON.stringify({ title: "Unauthenticated", detail: "You did not pass a valid authentication token", status: 401 }));
    await expect(testKey("r8_x")).rejects.toMatchObject({ status: 401, error: "Replicate rejected the API token" });
    answer(402, JSON.stringify({ title: "Insufficient credit", detail: "You have insufficient credit to run this model.", status: 402 }));
    await expect(submit("r8_x", "google/veo-3.1", { prompt: "p" })).rejects.toMatchObject({ status: 402, error: expect.stringContaining("Not enough Replicate credit") });
    answer(422, JSON.stringify({ title: "Input validation failed", detail: "- input.duration: must be one of 4, 6, 8", status: 422 }));
    await expect(submit("r8_x", "google/veo-3.1", { prompt: "p" })).rejects.toMatchObject({ status: 400, error: "- input.duration: must be one of 4, 6, 8" });
    answer(429, JSON.stringify({ detail: "Request was throttled. Your rate limit resets in ~30s." }));
    await expect(submit("r8_x", "google/veo-3.1", { prompt: "p" })).rejects.toMatchObject({ status: 429, error: expect.stringContaining("throttled") });
  });

  it("reads a prediction's files whether the model answers with one url, a list or an object", async () => {
    const answer = (body: unknown) => vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    const url = "/api/replicate/v1/predictions/gm3qorzdhgbfurvjtvhg6dckhu";
    answer({ status: "succeeded", output: "https://replicate.delivery/a/out.mp4" });
    expect(await prediction("k", url)).toEqual({ status: "succeeded", urls: ["https://replicate.delivery/a/out.mp4"] });
    answer({ status: "succeeded", output: ["https://replicate.delivery/a/0.png", "https://replicate.delivery/a/1.png", null] });
    expect((await prediction("k", url)).urls).toEqual(["https://replicate.delivery/a/0.png", "https://replicate.delivery/a/1.png"]);
    answer({ status: "succeeded", output: { video: "https://replicate.delivery/a/out.mp4", seed: 4 } });
    expect((await prediction("k", url)).urls).toEqual(["https://replicate.delivery/a/out.mp4"]);
    // Files that are there before the run is over are not taken yet.
    answer({ status: "processing", output: ["https://replicate.delivery/a/0.png"] });
    expect(await prediction("k", url)).toEqual({ status: "processing", urls: [] });
    answer({ status: "failed", error: "NSFW content detected" });
    expect(await prediction("k", url)).toEqual({ status: "failed", urls: [], error: "NSFW content detected" });
    answer({ status: "canceled" });
    expect((await prediction("k", url)).error).toBe("Replicate cancelled the prediction");
    answer({ status: "aborted" });
    expect((await prediction("k", url)).error).toBe("Replicate dropped the prediction before it started");
  });

  it("downloads from Replicate's CDN only, without the key", async () => {
    expect(isReplicateFileUrl("https://replicate.delivery/xezq/a/out.mp4")).toBe(true);
    expect(isReplicateFileUrl("https://tjzk.replicate.delivery/a/out.png")).toBe(true);
    for (const url of ["http://replicate.delivery/a.mp4", "https://replicate.delivery.evil.example/a.mp4", "https://evilreplicate.delivery/a.mp4", "https://replicate.delivery:8443/a.mp4", "https://user:pw@replicate.delivery/a.mp4", "https://api.replicate.com/v1/files/abc", "not a url"]) {
      expect(isReplicateFileUrl(url), url).toBe(false);
    }
    const fetched = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(new Blob(["video"]), { status: 200 }));
    vi.stubGlobal("fetch", fetched);
    expect((await download("https://replicate.delivery/xezq/a/out.mp4")).size).toBe(5);
    expect(new Headers(fetched.mock.calls[0]?.[1]?.headers).get("authorization")).toBeNull();
    await expect(download("https://api.replicate.com/v1/files/abc")).rejects.toBeInstanceOf(ReplicateDownloadBlockedError);
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("sends an image as the data URI it is, and nothing that is not one", () => {
    expect(inlineImage(FRAME)).toBe(FRAME);
    expect(() => inlineImage("https://example.com/a.png")).toThrow("Not an image data URL");
    expect(() => inlineImage("data:text/html;base64,AAAA")).toThrow("Not an image data URL");
  });
});
