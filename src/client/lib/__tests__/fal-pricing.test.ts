/** Cost estimates for runs on fal: every routed endpoint has a price, and requests are priced as they would be sent. */
import { describe, expect, it } from "vitest";
import { FAL_PRICES } from "@shared/fal-prices";
import { findImageModel, findVideoModel, IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import type { ImageModel, ImageSize, VideoModel } from "@shared/types";
import { estimateFalImageCost, estimateFalVideoCost } from "../fal-pricing";

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
const PROMO = new Date("2026-10-15T12:00:00Z");
const LATER = new Date("2026-12-01T12:00:00Z");

describe("fal prices", () => {
  it("cover every endpoint the catalog routes to, at every size and resolution it offers, and nothing else", () => {
    const routed = new Set<string>();
    // fal bills these in tokens and gives no per-size figure for them (read 5 Nov 2026): no estimate rather than a guessed one.
    // MiniMax H3 Image likewise (read 11 Nov 2026), and MAI-Image-2.7 (read 18 Nov 2026: $5 / $8 / $34 per 1M input text /
    // input image / output image tokens; fal's only figure is $0.034816 for a 1024×1024 output, before input tokens).
    const unpriced = new Set([
      "openai/gpt-image-2.6/flare/text-to-image", "openai/gpt-image-2.6/flare/edit", "openai/gpt-image-2.6/sunburst/text-to-image", "openai/gpt-image-2.6/sunburst/edit",
      "minimax/h3-image/text-to-image", "minimax/h3-image/edit",
      "microsoft/mai-image-2.7/text-to-image", "microsoft/mai-image-2.7/edit",
    ]);
    // fal gives Kling Image 4.0's price at 2K only (read 18 Nov 2026): 4K has no estimate rather than a guessed one.
    const unpricedSizes: Record<string, ImageSize[]> = { "kling/v4/text-to-image": ["4K"], "kling/v4/image-to-image": ["4K"] };
    // Upscalers are priced in `upscale.ts` (by the output's size, or a flat rate), not from `FAL_PRICES`.
    for (const m of IMAGE_MODELS.filter((i) => !i.caps.upscale)) {
      for (const e of [m.fal?.textToImage, m.fal?.edit]) {
        if (!e) continue;
        routed.add(e);
        if (unpriced.has(e)) {
          expect(FAL_PRICES[e], `${e} is listed as unpriced`).toBeUndefined();
          continue;
        }
        const p = FAL_PRICES[e];
        expect(p, `${e} has no price`).toBeDefined();
        if (p?.unit !== "image" || typeof p.usd === "number") continue;
        for (const s of m.sizes) {
          if (unpricedSizes[e]?.includes(s)) expect(p.usd[s], `${e} at ${s} is listed as unpriced`).toBeUndefined();
          else expect(p.usd[s], `${e} at ${s}`).toBeDefined();
        }
      }
    }
    for (const m of VIDEO_MODELS.filter((v) => !v.hidden && !v.caps.upscale)) {
      for (const e of [m.fal?.textToVideo, m.fal?.imageToVideo, m.fal?.firstLastFrameToVideo, m.fal?.motionControl, m.fal?.edit]) {
        if (!e) continue;
        routed.add(e);
        const p = FAL_PRICES[e];
        expect(p?.unit, `${e} has no per-second price`).toBe("second");
        if (p?.unit !== "second") continue;
        for (const usd of [p.usd, p.audioUsd, p.promo?.usd]) {
          if (usd === undefined || typeof usd === "number") continue;
          for (const r of m.resolutions) expect(usd[r], `${e} at ${r}`).toBeDefined();
        }
      }
    }
    expect(Object.keys(FAL_PRICES).filter((e) => !routed.has(e))).toEqual([]);
  });
});

describe("estimateFalVideoCost", () => {
  it("prices by the second at the resolution sent, with fal's own rate for shared models", () => {
    const seedance = video("bytedance/seedance-2.5");
    expect(estimateFalVideoCost(seedance, { duration: 5, resolution: "720p", audio: true })).toBeCloseTo(2.838);
    expect(estimateFalVideoCost(seedance, { duration: 5, resolution: "480p", audio: false, firstFrame: true })).toBeCloseTo(1.323);
    expect(estimateFalVideoCost(video("fal/gemini-omni-flash-1.1"), { duration: 8, resolution: "4K" })).toBeCloseTo(2.4);
    expect(estimateFalVideoCost(video("google/gemini-omni-flash-1.2"), { duration: 10, resolution: "1080p" })).toBeCloseTo(1.229);
    expect(estimateFalVideoCost(video("google/gemini-omni-flash-1.2"), { duration: 15, resolution: "4K", firstFrame: true })).toBeCloseTo(3.6855);
    expect(estimateFalVideoCost(video("fal/kling-v4"), { duration: 10, resolution: "1080p", firstFrame: true })).toBeCloseTo(2.35);
  });

  it("charges the audio rate unless audio is off, and a flat rate when the model has no resolution", () => {
    const kling = video("kwaivgi/kling-v3.0-pro");
    expect(estimateFalVideoCost(kling, { duration: 5, audio: false })).toBeCloseTo(0.56);
    expect(estimateFalVideoCost(kling, { duration: 5, audio: true })).toBeCloseTo(0.84);
    expect(estimateFalVideoCost(video("fal/kling-o3-pro"), { duration: 5, audio: true })).toBeCloseTo(0.7);
    expect(estimateFalVideoCost(video("fal/pixverse-v6"), { duration: 10, resolution: "1080p", audio: true })).toBeCloseTo(1.15);
    expect(estimateFalVideoCost(video("pixverse/pixverse-v6-max"), { duration: 10, resolution: "1080p", audio: true })).toBeCloseTo(2.52);
    expect(estimateFalVideoCost(video("pixverse/pixverse-v6-max"), { duration: 5, resolution: "720p", audio: false, firstFrame: true })).toBeCloseTo(0.495);
  });

  it("follows the endpoint the frames pick, and refuses what the run would refuse", () => {
    const luma = video("fal/luma-ray-3.2");
    expect(estimateFalVideoCost(luma, { duration: 5, resolution: "720p" })).toBeCloseTo(1);
    expect(estimateFalVideoCost(luma, { duration: 5, resolution: "720p", firstFrame: true })).toBeCloseTo(0.3);
    const draft = video("fal/flux-3-video-draft");
    expect(estimateFalVideoCost(draft, { duration: 10, firstFrame: true, lastFrame: true })).toBeCloseTo(0.6);
    expect(estimateFalVideoCost(draft, { duration: 10, lastFrame: true })).toBeUndefined();
    expect(estimateFalVideoCost(video("fal/vidu-q4"), { duration: 5, resolution: "1080p" })).toBeUndefined();
    const omni = video("google/gemini-omni-flash-1.2");
    expect(estimateFalVideoCost(omni, { duration: 10, firstFrame: true, lastFrame: true })).toBeCloseTo(0.819);
    expect(estimateFalVideoCost(omni, { duration: 12, firstFrame: true, lastFrame: true })).toBeUndefined();
  });

  it("uses a promotional rate up to its last day", () => {
    const vidu = video("fal/vidu-q4");
    expect(estimateFalVideoCost(vidu, { duration: 5, resolution: "1080p", firstFrame: true }, PROMO)).toBeCloseTo(0.42);
    expect(estimateFalVideoCost(vidu, { duration: 5, resolution: "1080p", firstFrame: true }, LATER)).toBeCloseTo(0.6);
    const h3max = video("minimax/hailuo-3-max");
    expect(estimateFalVideoCost(h3max, { duration: 6, resolution: "768p" }, PROMO)).toBeCloseTo(0.288);
    expect(estimateFalVideoCost(h3max, { duration: 6, resolution: "768p" }, new Date("2026-10-16T00:00:00Z"))).toBeCloseTo(0.48);
    const flux = video("fal/flux-3-max");
    expect(estimateFalVideoCost(flux, { duration: 10, resolution: "1080p" }, new Date("2026-11-07T23:00:00Z"))).toBeCloseTo(0.725);
    expect(estimateFalVideoCost(flux, { duration: 10, resolution: "1080p" }, new Date("2026-11-08T00:00:00Z"))).toBeCloseTo(2.9);
  });

  it("motion control: by the reference video's length, none while it is unknown", () => {
    const motion = video("fal/kling-v3-pro-motion-control");
    expect(estimateFalVideoCost(motion, { duration: 0, videoSec: 7.5 })).toBeCloseTo(1.26);
    expect(estimateFalVideoCost(motion, { duration: 0 })).toBeUndefined();
  });

  it("video editing: by the source's length (what the model keeps of it) at the resolution sent, none while it is unknown", () => {
    expect(estimateFalVideoCost(video("fal/kling-o3-edit"), { duration: 0, videoSec: 10 })).toBeCloseTo(1.68);
    expect(estimateFalVideoCost(video("black-forest-labs/flux-video-edit"), { duration: 0, videoSec: 12 })).toBeCloseTo(0.36);
    expect(estimateFalVideoCost(video("fal/gemini-omni-flash-1.1-edit"), { duration: 0, resolution: "4K", videoSec: 6 })).toBeCloseTo(1.8);
    expect(estimateFalVideoCost(video("fal/gemini-omni-flash-1.2-edit"), { duration: 0, videoSec: 10 })).toBeCloseTo(0.819); // 720p by default
    expect(estimateFalVideoCost(video("fal/wan-2.7-edit"), { duration: 0, videoSec: 4 })).toBeCloseTo(0.6); // 1080p by default
    expect(estimateFalVideoCost(video("fal/grok-imagine-edit"), { duration: 0, resolution: "720p", videoSec: 12 })).toBeCloseTo(0.64); // first 8 s
    expect(estimateFalVideoCost(video("fal/kling-o3-edit"), { duration: 0 })).toBeUndefined();
  });
});

describe("estimateFalImageCost", () => {
  it("per image, by size or by the output size the ratio asks for", () => {
    expect(estimateFalImageCost(image("google/gemini-3-pro-image"), { aspectRatio: "1:1", size: "4K" }, 2, 0)).toBeCloseTo(0.6);
    expect(estimateFalImageCost(image("google/gemini-3.1-flash-image"), { aspectRatio: "16:9", size: "2K" }, 1, 1)).toBeCloseTo(0.12);
    const gpt15 = image("fal/gpt-image-1.5");
    expect(estimateFalImageCost(gpt15, { aspectRatio: "1:1", size: "1K" }, 1, 0)).toBeCloseTo(0.133);
    expect(estimateFalImageCost(gpt15, { aspectRatio: "3:2", size: "1K" }, 1, 0)).toBeCloseTo(0.2);
    expect(estimateFalImageCost(gpt15, { aspectRatio: "auto", size: "1K" }, 1, 0)).toBeCloseTo(0.133);
    expect(estimateFalImageCost(image("fal/flux-kontext-pro"), { aspectRatio: "auto", size: "1K" }, 3, 1)).toBeCloseTo(0.12);
  });

  it("Seedream 5.5: by size, plus $0.012 for each reference image of every image made", () => {
    const m = image("bytedance-seed/seedream-5-5");
    expect(estimateFalImageCost(m, { aspectRatio: "16:9", size: "1K" }, 1, 0)).toBeCloseTo(0.03);
    expect(estimateFalImageCost(m, { aspectRatio: "auto", size: "2K" }, 2, 0)).toBeCloseTo(0.081);
    // fal's own examples, with two references: one image at 1.5K (the 1K rate) $0.054, two at 2K $0.129.
    expect(estimateFalImageCost(m, { aspectRatio: "1:1", size: "1K" }, 1, 2)).toBeCloseTo(0.054);
    expect(estimateFalImageCost(m, { aspectRatio: "auto", size: "2K" }, 2, 2)).toBeCloseTo(0.129);
  });

  it("Kling Image 4.0: $0.063 an image at 2K, references not billed; no estimate at 4K", () => {
    const m = image("fal/kling-image-v4");
    expect(estimateFalImageCost(m, { aspectRatio: "16:9", size: "2K" }, 1, 0)).toBeCloseTo(0.063);
    expect(estimateFalImageCost(m, { aspectRatio: "auto", size: "2K" }, 4, 3)).toBeCloseTo(0.252);
    expect(estimateFalImageCost(m, { aspectRatio: "1:1", size: "4K" }, 1, 0)).toBeUndefined();
    expect(estimateFalImageCost(m, { aspectRatio: "auto", size: "4K" }, 2, 2)).toBeUndefined();
  });

  it("per started megapixel of 1024 x 1024", () => {
    const dev = image("fal/flux-dev");
    expect(estimateFalImageCost(dev, { aspectRatio: "1:1", size: "1K" }, 4, 0)).toBeCloseTo(0.1);
    expect(estimateFalImageCost(dev, { aspectRatio: "16:9", size: "1K" }, 1, 0)).toBeCloseTo(0.025);
    expect(estimateFalImageCost(image("fal/flux-schnell"), { aspectRatio: "auto", size: "1K" }, 1, 0)).toBeCloseTo(0.003);
    expect(estimateFalImageCost(dev, { aspectRatio: "1:1", size: "1K" }, 1, 1)).toBeUndefined();
  });
});
