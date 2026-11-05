/** fal request builders, provider choice, and the client's guards. */
import { describe, expect, it, vi } from "vitest";
import { findImageModel, findVideoModel } from "@shared/models";
import type { ImageModel, VideoModel } from "@shared/types";
import { ApiClientError } from "../errors";
import * as fal from "../fal";
import { buildFalImagePayload, buildFalVideoPayload } from "../fal-payloads";
import { chooseProvider, modelProviders, providerNotice } from "../providers";

const image = (id: string): ImageModel => {
  const m = findImageModel(id);
  if (!m) throw new Error(`catalog has no ${id}`);
  return m;
};
const video = (id: string): VideoModel => {
  const m = findVideoModel(id);
  if (!m) throw new Error(`catalog has no ${id}`);
  return m;
};

describe("provider choice", () => {
  const both = { openrouter: true, fal: true };
  it("lists who serves a model", () => {
    expect(modelProviders(image("krea/krea-2-large"))).toEqual(["openrouter"]);
    expect(modelProviders(image("google/gemini-3-pro-image"))).toEqual(["openrouter", "fal", "kie", "apimart", "revana"]);
    expect(modelProviders(video("fal/kling-v3-pro-motion-control"))).toEqual(["fal"]);
    expect(modelProviders(video("fal/vidu-q4"))).toEqual(["fal", "kie", "apimart", "revana"]);
    expect(modelProviders(video("kwaivgi/kling-video-o1"))).toEqual(["openrouter", "apimart", "revana"]);
    expect(modelProviders(image("openai/gpt-image-2.6-flare"))).toEqual(["openrouter", "fal", "apimart"]);
  });

  it("before prices: the first provider of the model with a key", () => {
    const shared = video("kwaivgi/kling-v3.0-pro");
    expect(chooseProvider(shared, both).provider).toBe("openrouter");
    expect(chooseProvider(shared, { openrouter: false, fal: true }).provider).toBe("fal");
    expect(chooseProvider(video("fal/vidu-q4"), both).provider).toBe("fal");
  });

  it("explains which key is missing", () => {
    const motion = video("fal/kling-v3-pro-motion-control");
    expect(providerNotice(motion, { openrouter: true, fal: false })).toBe("Kling 3.0 Motion Control runs on fal. Add a fal key in Settings to use it.");
    expect(providerNotice(image("krea/krea-2-large"), { openrouter: false, fal: true })).toBe("Krea 2 Large runs on OpenRouter. Add an OpenRouter key in Settings to use it.");
    expect(providerNotice(video("kwaivgi/kling-v3.0-pro"), { openrouter: false, fal: false })).toBe("Kling 3.0 Pro needs an OpenRouter, fal, kie.ai or APIMart key. Add one in Settings to use it.");
    expect(providerNotice(video("fal/vidu-q4"), { openrouter: true })).toBe("Vidu Q4 needs a fal, kie.ai, APIMart or Revana key. Add one in Settings to use it.");
    expect(chooseProvider(video("fal/vidu-q4"), { kie: true }).provider).toBe("kie");
    expect(providerNotice(motion, both)).toBeUndefined();
  });
});

