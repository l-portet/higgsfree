/** APIMart request builders and prices: each family's fields, what APIMart refuses, and what a run costs there. */
import { describe, expect, it } from "vitest";
import { APIMART_PRICES } from "@shared/apimart-prices";
import { findImageModel, findVideoModel, IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import type { ImageModel, VideoModel } from "@shared/types";
import { resultUrls } from "../apimart";
import { buildApimartImagePayload, buildApimartVideoPayload } from "../apimart-payloads";
import { apimartVideoPayloadFor, estimateApimartImageCost, estimateApimartVideoCost } from "../apimart-pricing";
import { quoteImage } from "../image-cost";

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

describe("buildApimartVideoPayload", () => {
  it("Veo 3.1: 8 s clips, frames as `image_urls` with `generation_type: frame`; Lite takes none", () => {
    expect(buildApimartVideoPayload(video("google/veo-3.1-fast"), { prompt: "p", duration: 8, aspectRatio: "9:16", resolution: "4K" }, {})).toEqual({
      kind: "videos",
      body: { model: "veo3.1-fast", prompt: "p", duration: 8, resolution: "4k", aspect_ratio: "9:16" },
      priceKey: "veo3.1-fast",
      params: { duration: 8, resolution: "4K", aspectRatio: "9:16", audio: true },
    });
    expect(buildApimartVideoPayload(video("google/veo-3.1"), { prompt: "p", duration: 8 }, { firstFrame: "https://a", lastFrame: "https://b" }).body).toMatchObject({
      generation_type: "frame",
      image_urls: ["https://a", "https://b"],
    });
    expect(() => buildApimartVideoPayload(video("google/veo-3.1"), { prompt: "p", duration: 6 }, {})).toThrow("Takes clips of 8 s");
    expect(() => buildApimartVideoPayload(video("google/veo-3.1-lite"), { prompt: "p", duration: 8 }, { firstFrame: "https://a" })).toThrow("Takes no frames");
  });

  it("Seedance: `size`, and frames and references as roles", () => {
    const m = video("bytedance/seedance-2.0");
    expect(buildApimartVideoPayload(m, { prompt: "a fox", duration: 6, resolution: "1080p", audio: false }, { firstFrame: "https://a", lastFrame: "https://b" })).toEqual({
      kind: "videos",
      body: {
        model: "seedance-2.0",
        prompt: "a fox",
        size: "adaptive",
        resolution: "1080p",
        duration: 6,
        generate_audio: false,
        image_with_roles: [
          { url: "https://a", role: "first_frame" },
          { url: "https://b", role: "last_frame" },
        ],
      },
      priceKey: "seedance-2.0",
      params: { duration: 6, resolution: "1080p", audio: false },
    });
    expect(buildApimartVideoPayload(m, { prompt: "a fox", duration: 5 }, { references: ["https://r"] }).body).toMatchObject({ image_with_roles: [{ url: "https://r", role: "reference_image" }] });
  });

  it("Kling 4.0: no `mode` and no sound field; frames as `image_urls`, references as roles", () => {
    const m = video("fal/kling-v4");
    expect(buildApimartVideoPayload(m, { prompt: "p", duration: 12, aspectRatio: "21:9", resolution: "1080p" }, {})).toEqual({
      kind: "videos",
      body: { model: "kling-v4", prompt: "p", duration: 12, resolution: "1080p", aspect_ratio: "21:9" },
      priceKey: "kling-v4",
      params: { duration: 12, resolution: "1080p", aspectRatio: "21:9" },
    });
    expect(buildApimartVideoPayload(m, { prompt: "", duration: 5, aspectRatio: "9:16" }, { firstFrame: "https://a", lastFrame: "https://b" }).body).toEqual({
      model: "kling-v4",
      prompt: "",
      duration: 5,
      resolution: "720p",
      image_urls: ["https://a", "https://b"],
    });
    expect(buildApimartVideoPayload(m, { prompt: "p", duration: 5 }, { references: ["https://r"] }).body).toMatchObject({ image_with_roles: [{ url: "https://r", role: "reference_image" }] });
    expect(() => buildApimartVideoPayload(m, { prompt: "", duration: 5 }, {})).toThrow("Needs a prompt");
  });

  it("PixVerse 6 Max: `aspect_ratio` (PixVerse 6 sends `size`), a first frame only, no prompt needed with it", () => {
    const m = video("pixverse/pixverse-v6-max");
    expect(buildApimartVideoPayload(m, { prompt: "p", duration: 15, aspectRatio: "2:3", resolution: "1080p", audio: true }, {})).toEqual({
      kind: "videos",
      body: { model: "pixverse-v6-max", prompt: "p", resolution: "1080p", duration: 15, audio: true, aspect_ratio: "2:3" },
      priceKey: "pixverse-v6-max",
      params: { duration: 15, resolution: "1080p", aspectRatio: "2:3", audio: true },
    });
    expect(buildApimartVideoPayload(m, { prompt: "", duration: 5, aspectRatio: "16:9" }, { firstFrame: "https://a" }).body).toEqual({
      model: "pixverse-v6-max",
      prompt: "",
      resolution: "720p",
      duration: 5,
      audio: false,
      image_urls: ["https://a"],
    });
    expect(() => buildApimartVideoPayload(m, { prompt: "", duration: 5 }, {})).toThrow("Needs a prompt");
    expect(() => buildApimartVideoPayload(m, { prompt: "p", duration: 5 }, { firstFrame: "https://a", lastFrame: "https://b" })).toThrow("Takes no last frame");
  });

  it("Gemini Omni Flash 1.2: no duration, frames in their own fields, references as `image_urls`, the ratio with a frame too", () => {
    const m = video("google/gemini-omni-flash-1.2");
    expect(buildApimartVideoPayload(m, { prompt: "p", duration: 5, aspectRatio: "9:16", resolution: "4K" }, {})).toEqual({
      kind: "videos",
      body: { model: "gemini-omni-1.2-flash", prompt: "p", resolution: "4k", aspect_ratio: "9:16" },
      priceKey: "gemini-omni-1.2-flash",
      params: { duration: 8, resolution: "4K", aspectRatio: "9:16" },
    });
    expect(buildApimartVideoPayload(m, { prompt: "p", duration: 8, aspectRatio: "9:16" }, { firstFrame: "https://a", lastFrame: "https://b" })).toMatchObject({
      body: { model: "gemini-omni-1.2-flash", prompt: "p", resolution: "720p", aspect_ratio: "9:16", first_frame_image: "https://a", last_frame_image: "https://b" },
      params: { duration: 8, resolution: "720p", aspectRatio: "9:16" },
    });
    expect(buildApimartVideoPayload(m, { prompt: "p", duration: 8 }, { references: ["https://r", "https://s"] }).body).toEqual({
      model: "gemini-omni-1.2-flash",
      prompt: "p",
      resolution: "720p",
      image_urls: ["https://r", "https://s"],
    });
    expect(() => buildApimartVideoPayload(m, { prompt: "", duration: 8 }, { firstFrame: "https://a" })).toThrow("Needs a prompt");
    expect(() => buildApimartVideoPayload(m, { prompt: "p", duration: 8 }, { lastFrame: "https://b" })).toThrow("needs a first frame");
    expect(() => buildApimartVideoPayload(m, { prompt: "p", duration: 8, aspectRatio: "1:1" }, {})).toThrow("Takes no 1:1");
  });

  it("maps the other families' own field names", () => {
    expect(buildApimartVideoPayload(video("minimax/hailuo-3"), { prompt: "p", duration: 6 }, { firstFrame: "https://a" }).body).toEqual({
      model: "MiniMax-H3",
      prompt: "p",
      duration: 6,
      resolution: "2K",
      first_frame_image: "https://a",
    });
    expect(buildApimartVideoPayload(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 7, aspectRatio: "1:1", audio: true }, {}).body).toEqual({
      model: "kling-v3",
      prompt: "p",
      mode: "pro",
      duration: 7,
      aspect_ratio: "1:1",
      audio: true,
    });
    expect(buildApimartVideoPayload(video("kwaivgi/kling-video-o1"), { prompt: "p", duration: 5 }, { firstFrame: "https://a" }).body).toMatchObject({
      mode: "std",
      image_with_roles: [{ url: "https://a", role: "first_frame" }],
    });
    expect(buildApimartVideoPayload(video("black-forest-labs/flux-3-video"), { prompt: "p", duration: 12, resolution: "1080p" }, {}).body).toMatchObject({ resolution: "fhd", aspect_ratio: "auto" });
    expect(buildApimartVideoPayload(video("fal/vidu-q4"), { prompt: "", duration: 5, resolution: "2K" }, { firstFrame: "https://a" }).body).toMatchObject({ first_frame_image: "https://a", resolution: "2K" });
  });

  it("refuses what the family cannot do", () => {
    expect(() => buildApimartVideoPayload(video("minimax/hailuo-2.3"), { prompt: "p", duration: 10, resolution: "1080p" }, {})).toThrow("Takes 6 s clips at 1080p");
    expect(() => buildApimartVideoPayload(video("fal/gemini-omni-flash-1.1"), { prompt: "p", duration: 8 }, { firstFrame: "https://a", lastFrame: "https://b" })).toThrow("Takes no last frame");
    expect(() => buildApimartVideoPayload(video("minimax/hailuo-3"), { prompt: "p", duration: 6, audio: false }, {})).toThrow("Always adds sound");
    expect(() => buildApimartVideoPayload(video("kwaivgi/kling-v3.0-pro"), { prompt: "", duration: 5 }, {})).toThrow("Needs a prompt");
  });
});

