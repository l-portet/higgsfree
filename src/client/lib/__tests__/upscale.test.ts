/** Upscalers: the scale sent, each provider's request, and the prices the composer shows and the engine routes by. */
import { describe, expect, it } from "vitest";
import { findImageModel, findVideoModel } from "@shared/models";
import type { ImageModel, VideoModel } from "@shared/types";
import { quoteImage } from "../image-cost";
import { upscaleFactor, upscaleImageUsd, upscaleVideoUsd } from "../upscale";
import { quoteVideo } from "../video-cost";

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
const TOPAZ = image("topaz/upscale-image");
const CRISP = image("recraft/crisp-upscale");
const TOPAZ_VIDEO = video("topaz/upscale-video");
const BYTEDANCE = video("bytedance/video-upscaler");

describe("upscaleFactor", () => {
  it("keeps a scale the model offers, falls back to its first, and is unset for a model with none", () => {
    expect(upscaleFactor(TOPAZ, 4)).toBe(4);
    expect(upscaleFactor(TOPAZ, 3)).toBe(2);
    expect(upscaleFactor(TOPAZ, undefined)).toBe(2);
    expect(upscaleFactor(CRISP, 4)).toBeUndefined();
  });
});

describe("upscale prices", () => {
  it("Topaz images: fal by the started 24 MP of output (so the size is needed), kie.ai by the scale", () => {
    // 1024 x 1024 at 4x is 16.8 MP: one step. 2048 x 2048 at 4x is 67 MP: three.
    expect(upscaleImageUsd("fal", TOPAZ, 4, { width: 1024, height: 1024 })).toBeCloseTo(0.08);
    expect(upscaleImageUsd("fal", TOPAZ, 4, { width: 2048, height: 2048 })).toBeCloseTo(0.24);
    expect(upscaleImageUsd("fal", TOPAZ, 4, {})).toBeUndefined();
    expect(upscaleImageUsd("kie", TOPAZ, 2, {})).toBeCloseTo(0.05);
    expect(upscaleImageUsd("kie", TOPAZ, 4, {})).toBeCloseTo(0.1);
  });

  it("Recraft Crisp: a flat price on both", () => {
    expect(upscaleImageUsd("fal", CRISP, undefined, {})).toBeCloseTo(0.004);
    expect(upscaleImageUsd("kie", CRISP, undefined, {})).toBeCloseTo(0.0025);
  });

  it("videos: per second, by the output's resolution (Topaz on fal), the scale (kie.ai) or the target (ByteDance)", () => {
    // 1280 x 720 at 2x: a 1440 short side, fal's 4K rate.
    expect(upscaleVideoUsd("fal", TOPAZ_VIDEO, { upscale: 2 }, 10, { width: 1280, height: 720 })).toBeCloseTo(0.6);
    expect(upscaleVideoUsd("fal", TOPAZ_VIDEO, { upscale: 2 }, 10, { width: 640, height: 360 })).toBeCloseTo(0.1);
    expect(upscaleVideoUsd("fal", TOPAZ_VIDEO, { upscale: 2 }, 10, {})).toBeUndefined();
    expect(upscaleVideoUsd("kie", TOPAZ_VIDEO, { upscale: 2 }, 10, {})).toBeCloseTo(0.4);
    expect(upscaleVideoUsd("kie", TOPAZ_VIDEO, { upscale: 4 }, 10, {})).toBeCloseTo(0.7);
    expect(upscaleVideoUsd("fal", BYTEDANCE, { resolution: "4K" }, 10, {})).toBeCloseTo(0.288);
    expect(upscaleVideoUsd("fal", BYTEDANCE, {}, 10, {})).toBeCloseTo(0.288); // its default, 4K
    expect(upscaleVideoUsd("kie", TOPAZ_VIDEO, { upscale: 2 }, undefined, {})).toBeUndefined(); // the length is not known yet
  });
});

describe("quotes", () => {
  it("a Topaz video goes to the cheaper of fal and kie.ai, as for any video", () => {
    const keys = { fal: true, kie: true };
    // 640 x 360 at 2x on fal: $0.01/s; kie.ai: $0.04/s.
    expect(quoteVideo(TOPAZ_VIDEO, { duration: 5, videoSec: 10, upscale: 2, videoWidth: 640, videoHeight: 360 }, keys).provider).toBe("fal");
    // 1920 x 1080 at 4x on fal: $0.06/s; kie.ai: $0.07/s.
    expect(quoteVideo(TOPAZ_VIDEO, { duration: 5, videoSec: 10, upscale: 4, videoWidth: 1920, videoHeight: 1080 }, keys).provider).toBe("fal");
    // Size unknown: fal is not priced, kie.ai runs it.
    expect(quoteVideo(TOPAZ_VIDEO, { duration: 5, videoSec: 10, upscale: 2 }, keys)).toMatchObject({ provider: "kie" });
  });

  it("an image upscaler is priced with one image attached and refused on a provider without it", () => {
    const q = quoteImage(TOPAZ, { aspectRatio: "auto", size: "1K", count: 1, references: 1, upscale: 4, inputWidth: 1024, inputHeight: 1024 }, { fal: true, kie: true });
    expect(q.quotes.map((x) => [x.provider, x.usd])).toEqual([["fal", expect.closeTo(0.08)], ["kie", expect.closeTo(0.1)]]);
    const none = quoteImage(TOPAZ, { aspectRatio: "auto", size: "1K", count: 1, references: 0 }, { fal: true });
    expect(none.quotes[0]?.refusal).toBe("Topaz Upscale needs an image to upscale");
  });
});
