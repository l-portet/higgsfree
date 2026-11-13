/** kie.ai request builders and prices: each family's fields, what kie refuses, and what a run costs there. */
import { describe, expect, it } from "vitest";
import { KIE_PRICES } from "@shared/kie-prices";
import { findImageModel, findVideoModel, IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import type { ImageModel, VideoModel } from "@shared/types";
import { quoteImage } from "../image-cost";
import { resultUrls } from "../kie";
import { buildKieImagePayload, buildKieVideoPayload } from "../kie-payloads";
import { estimateKieImageCost, estimateKieVideoCost, kieVideoPayloadFor } from "../kie-pricing";

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

describe("buildKieVideoPayload", () => {
  it("Veo 3.1: the tier in `model`, both frames in `image_urls`, 4K spelled `4k`; sound off is refused", () => {
    expect(buildKieVideoPayload(video("google/veo-3.1-fast"), { prompt: "p", duration: 8, aspectRatio: "9:16", resolution: "4K" }, {})).toEqual({
      model: "veo-3-1",
      input: { prompt: "p", model: "veo3_fast", generation_type: "TEXT_2_VIDEO", duration: 8, resolution: "4k", aspect_ratio: "9:16" },
      priceKey: "veo-3-1#veo3_fast",
      params: { duration: 8, resolution: "4K", aspectRatio: "9:16", audio: true },
    });
    const frames = buildKieVideoPayload(video("google/veo-3.1"), { prompt: "p", duration: 6, aspectRatio: "16:9" }, { firstFrame: "https://a", lastFrame: "https://b" });
    expect(frames.input).toMatchObject({ generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO", image_urls: ["https://a", "https://b"], aspect_ratio: "Auto" });
    expect(() => buildKieVideoPayload(video("google/veo-3.1"), { prompt: "p", duration: 8, audio: false }, {})).toThrow("Always adds sound");
  });

  it("Kling 3.0: `mode` from the tier, a string duration, `sound`, and no multi-shot", () => {
    expect(buildKieVideoPayload(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 7, aspectRatio: "1:1", audio: false }, {})).toEqual({
      model: "kling-3.0/video",
      input: { prompt: "p", sound: false, duration: "7", mode: "pro", multi_shots: false, aspect_ratio: "1:1" },
      priceKey: "kling-3.0/video#pro",
      params: { duration: 7, aspectRatio: "1:1", audio: false },
    });
    expect(buildKieVideoPayload(video("kwaivgi/kling-v3.0-std"), { prompt: "p", duration: 5 }, { firstFrame: "https://a" }).input).toMatchObject({ mode: "std", image_urls: ["https://a"] });
  });

  it("Kling 4.0: text-to-video and references on reference-to-video, frames on keyframe-to-video, no sound field", () => {
    const m = video("fal/kling-v4");
    expect(buildKieVideoPayload(m, { prompt: "p", duration: 30, aspectRatio: "21:9", resolution: "1080p" }, {})).toEqual({
      model: "kling-4.0/reference-to-video",
      input: { prompt: "p", duration: 30, resolution: "1080p", aspect_ratio: "21:9" },
      priceKey: "kling-4.0",
      params: { duration: 30, resolution: "1080p", aspectRatio: "21:9" },
    });
    expect(buildKieVideoPayload(m, { prompt: "p", duration: 5 }, { references: ["https://r"] })).toMatchObject({ model: "kling-4.0/reference-to-video", input: { resolution: "720p", image_urls: ["https://r"] } });
    const frames = buildKieVideoPayload(m, { prompt: "p", duration: 5, aspectRatio: "9:16" }, { firstFrame: "https://a", lastFrame: "https://b" });
    expect(frames).toMatchObject({ model: "kling-4.0/keyframe-to-video", input: { prompt: "p", duration: 5, resolution: "720p", first_frame_url: "https://a", last_frame_url: "https://b" } });
    expect(frames.input).not.toHaveProperty("aspect_ratio");
    expect(() => buildKieVideoPayload(m, { prompt: "p", duration: 5 }, { firstFrame: "https://a", references: ["https://r"] })).toThrow("not both");
    expect(() => buildKieVideoPayload(m, { prompt: "", duration: 5 }, { firstFrame: "https://a" })).toThrow("Needs a prompt");
  });

  it("PixVerse 6 Max: PixVerse 6's fields on its own models and prices, any prompt, a first frame only", () => {
    const m = video("pixverse/pixverse-v6-max");
    expect(buildKieVideoPayload(m, { prompt: "p", duration: 15, aspectRatio: "2:3", resolution: "1080p", audio: true }, {})).toEqual({
      model: "pixverse-v6-max/text-to-video",
      input: { prompt: "p", quality: "1080p", duration: 15, generate_audio_switch: true, aspect_ratio: "2:3" },
      priceKey: "pixverse-v6-max",
      params: { duration: 15, resolution: "1080p", aspectRatio: "2:3", audio: true },
    });
    const i2v = buildKieVideoPayload(m, { prompt: "a cat", duration: 5, aspectRatio: "16:9" }, { firstFrame: "https://a" });
    expect(i2v).toEqual({
      model: "pixverse-v6-max/image-to-video",
      input: { prompt: "a cat", quality: "720p", duration: 5, generate_audio_switch: false, image_urls: ["https://a"] },
      priceKey: "pixverse-v6-max",
      params: { duration: 5, resolution: "720p", audio: false },
    });
    expect(() => buildKieVideoPayload(m, { prompt: " ", duration: 5 }, { firstFrame: "https://a" })).toThrow("Needs a prompt");
    expect(() => buildKieVideoPayload(m, { prompt: "p", duration: 5 }, { firstFrame: "https://a", lastFrame: "https://b" })).toThrow("Takes no last frame");
    expect(buildKieVideoPayload(video("fal/pixverse-v6"), { prompt: "a cat", duration: 5 }, {}).priceKey).toBe("pixverse-v6");
  });

  it("Gemini Omni Flash 1.2: a number duration up to 15 s, 10 s between two frames, the ratio with a frame too, references as `image_urls`", () => {
    const m = video("google/gemini-omni-flash-1.2");
    expect(buildKieVideoPayload(m, { prompt: "p", duration: 15, aspectRatio: "9:16", resolution: "4K" }, {})).toEqual({
      model: "google/gemini-omni-flash-1-2",
      input: { prompt: "p", duration: 15, resolution: "4k", aspect_ratio: "9:16" },
      priceKey: "google/gemini-omni-flash-1-2",
      params: { duration: 15, resolution: "4K", aspectRatio: "9:16" },
    });
    expect(buildKieVideoPayload(m, { prompt: "p", duration: 15, aspectRatio: "9:16" }, { firstFrame: "https://a" }).input).toEqual({
      prompt: "p", duration: 15, resolution: "720p", aspect_ratio: "9:16", first_frame_url: "https://a",
    });
    expect(buildKieVideoPayload(m, { prompt: "p", duration: 10, aspectRatio: "16:9" }, { firstFrame: "https://a", lastFrame: "https://b" })).toEqual({
      model: "google/gemini-omni-flash-1-2",
      input: { prompt: "p", duration: 10, resolution: "720p", aspect_ratio: "16:9", first_frame_url: "https://a", last_frame_url: "https://b" },
      priceKey: "google/gemini-omni-flash-1-2",
      params: { duration: 10, resolution: "720p", aspectRatio: "16:9" },
    });
    expect(buildKieVideoPayload(m, { prompt: "p", duration: 3 }, { references: ["https://r", "https://s"] }).input).toEqual({
      prompt: "p", duration: 3, resolution: "720p", image_urls: ["https://r", "https://s"],
    });
    expect(() => buildKieVideoPayload(m, { prompt: "p", duration: 11 }, { firstFrame: "https://a", lastFrame: "https://b" })).toThrow("Takes clips of up to 10 s between two frames");
    expect(() => buildKieVideoPayload(m, { prompt: "p", duration: 5 }, { firstFrame: "https://a", references: ["https://r"] })).toThrow("not both");
    expect(() => buildKieVideoPayload(m, { prompt: " ", duration: 8 }, {})).toThrow("Needs a prompt");
  });

  it("Seedance: frames or references (not both), `adaptive` when no ratio is sent, and a 3-character prompt", () => {
    const m = video("bytedance/seedance-2.5");
    expect(buildKieVideoPayload(m, { prompt: "slow push in", duration: 12, resolution: "480p", audio: false }, { firstFrame: "https://a" })).toEqual({
      model: "bytedance/seedance-2-5",
      input: { prompt: "slow push in", generate_audio: false, resolution: "480p", duration: 12, aspect_ratio: "adaptive", first_frame_url: "https://a" },
      priceKey: "bytedance/seedance-2-5",
      params: { duration: 12, resolution: "480p", audio: false },
    });
    expect(buildKieVideoPayload(m, { prompt: "p p p", duration: 5 }, { references: ["https://r"] }).input).toMatchObject({ reference_image_urls: ["https://r"] });
    expect(() => buildKieVideoPayload(m, { prompt: "p p p", duration: 5 }, { firstFrame: "https://a", references: ["https://r"] })).toThrow("not both");
    expect(() => buildKieVideoPayload(m, { prompt: "", duration: 5 }, {})).toThrow("3 characters");
  });

  it("splits text- and image-to-video models, and keeps the ratio for text-to-video only", () => {
    const h3 = video("minimax/hailuo-3");
    expect(buildKieVideoPayload(h3, { prompt: "p", duration: 6, aspectRatio: "21:9" }, {})).toMatchObject({ model: "minimax-h3/text-to-video", input: { aspect_ratio: "21:9", resolution: "2K" } });
    const i2v = buildKieVideoPayload(h3, { prompt: "p", duration: 6, aspectRatio: "21:9" }, { firstFrame: "https://a" });
    expect(i2v).toMatchObject({ model: "minimax-h3/image-to-video", input: { first_frame_url: "https://a" } });
    expect(i2v.input).not.toHaveProperty("aspect_ratio");
    expect(buildKieVideoPayload(video("alibaba/wan-2.7"), { prompt: "p", duration: 5, aspectRatio: "4:3", resolution: "720p" }, {}).input).toMatchObject({ ratio: "4:3" });
    expect(buildKieVideoPayload(video("fal/pixverse-v6"), { prompt: "a cat", duration: 5, audio: true }, { firstFrame: "https://a" })).toMatchObject({
      model: "pixverse-v6/image-to-video",
      input: { image_urls: ["https://a"], quality: "720p", generate_audio_switch: true },
    });
  });

  it("refuses what the family cannot do, with the reason the price tooltip shows", () => {
    expect(() => buildKieVideoPayload(video("x-ai/grok-imagine-video"), { prompt: "p", duration: 5 }, {})).toThrow("Takes clips of 6–30 s");
    expect(() => buildKieVideoPayload(video("fal/gemini-omni-flash-1.1"), { prompt: "p", duration: 5 }, {})).toThrow("Takes clips of 4, 6, 8 or 10 s");
    expect(() => buildKieVideoPayload(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 5 }, { references: ["https://r"] })).toThrow("Takes no style references");
    expect(() => buildKieVideoPayload(video("google/veo-3.1"), { prompt: "p", duration: 8 }, { lastFrame: "https://b" })).toThrow("needs a first frame");
    expect(() => buildKieVideoPayload(video("fal/vidu-q4"), { prompt: "p", duration: 5 }, {})).toThrow("Needs a first frame");
  });

  it("reference videos and audio: Wan 3.0 and Seedance take both, Kling 4.0 videos only, never with frames", () => {
    const wan = video("alibaba/wan-3.0-prime");
    const media = { references: ["https://i"], referenceVideos: ["https://v"], referenceAudios: ["https://a"] };
    expect(buildKieVideoPayload(wan, { prompt: "Video1 sings Audio1", duration: 5 }, media)).toMatchObject({
      model: "wan/3-0-video-prime",
      input: { reference_image_urls: ["https://i"], reference_video_urls: ["https://v"], reference_audio_urls: ["https://a"] },
    });
    // Audio alone is fine on Wan 3.0; the reference videos and the clip run 30 s at most.
    expect(buildKieVideoPayload(wan, { prompt: "p", duration: 5 }, { referenceAudios: ["https://a"] }).input).toMatchObject({ reference_audio_urls: ["https://a"] });
    expect(() => buildKieVideoPayload(wan, { prompt: "p", duration: 20 }, { referenceVideos: ["https://v"], referenceVideoSec: 12 })).toThrow("18 s or shorter");
    expect(() => buildKieVideoPayload(wan, { prompt: "p", duration: 5 }, { firstFrame: "https://f", referenceAudios: ["https://a"] })).toThrow("not both");
    expect(() => buildKieVideoPayload(wan, { prompt: "p", duration: 5 }, { referenceVideos: Array(6).fill("https://v") })).toThrow("up to 5 reference videos");

    const seedance = video("bytedance/seedance-2.0");
    expect(buildKieVideoPayload(seedance, { prompt: "a fox", duration: 5 }, { referenceVideos: ["https://v"], referenceAudios: ["https://a"] }).input).toMatchObject({
      reference_video_urls: ["https://v"],
      reference_audio_urls: ["https://a"],
    });
    expect(() => buildKieVideoPayload(seedance, { prompt: "a fox", duration: 5 }, { referenceAudios: ["https://a"] })).toThrow("with a reference image or video");
    expect(() => buildKieVideoPayload(seedance, { prompt: "a fox", duration: 5 }, { referenceVideos: Array(4).fill("https://v") })).toThrow("up to 3");
    expect(buildKieVideoPayload(video("bytedance/seedance-2.5"), { prompt: "a fox", duration: 5 }, { referenceAudios: ["https://a"] }).input).toMatchObject({ reference_audio_urls: ["https://a"] });

    const kling = video("fal/kling-v4");
    expect(buildKieVideoPayload(kling, { prompt: "p", duration: 5 }, { referenceVideos: ["https://v"] })).toMatchObject({ model: "kling-4.0/reference-to-video", input: { video_urls: ["https://v"] } });
    expect(() => buildKieVideoPayload(kling, { prompt: "p", duration: 5 }, { referenceAudios: ["https://a"] })).toThrow("Takes no reference audio");
    expect(() => buildKieVideoPayload(video("alibaba/wan-2.7"), { prompt: "p", duration: 5 }, { referenceVideos: ["https://v"] })).toThrow("Takes no reference video");
  });

  it("prices a run with reference videos on the output plus their length, at the video-input rate", () => {
    // Seedance 2.0 720p: 25 credits a second with a video input, on 5 + 10 s.
    expect(estimateKieVideoCost(video("bytedance/seedance-2.0"), { prompt: "a fox", duration: 5, resolution: "720p", referenceVideos: true, referenceVideoSec: 10 })).toBeCloseTo(25 * 15 * 0.005);
    // Wan 3.0 keeps its rate: 16 credits a second at 720p.
    expect(estimateKieVideoCost(video("alibaba/wan-3.0"), { duration: 5, resolution: "720p", referenceVideos: true, referenceVideoSec: 4 })).toBeCloseTo(16 * 9 * 0.005);
    // Audio alone costs nothing extra; a reference video of unknown length leaves the run unpriced.
    expect(estimateKieVideoCost(video("alibaba/wan-3.0"), { duration: 5, resolution: "720p", referenceAudios: true })).toBeCloseTo(16 * 5 * 0.005);
    expect(estimateKieVideoCost(video("alibaba/wan-3.0"), { duration: 5, resolution: "720p", referenceVideos: true })).toBeUndefined();
  });

  it("video editing: the source video and the resolution, nothing else", () => {
    expect(buildKieVideoPayload(video("fal/wan-2.7-edit"), { prompt: "make it snow", duration: 5, resolution: "720p" }, { sourceVideo: "https://v" })).toEqual({
      model: "wan/2-7-videoedit",
      input: { prompt: "make it snow", video_url: "https://v", resolution: "720p" },
      priceKey: "wan/2-7-videoedit",
      params: { duration: 0, resolution: "720p" },
    });
  });
});

describe("buildKieImagePayload", () => {
  it("maps each family's fields and switches to the edit model with references", () => {
    expect(buildKieImagePayload(image("google/gemini-3-pro-image"), { prompt: "p", aspectRatio: "16:9", size: "4K" }, ["https://r"])).toEqual({
      model: "nano-banana-pro",
      input: { prompt: "p", aspect_ratio: "16:9", resolution: "4K", output_format: "png", image_input: ["https://r"] },
      priceKey: "nano-banana-pro",
    });
    expect(buildKieImagePayload(image("openai/gpt-image-2"), { prompt: "p", aspectRatio: "auto", size: "1K" }, ["https://r"])).toMatchObject({ model: "gpt-image-2-image-to-image", input: { input_urls: ["https://r"] } });
    expect(buildKieImagePayload(image("google/gemini-2.5-flash-image"), { prompt: "p", aspectRatio: "1:1", size: "1K" }, [])).toMatchObject({ model: "google/nano-banana" });
    expect(buildKieImagePayload(image("fal/z-image-turbo"), { prompt: "p", aspectRatio: "auto", size: "1K" }, []).input).toEqual({ prompt: "p", aspect_ratio: "1:1" });
    expect(() => buildKieImagePayload(image("fal/flux-kontext-pro"), { prompt: "p", aspectRatio: "3:2", size: "1K" }, [])).toThrow("Takes no 3:2");
  });

  it.each(["flare", "sunburst"])("GPT Image 2.6 %s: GPT Image 2's fields under its own model ids, 21:9 included", (tier) => {
    expect(buildKieImagePayload(image(`openai/gpt-image-2.6-${tier}`), { prompt: "p", aspectRatio: "21:9", size: "1K" }, [])).toEqual({
      model: `gpt-image-2-6/${tier}-text-to-image`,
      input: { prompt: "p", aspect_ratio: "21:9", resolution: "1K" },
      priceKey: `gpt-image-2-6/${tier}-text-to-image`,
    });
    expect(buildKieImagePayload(image(`openai/gpt-image-2.6-${tier}`), { prompt: "p", aspectRatio: "auto", size: "1K" }, ["https://r", "https://s"])).toEqual({
      model: `gpt-image-2-6/${tier}-image-to-image`,
      input: { prompt: "p", aspect_ratio: "auto", resolution: "1K", input_urls: ["https://r", "https://s"] },
      priceKey: `gpt-image-2-6/${tier}-text-to-image`,
    });
  });

  it("GPT Image 2.6 Economy: its own model ids, no `resolution` since it is 1K only, and kie's smaller set of ratios", () => {
    const m = image("openai/gpt-image-2.6-economy");
    expect(buildKieImagePayload(m, { prompt: "p", aspectRatio: "21:9", size: "1K" }, [])).toEqual({
      model: "gpt-image-2-6/economy-text-to-image",
      input: { prompt: "p", aspect_ratio: "21:9" },
      priceKey: "gpt-image-2-6/economy-text-to-image",
    });
    expect(buildKieImagePayload(m, { prompt: "p", aspectRatio: "auto", size: "1K" }, ["https://r", "https://s"])).toEqual({
      model: "gpt-image-2-6/economy-image-to-image",
      input: { prompt: "p", aspect_ratio: "auto", input_urls: ["https://r", "https://s"] },
      priceKey: "gpt-image-2-6/economy-text-to-image",
    });
    for (const aspectRatio of m.aspectRatios) expect(() => buildKieImagePayload(m, { prompt: "p", aspectRatio, size: "1K" }, [])).not.toThrow();
    expect(() => buildKieImagePayload(m, { prompt: "p", aspectRatio: "3:4", size: "1K" }, [])).toThrow("Takes no 3:4");
    expect(() => buildKieImagePayload(m, { prompt: "p", aspectRatio: "1:1", size: "1K" }, Array.from({ length: 17 }, () => "https://r"))).toThrow("Takes up to 16 reference images");
  });

  it("Seedream 5.5: `size` as the app's size, references as `image_urls` on the edit model, and `auto` on edits only", () => {
    const m = image("bytedance-seed/seedream-5-5");
    expect(buildKieImagePayload(m, { prompt: "a red fox", aspectRatio: "21:9", size: "2K" }, [])).toEqual({
      model: "seedream/5-5-text-to-image",
      input: { prompt: "a red fox", aspect_ratio: "21:9", size: "2K" },
      priceKey: "seedream/5-5-text-to-image",
    });
    expect(buildKieImagePayload(m, { prompt: "a red fox", aspectRatio: "auto", size: "1K" }, ["https://r", "https://s"])).toEqual({
      model: "seedream/5-5-image-to-image",
      input: { prompt: "a red fox", aspect_ratio: "auto", size: "1K", image_urls: ["https://r", "https://s"] },
      priceKey: "seedream/5-5-text-to-image",
    });
    // Text to image has no `auto`: 1:1 is sent for it.
    expect(buildKieImagePayload(m, { prompt: "a red fox", aspectRatio: "auto", size: "1K" }, []).input).toMatchObject({ aspect_ratio: "1:1" });
    // 4:5 and 5:4 are OpenRouter's and fal's only: kie.ai refuses them, so they run elsewhere.
    for (const aspectRatio of m.aspectRatios.filter((a) => a !== "4:5" && a !== "5:4")) for (const size of m.sizes) expect(() => buildKieImagePayload(m, { prompt: "p", aspectRatio, size }, [])).not.toThrow();
    expect(() => buildKieImagePayload(m, { prompt: "p", aspectRatio: "4:5", size: "1K" }, [])).toThrow("Takes no 4:5");
    expect(() => buildKieImagePayload(m, { prompt: "p", aspectRatio: "1:1", size: "1K" }, Array.from({ length: 11 }, () => "https://r"))).toThrow("Takes up to 10 reference images");
  });

  it("MiniMax H3 Image: `aspect_ratio` (`auto` kept) and `resolution`, references as `image_urls` on the edit model", () => {
    const m = image("minimax/minimax-h3-image");
    expect(buildKieImagePayload(m, { prompt: "a red fox", aspectRatio: "21:9", size: "4K" }, [])).toEqual({
      model: "minimax-h3/text-to-image",
      input: { prompt: "a red fox", aspect_ratio: "21:9", resolution: "4K" },
      priceKey: "minimax-h3/text-to-image",
    });
    expect(buildKieImagePayload(m, { prompt: "a red fox", aspectRatio: "auto", size: "1K" }, ["https://r", "https://s"])).toEqual({
      model: "minimax-h3/image-edit",
      input: { prompt: "a red fox", aspect_ratio: "auto", resolution: "1K", image_urls: ["https://r", "https://s"] },
      priceKey: "minimax-h3/text-to-image",
    });
    for (const aspectRatio of m.aspectRatios) for (const size of m.sizes) expect(() => buildKieImagePayload(m, { prompt: "p", aspectRatio, size }, [])).not.toThrow();
    expect(() => buildKieImagePayload(m, { prompt: "p", aspectRatio: "1:1", size: "1K" }, Array.from({ length: 17 }, () => "https://r"))).toThrow("Takes up to 16 reference images");
  });
});

describe("resultUrls", () => {
  it("reads every shape kie returns, as a string or parsed", () => {
    expect(resultUrls('{"resultUrls":["https://a.mp4"]}')).toEqual(["https://a.mp4"]);
    expect(resultUrls({ result_urls: ["https://b.png"] })).toEqual(["https://b.png"]);
    expect(resultUrls('{"data":{"result_urls":["https://c.mp4"]},"resultUrls":["https://d.mp4"]}')).toEqual(["https://c.mp4"]);
    expect(resultUrls("not json")).toEqual([]);
  });
});

describe("kie prices", () => {
  it("price every route at its defaults, and nothing else", () => {
    // kie bills these in tokens only (GPT Image 2.6 Flare and Sunburst, read 6 Nov 2026): no estimate rather than a guessed one.
    const unpriced = new Set(["gpt-image-2-6/flare-text-to-image", "gpt-image-2-6/sunburst-text-to-image"]);
    const used = new Set<string>();
    // Upscalers are priced in `upscale.ts`, not from `KIE_PRICES`.
    for (const m of VIDEO_MODELS.filter((v) => v.kie && !v.hidden && !v.caps.upscale)) {
      const req = { prompt: "a prompt", duration: m.defaultDuration, firstFrame: !m.caps.textToVideo, videoSec: 5 };
      const defaults = m.kie?.family === "gemini-omni" ? { ...req, duration: 8 } : m.kie?.family === "grok" ? { ...req, duration: 6 } : req;
      used.add(kieVideoPayloadFor(m, defaults).priceKey);
      expect(estimateKieVideoCost(m, defaults), `${m.id} on kie`).toBeGreaterThan(0);
    }
    for (const m of IMAGE_MODELS.filter((i) => i.kie && !i.caps.upscale)) {
      const { priceKey } = buildKieImagePayload(m, { prompt: "p", aspectRatio: "1:1", size: "1K" }, []);
      used.add(priceKey);
      if (unpriced.has(priceKey)) expect(estimateKieImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, 0), `${m.id} on kie`).toBeUndefined();
      else expect(estimateKieImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, 0), `${m.id} on kie`).toBeGreaterThan(0);
    }
    expect(Object.keys(KIE_PRICES).filter((k) => !used.has(k))).toEqual([]);
  });

  it("price by the second, the clip or the image, with or without sound", () => {
    expect(estimateKieVideoCost(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 5, audio: false })).toBeCloseTo(0.45);
    expect(estimateKieVideoCost(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 5, audio: true })).toBeCloseTo(0.675);
    expect(estimateKieVideoCost(video("google/veo-3.1"), { prompt: "p", duration: 8, resolution: "1080p" })).toBeCloseTo(1.275);
    expect(estimateKieVideoCost(video("fal/gemini-omni-flash-1.1"), { prompt: "p", duration: 6, resolution: "4K" })).toBeCloseTo(0.84);
    expect(estimateKieVideoCost(video("google/gemini-omni-flash-1.2"), { prompt: "p", duration: 15, resolution: "4K" })).toBeCloseTo(1.65);
    expect(estimateKieVideoCost(video("google/gemini-omni-flash-1.2"), { prompt: "p", duration: 8, firstFrame: true, lastFrame: true })).toBeCloseTo(0.36);
    expect(estimateKieVideoCost(video("fal/kling-v4"), { prompt: "p", duration: 10, resolution: "1080p", references: true })).toBeCloseTo(2.125);
    expect(estimateKieVideoCost(video("pixverse/pixverse-v6-max"), { prompt: "p", duration: 10, resolution: "1080p", audio: true })).toBeCloseTo(1.12);
    expect(estimateKieVideoCost(video("pixverse/pixverse-v6-max"), { prompt: "p", duration: 5, resolution: "720p", audio: false })).toBeCloseTo(0.22);
    expect(estimateKieVideoCost(video("fal/wan-2.7-edit"), { prompt: "p", duration: 5, resolution: "1080p", videoSec: 8 })).toBeCloseTo(0.96);
    expect(estimateKieVideoCost(video("fal/wan-2.7-edit"), { prompt: "p", duration: 5 })).toBeUndefined(); // the source's length is not known yet
    expect(estimateKieVideoCost(video("x-ai/grok-imagine-video-1.5"), { prompt: "p", duration: 5, resolution: "1080p" })).toBeUndefined(); // no price listed
    expect(estimateKieImageCost(image("google/gemini-3-pro-image"), { aspectRatio: "1:1", size: "4K" }, 2, 1)).toBeCloseTo(0.24);
    expect(estimateKieImageCost(image("openai/gpt-image-2"), { aspectRatio: "1:1", size: "1K" }, 1, 1)).toBeCloseTo(0.03);
  });

  it.each(["flare", "sunburst"])("GPT Image 2.6 %s has no estimate, with or without references, rather than GPT Image 2's", (tier) => {
    const m = image(`openai/gpt-image-2.6-${tier}`);
    expect(estimateKieImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, 0)).toBeUndefined();
    expect(estimateKieImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, 1)).toBeUndefined();
  });

  it("GPT Image 2.6 Economy: 5 credits an image, with or without references, and only a kie.ai key runs it", () => {
    const m = image("openai/gpt-image-2.6-economy");
    expect(estimateKieImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, 0)).toBeCloseTo(0.025);
    expect(estimateKieImageCost(m, { aspectRatio: "1:1", size: "1K" }, 4, 1)).toBeCloseTo(0.1);
    const req = { aspectRatio: "16:9" as const, size: "1K" as const, count: 1, references: 8 };
    const quote = quoteImage(m, req, { kie: true });
    expect(quote).toMatchObject({ quotes: [{ provider: "kie", noKey: false }], provider: "kie", reason: "only" });
    expect(quote.quotes[0]?.usd).toBeCloseTo(0.025);
    // No other key helps.
    const others = quoteImage(m, req, { openrouter: true, fal: true, apimart: true, revana: true });
    expect(others).toMatchObject({ quotes: [{ provider: "kie", noKey: true }], reason: "none" });
    expect(others.provider).toBeUndefined();
  });

  it("Seedream 5.5: 3.6 credits at 1K and 6.3 at 2K, plus 1.44 for each reference image", () => {
    const m = image("bytedance-seed/seedream-5-5");
    expect(estimateKieImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, 0)).toBeCloseTo(0.018);
    expect(estimateKieImageCost(m, { aspectRatio: "16:9", size: "2K" }, 1, 0)).toBeCloseTo(0.0315);
    // Two references, four images: (6.3 + 2 × 1.44) × 4 credits.
    expect(estimateKieImageCost(m, { aspectRatio: "auto", size: "2K" }, 4, 2)).toBeCloseTo(0.1836);
    // With an APIMart key too, kie.ai runs it: APIMart has no price for it in the app.
    const req = { aspectRatio: "16:9" as const, size: "2K" as const, count: 1, references: 3 };
    const quote = quoteImage(m, req, { kie: true, apimart: true });
    expect(quote).toMatchObject({
      quotes: [{ provider: "openrouter", noKey: true }, { provider: "fal", noKey: true }, { provider: "kie", noKey: false }, { provider: "apimart", noKey: false }],
      provider: "kie",
      reason: "cheaper",
    });
    expect(quote.quotes[2]?.usd).toBeCloseTo((6.3 + 3 * 1.44) * 0.005);
  });

  it("MiniMax H3 Image: 1.8 credits at 1K and 2K, 5.5 at 4K, plus 0.5 for each reference image", () => {
    const m = image("minimax/minimax-h3-image");
    expect(estimateKieImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, 0)).toBeCloseTo(0.009);
    expect(estimateKieImageCost(m, { aspectRatio: "16:9", size: "2K" }, 1, 0)).toBeCloseTo(0.009);
    expect(estimateKieImageCost(m, { aspectRatio: "16:9", size: "4K" }, 1, 0)).toBeCloseTo(0.0275);
    // Three references, two images: (5.5 + 3 × 0.5) × 2 credits.
    expect(estimateKieImageCost(m, { aspectRatio: "auto", size: "4K" }, 2, 3)).toBeCloseTo(0.07);
    // OpenRouter, fal and APIMart bill it in tokens with no per-image price: with a kie.ai key, kie runs it.
    const req = { aspectRatio: "16:9" as const, size: "2K" as const, count: 1, references: 2 };
    const quote = quoteImage(m, req, { openrouter: true, fal: true, kie: true });
    expect(quote).toMatchObject({
      quotes: [{ provider: "openrouter", noKey: false }, { provider: "fal", noKey: false }, { provider: "kie", noKey: false }, { provider: "apimart", noKey: true }],
      provider: "kie",
      reason: "cheaper",
    });
    expect(quote.quotes[2]?.usd).toBeCloseTo((1.8 + 2 * 0.5) * 0.005);
    expect(quoteImage(m, req, { openrouter: true, fal: true })).toMatchObject({ provider: "openrouter", reason: "unpriced" });
  });
});