describe("buildApimartImagePayload", () => {
  it("sends the ratio as `size`, one image, and references as urls", () => {
    expect(buildApimartImagePayload(image("google/gemini-3-pro-image"), { prompt: "p", aspectRatio: "16:9", size: "4K" }, ["https://r"])).toEqual({
      kind: "images",
      body: { model: "gemini-3-pro-image-preview", prompt: "p", n: 1, image_urls: ["https://r"], size: "16:9", resolution: "4K" },
      priceKey: "gemini-3-pro-image-preview",
    });
    expect(buildApimartImagePayload(image("openai/gpt-image-2"), { prompt: "p", aspectRatio: "auto", size: "2K" }, []).body).toMatchObject({ resolution: "2k" });
    expect(buildApimartImagePayload(image("fal/z-image-turbo"), { prompt: "p", aspectRatio: "auto", size: "1K" }, []).body).toEqual({
      model: "z-image-turbo",
      prompt: "p",
      n: 1,
      size: "1:1",
      resolution: "1K",
      prompt_extend: false,
    });
  });

  it("GPT Image 2.6: GPT Image 2's fields under its own model", () => {
    expect(buildApimartImagePayload(image("openai/gpt-image-2.6"), { prompt: "p", aspectRatio: "4:5", size: "4K" }, ["https://r", "https://s"])).toEqual({
      kind: "images",
      body: { model: "gpt-image-2.6", prompt: "p", n: 1, image_urls: ["https://r", "https://s"], size: "4:5", resolution: "4k" },
      priceKey: "gpt-image-2.6",
    });
    expect(buildApimartImagePayload(image("openai/gpt-image-2.6"), { prompt: "p", aspectRatio: "auto", size: "1K" }, []).body).toEqual({
      model: "gpt-image-2.6",
      prompt: "p",
      n: 1,
      size: "auto",
      resolution: "1k",
    });
  });

  it("GPT Image 2.6 Flare: GPT Image 2's fields under its own model, 21:9 included", () => {
    expect(buildApimartImagePayload(image("openai/gpt-image-2.6-flare"), { prompt: "p", aspectRatio: "21:9", size: "1K" }, ["https://r"])).toEqual({
      kind: "images",
      body: { model: "gpt-image-2.6-flare", prompt: "p", n: 1, image_urls: ["https://r"], size: "21:9", resolution: "1k" },
      priceKey: "gpt-image-2.6-flare",
    });
  });
});