describe("buildFalImagePayload", () => {
  it("maps aspect ratio and size onto each model's fields", () => {
    expect(buildFalImagePayload(image("google/gemini-3-pro-image"), { prompt: "p", aspectRatio: "16:9", size: "2K" }, [])).toEqual({
      endpoint: "fal-ai/nano-banana-pro",
      input: { prompt: "p", aspect_ratio: "16:9", resolution: "2K" },
    });
    expect(buildFalImagePayload(image("fal/z-image-turbo"), { prompt: "p", aspectRatio: "9:16", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: "portrait_16_9" });
    expect(buildFalImagePayload(image("openai/gpt-image-2"), { prompt: "p", aspectRatio: "2:3", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: { width: 832, height: 1216 } });
    expect(buildFalImagePayload(image("fal/gpt-image-1.5"), { prompt: "p", aspectRatio: "3:2", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: "1536x1024" });
    expect(buildFalImagePayload(image("fal/flux-dev"), { prompt: "p", aspectRatio: "auto", size: "1K" }, []).input).toEqual({ prompt: "p" });
  });

  it("switches to the edit endpoint with references, as a list or a single url", () => {
    expect(buildFalImagePayload(image("google/gemini-3-pro-image"), { prompt: "p", aspectRatio: "auto", size: "1K" }, ["data:a", "data:b"])).toEqual({
      endpoint: "fal-ai/nano-banana-pro/edit",
      input: { prompt: "p", image_urls: ["data:a", "data:b"], resolution: "1K" },
    });
    expect(buildFalImagePayload(image("fal/flux-kontext-pro"), { prompt: "p", aspectRatio: "auto", size: "1K" }, ["data:a"])).toEqual({
      endpoint: "fal-ai/flux-pro/kontext",
      input: { prompt: "p", image_url: "data:a" },
    });
    expect(() => buildFalImagePayload(image("fal/qwen-image-edit-2511"), { prompt: "p", aspectRatio: "auto", size: "1K" }, [])).toThrow("needs at least one reference image");
    expect(() => buildFalImagePayload(image("fal/flux-dev"), { prompt: "p", aspectRatio: "auto", size: "1K" }, ["data:a"])).toThrow("does not take reference images");
  });

  it("GPT Image 2.6 Flare: a preset or an explicit size, references as `image_urls` on the edit endpoint", () => {
    const flare = image("openai/gpt-image-2.6-flare");
    expect(buildFalImagePayload(flare, { prompt: "p", aspectRatio: "16:9", size: "1K" }, [])).toEqual({
      endpoint: "openai/gpt-image-2.6/flare/text-to-image",
      input: { prompt: "p", image_size: "landscape_16_9" },
    });
    expect(buildFalImagePayload(flare, { prompt: "p", aspectRatio: "21:9", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: { width: 1536, height: 640 } });
    expect(buildFalImagePayload(flare, { prompt: "p", aspectRatio: "auto", size: "1K" }, ["data:a", "data:b"])).toEqual({
      endpoint: "openai/gpt-image-2.6/flare/edit",
      input: { prompt: "p", image_urls: ["data:a", "data:b"] },
    });
  });
});

describe("buildFalVideoPayload", () => {
  it("Kling 3.0 on fal: start_image_url, string durations, aspect ratio only without a frame", () => {
    const kling = video("kwaivgi/kling-v3.0-pro");
    expect(buildFalVideoPayload(kling, { prompt: "p", duration: 7.4, aspectRatio: "9:16", audio: false }, {})).toEqual({
      endpoint: "fal-ai/kling-video/v3/pro/text-to-video",
      input: { prompt: "p", duration: "7", aspect_ratio: "9:16", generate_audio: false },
      params: { duration: 7, aspectRatio: "9:16", audio: false },
    });
    expect(buildFalVideoPayload(kling, { prompt: "p", duration: 5, aspectRatio: "9:16" }, { firstFrame: "data:f", lastFrame: "data:l" })).toEqual({
      endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
      input: { prompt: "p", duration: "5", start_image_url: "data:f", end_image_url: "data:l" },
      params: { duration: 5 },
    });
  });

  it("Seedance 2.5: the /us endpoints, string durations, aspect ratio only without a frame", () => {
    const seedance = video("bytedance/seedance-2.5");
    expect(buildFalVideoPayload(seedance, { prompt: "p", duration: 12, aspectRatio: "21:9", resolution: "480p", audio: false }, {})).toEqual({
      endpoint: "bytedance/seedance-2.5/us/text-to-video",
      input: { prompt: "p", duration: "12", aspect_ratio: "21:9", resolution: "480p", generate_audio: false },
      params: { duration: 12, aspectRatio: "21:9", resolution: "480p", audio: false },
    });
    expect(buildFalVideoPayload(seedance, { prompt: "p", duration: 5, aspectRatio: "9:16" }, { firstFrame: "data:f", lastFrame: "data:l" })).toEqual({
      endpoint: "bytedance/seedance-2.5/us/image-to-video",
      input: { prompt: "p", duration: "5", image_url: "data:f", end_image_url: "data:l", resolution: "720p" },
      params: { duration: 5, resolution: "720p" },
    });
  });

  it("maps resolutions and fixed fields (H3 Max), seconds suffixes (Luma) and 4K spellings (Gemini)", () => {
    expect(buildFalVideoPayload(video("minimax/hailuo-3-max"), { prompt: "p", duration: 6, resolution: "480p", aspectRatio: "21:9" }, {}).input).toEqual({
      prompt: "p", prompt_expansion_mode: "balanced", duration: 6, aspect_ratio: "21:9", resolution: "480P",
    });
    expect(buildFalVideoPayload(video("fal/luma-ray-3.2"), { prompt: "p", duration: 9, resolution: "1080p", aspectRatio: "1:1" }, {}).input).toEqual({
      prompt: "p", duration: "10s", aspect_ratio: "1:1", resolution: "1080p",
    });
    expect(buildFalVideoPayload(video("fal/gemini-omni-flash-1.1"), { prompt: "p", duration: 8, resolution: "4K", aspectRatio: "16:9" }, { firstFrame: "data:f" }).input).toEqual({
      prompt: "p", duration: 8, image_url: "data:f", aspect_ratio: "16:9", resolution: "4k",
    });
    expect(() => buildFalVideoPayload(video("fal/vidu-q4"), { prompt: "p", duration: 5 }, {})).toThrow("needs a first frame");
  });

  it("FLUX.3 Max: resolution and audio; aspect ratio only without a frame; the last frame beside the first", () => {
    const max = video("fal/flux-3-max");
    expect(buildFalVideoPayload(max, { prompt: "p", duration: 14, aspectRatio: "21:9", resolution: "1080p", audio: false }, {})).toEqual({
      endpoint: "blackforestlabs/flux-3-max/text-to-video",
      input: { prompt: "p", duration: 14, aspect_ratio: "21:9", resolution: "1080p", generate_audio: false },
      params: { duration: 14, aspectRatio: "21:9", resolution: "1080p", audio: false },
    });
    expect(buildFalVideoPayload(max, { prompt: "p", duration: 3, aspectRatio: "9:16" }, { firstFrame: "data:f", lastFrame: "data:l" })).toEqual({
      endpoint: "blackforestlabs/flux-3-max/image-to-video",
      input: { prompt: "p", duration: 5, image_url: "data:f", end_image_url: "data:l", resolution: "720p" },
      params: { duration: 5, resolution: "720p" },
    });
  });

  it("Kling 4.0: whole seconds, 720p or 1080p, no sound field; aspect ratio only without a frame", () => {
    const kling = video("fal/kling-v4");
    expect(buildFalVideoPayload(kling, { prompt: "p", duration: 30, aspectRatio: "21:9", resolution: "1080p", audio: true }, {})).toEqual({
      endpoint: "kling/v4/text-to-video",
      input: { prompt: "p", duration: 30, aspect_ratio: "21:9", resolution: "1080p" },
      params: { duration: 30, aspectRatio: "21:9", resolution: "1080p" },
    });
    expect(buildFalVideoPayload(kling, { prompt: "p", duration: 2, aspectRatio: "9:16" }, { firstFrame: "data:f", lastFrame: "data:l" })).toEqual({
      endpoint: "kling/v4/image-to-video",
      input: { prompt: "p", duration: 3, start_image_url: "data:f", end_image_url: "data:l", resolution: "720p" },
      params: { duration: 3, resolution: "720p" },
    });
  });

  it("FLUX.3 Video Draft: one endpoint per job, both frames to the first-last-frame one", () => {
    const draft = video("fal/flux-3-video-draft");
    expect(buildFalVideoPayload(draft, { prompt: "p", duration: 12, aspectRatio: "21:9", resolution: "720p", audio: true }, {})).toEqual({
      endpoint: "blackforestlabs/flux-3/text-to-video/draft",
      input: { prompt: "p", duration: 12, aspect_ratio: "21:9", generate_audio: true },
      params: { duration: 12, aspectRatio: "21:9", audio: true },
    });
    expect(buildFalVideoPayload(draft, { prompt: "p", duration: 5, aspectRatio: "9:16" }, { firstFrame: "data:f" })).toEqual({
      endpoint: "blackforestlabs/flux-3/image-to-video/draft",
      input: { prompt: "p", duration: 5, image_url: "data:f" },
      params: { duration: 5 },
    });
    expect(buildFalVideoPayload(draft, { prompt: "p", duration: 30, audio: false }, { firstFrame: "data:f", lastFrame: "data:l" })).toEqual({
      endpoint: "blackforestlabs/flux-3/first-last-frame-to-video/draft",
      input: { prompt: "p", duration: 20, start_image_url: "data:f", end_image_url: "data:l", generate_audio: false },
      params: { duration: 20, audio: false },
    });
    expect(() => buildFalVideoPayload(draft, { prompt: "p", duration: 5 }, { lastFrame: "data:l" })).toThrow("needs a first frame with the last frame");
  });

  it("motion control: character image, reference video, orientation; the prompt is optional", () => {
    const motion = video("fal/kling-v3-pro-motion-control");
    expect(buildFalVideoPayload(motion, { prompt: " ", duration: 5 }, { firstFrame: "data:c", motionVideo: "https://cdn/ref.mp4" })).toEqual({
      endpoint: "fal-ai/kling-video/v3/pro/motion-control",
      input: { image_url: "data:c", video_url: "https://cdn/ref.mp4", character_orientation: "video" },
      params: { duration: 0, orientation: "video" },
    });
    expect(buildFalVideoPayload(motion, { prompt: "dance", duration: 5, orientation: "image" }, { firstFrame: "data:c", motionVideo: "u" }).input).toMatchObject({ prompt: "dance", character_orientation: "image" });
    expect(() => buildFalVideoPayload(motion, { prompt: "", duration: 5 }, { firstFrame: "data:c" })).toThrow("needs a character image and a reference video");
  });

  it("video editing: the prompt, the video and the resolution the route spells; no duration, aspect ratio or audio", () => {
    const gemini = video("fal/gemini-omni-flash-1.1-edit");
    expect(buildFalVideoPayload(gemini, { prompt: " make it snow ", duration: 5, aspectRatio: "9:16", resolution: "4K", audio: true }, { sourceVideo: "https://cdn/in.mp4" })).toEqual({
      endpoint: "google/gemini-omni-flash/v1.1/edit",
      input: { prompt: "make it snow", video_url: "https://cdn/in.mp4", resolution: "4k" },
      params: { duration: 0, resolution: "4K" },
    });
    // No resolution list (Kling keeps the source's) or no fal spelling for it (FLUX): none sent.
    expect(buildFalVideoPayload(video("fal/kling-o3-edit"), { prompt: "p", duration: 5, resolution: "1080p" }, { sourceVideo: "u" })).toEqual({
      endpoint: "fal-ai/kling-video/o3/pro/video-to-video/edit",
      input: { prompt: "p", video_url: "u" },
      params: { duration: 0 },
    });
    expect(buildFalVideoPayload(video("black-forest-labs/flux-video-edit"), { prompt: "p", duration: 5, resolution: "720p" }, { sourceVideo: "u" }).input).toEqual({ prompt: "p", video_url: "u" });
    expect(() => buildFalVideoPayload(gemini, { prompt: "p", duration: 5 }, { firstFrame: "data:c" })).toThrow("needs a video to edit");
  });
});

describe("fal client guards", () => {
  it("never sends the key off fal's API hosts", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fal.status("k", "https://evil.example/requests/1/status")).rejects.toBeInstanceOf(fal.FalOriginError);
    await expect(fal.result("k", "http://queue.fal.run/x/requests/1")).rejects.toBeInstanceOf(fal.FalOriginError);
    expect(fetch).not.toHaveBeenCalled();
    expect(fal.responseUrlFor("https://queue.fal.run/fal-ai/kling-video/requests/r1/status")).toBe("https://queue.fal.run/fal-ai/kling-video/requests/r1");
  });

  it("reads fal's error bodies", () => {
    expect(fal.falMessage({ detail: "Not enough credits" })).toBe("Not enough credits");
    expect(fal.falMessage({ detail: [{ loc: ["body", "video_url"], msg: "video too long" }] })).toBe("video_url: video too long");
    expect(fal.falMessage({ error: { type: "authorization_error", message: "API key authentication required" } })).toBe("API key authentication required");
  });

  it("maps 401 to a key error and keeps other statuses with fal's message", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ detail: "bad key" }), { status: 401 }));
    await expect(fal.testKey("k")).rejects.toMatchObject({ status: 401, error: fal.FAL_KEY_REJECTED });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ detail: [{ loc: ["body", "prompt"], msg: "too long" }] }), { status: 422 }));
    const err = await fal.run("k", "fal-ai/flux/dev", { prompt: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 422, error: "prompt: too long" });
  });
});
