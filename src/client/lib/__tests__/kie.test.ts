/** kie.ai request builders and prices: each family's fields, what kie refuses, and what a run costs there. */
import { describe, expect, it } from "vitest";
import { KIE_PRICES } from "@shared/kie-prices";
import { findImageModel, findVideoModel, IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import type { ImageModel, VideoModel } from "@shared/types";
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
    const used = new Set<string>();
    for (const m of VIDEO_MODELS.filter((v) => v.kie && !v.hidden)) {
      const req = { prompt: "a prompt", duration: m.defaultDuration, firstFrame: !m.caps.textToVideo, videoSec: 5 };
      const defaults = m.kie?.family === "gemini-omni" ? { ...req, duration: 8 } : m.kie?.family === "grok" ? { ...req, duration: 6 } : req;
      used.add(kieVideoPayloadFor(m, defaults).priceKey);
      expect(estimateKieVideoCost(m, defaults), `${m.id} on kie`).toBeGreaterThan(0);
    }
    for (const m of IMAGE_MODELS.filter((i) => i.kie)) {
      used.add(buildKieImagePayload(m, { prompt: "p", aspectRatio: "1:1", size: "1K" }, []).priceKey);
      expect(estimateKieImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, false), `${m.id} on kie`).toBeGreaterThan(0);
    }
    expect(Object.keys(KIE_PRICES).filter((k) => !used.has(k))).toEqual([]);
  });

  it("price by the second, the clip or the image, with or without sound", () => {
    expect(estimateKieVideoCost(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 5, audio: false })).toBeCloseTo(0.45);
    expect(estimateKieVideoCost(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 5, audio: true })).toBeCloseTo(0.675);
    expect(estimateKieVideoCost(video("google/veo-3.1"), { prompt: "p", duration: 8, resolution: "1080p" })).toBeCloseTo(1.275);
    expect(estimateKieVideoCost(video("fal/gemini-omni-flash-1.1"), { prompt: "p", duration: 6, resolution: "4K" })).toBeCloseTo(0.84);
    expect(estimateKieVideoCost(video("fal/wan-2.7-edit"), { prompt: "p", duration: 5, resolution: "1080p", videoSec: 8 })).toBeCloseTo(0.96);
    expect(estimateKieVideoCost(video("fal/wan-2.7-edit"), { prompt: "p", duration: 5 })).toBeUndefined(); // the source's length is not known yet
    expect(estimateKieVideoCost(video("x-ai/grok-imagine-video-1.5"), { prompt: "p", duration: 5, resolution: "1080p" })).toBeUndefined(); // no price listed
    expect(estimateKieImageCost(image("google/gemini-3-pro-image"), { aspectRatio: "1:1", size: "4K" }, 2, true)).toBeCloseTo(0.24);
  });
});