describe("resultUrls", () => {
  it("reads every url of every item, given as a list or a string", () => {
    expect(resultUrls({ videos: [{ url: ["https://a.mp4"], expires_at: 1 }] })).toEqual(["https://a.mp4"]);
    expect(resultUrls({ images: [{ url: ["https://b.png", "https://c.png"] }, { url: "https://d.png" }] })).toEqual(["https://b.png", "https://c.png", "https://d.png"]);
    expect(resultUrls(undefined)).toEqual([]);
  });
});

describe("APIMart prices", () => {
  it("price every route at its defaults, and nothing else", () => {
    // APIMart lists no price for these yet (read 30 Oct 2026), or bills them in tokens only (GPT Image 2.6 Flare,
    // read 5 Nov 2026): no estimate rather than a guessed one.
    const unpriced = new Set(["gemini-omni-1.2-flash", "gpt-image-2.6", "gpt-image-2.6-flare"]);
    const used = new Set<string>();
    for (const m of VIDEO_MODELS.filter((v) => v.apimart && !v.hidden)) {
      const durations: Partial<Record<string, number>> = { veo: 8, "gemini-omni": 8 };
      const req = { prompt: "a prompt", duration: durations[m.apimart?.family ?? ""] ?? m.defaultDuration, firstFrame: !m.caps.textToVideo };
      const { priceKey } = apimartVideoPayloadFor(m, req);
      used.add(priceKey);
      if (unpriced.has(priceKey)) expect(estimateApimartVideoCost(m, req), `${m.id} on APIMart`).toBeUndefined();
      else expect(estimateApimartVideoCost(m, req), `${m.id} on APIMart`).toBeGreaterThan(0);
    }
    for (const m of IMAGE_MODELS.filter((i) => i.apimart)) {
      const { priceKey } = buildApimartImagePayload(m, { prompt: "p", aspectRatio: "1:1", size: "1K" }, []);
      used.add(priceKey);
      if (unpriced.has(priceKey)) expect(estimateApimartImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, false), `${m.id} on APIMart`).toBeUndefined();
      else expect(estimateApimartImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, false), `${m.id} on APIMart`).toBeGreaterThan(0);
    }
    expect(Object.keys(APIMART_PRICES).filter((k) => !used.has(k))).toEqual([]);
  });

  it("price by the second, the clip or the image, with or without sound", () => {
    expect(estimateApimartVideoCost(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 5, audio: true })).toBeCloseTo(0.672);
    expect(estimateApimartVideoCost(video("kwaivgi/kling-v3.0-pro"), { prompt: "p", duration: 5, audio: false })).toBeCloseTo(0.448);
    expect(estimateApimartVideoCost(video("google/veo-3.1"), { prompt: "p", duration: 8, resolution: "1080p" })).toBeCloseTo(1);
    expect(estimateApimartVideoCost(video("fal/gemini-omni-flash-1.1"), { prompt: "p", duration: 10, resolution: "4K" })).toBeCloseTo(0.9);
    expect(estimateApimartVideoCost(video("fal/kling-v4"), { prompt: "p", duration: 10, resolution: "1080p" })).toBeCloseTo(2.35);
    expect(estimateApimartVideoCost(video("pixverse/pixverse-v6-max"), { prompt: "p", duration: 10, resolution: "1080p", audio: true })).toBeCloseTo(0.9956);
    expect(estimateApimartVideoCost(video("pixverse/pixverse-v6-max"), { prompt: "p", duration: 5, resolution: "720p", audio: false })).toBeCloseTo(0.1956);
    expect(estimateApimartImageCost(image("google/gemini-3-pro-image"), { aspectRatio: "1:1", size: "2K" }, 4, false)).toBeCloseTo(0.12);
  });

  it("GPT Image 2.6, on APIMart only: it runs there with no price known yet", () => {
    const m = image("openai/gpt-image-2.6");
    const req = { aspectRatio: "9:16" as const, size: "2K" as const, count: 4, references: 8 };
    expect(quoteImage(m, req, { apimart: true })).toEqual({ quotes: [{ provider: "apimart", noKey: false }], provider: "apimart", reason: "only" });
    // No other key helps.
    expect(quoteImage(m, req, { openrouter: true, fal: true, kie: true })).toEqual({ quotes: [{ provider: "apimart", noKey: true }], reason: "none" });
  });

  it("GPT Image 2.6 Flare: on OpenRouter, fal and APIMart, priced on none, so OpenRouter runs it when its key is there", () => {
    const m = image("openai/gpt-image-2.6-flare");
    const req = { aspectRatio: "21:9" as const, size: "1K" as const, count: 1, references: 8 };
    const all = { openrouter: true, fal: true, apimart: true };
    expect(quoteImage(m, req, all)).toEqual({
      quotes: [{ provider: "openrouter", noKey: false }, { provider: "fal", noKey: false }, { provider: "apimart", noKey: false }],
      provider: "openrouter",
      reason: "unpriced",
    });
    expect(quoteImage(m, req, { apimart: true })).toMatchObject({ provider: "apimart", reason: "one-ready" });
  });
});
