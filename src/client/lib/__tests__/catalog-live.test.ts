/** Merging OpenRouter's live catalogs into the curated one: prices, options, discovery, quirks. */
import { describe, expect, it } from "vitest";
import { findImageModel, findVideoModel } from "@shared/models";
import { buildImageModel, buildVideoModel, displayName, minimumUsd, perSecondUsd } from "../catalog";
import { parseImageSpec, parseVideoSpec, type LiveImageSpec, type LiveVideoSpec } from "../openrouter";
import IMAGES_MODELS from "../../__tests__/fixtures/images-models.json";
import VIDEOS_MODELS from "../../__tests__/fixtures/videos-models.json";

const videoSpec = (id: string): LiveVideoSpec => {
  const row = (VIDEOS_MODELS.data as Record<string, unknown>[]).find((r) => r.id === id);
  if (!row) throw new Error(`fixture has no ${id}`);
  return parseVideoSpec(row);
};
const imageSpec = (id: string): LiveImageSpec => {
  const row = (IMAGES_MODELS.data as Record<string, unknown>[]).find((r) => r.id === id);
  if (!row) throw new Error(`fixture has no ${id}`);
  return parseImageSpec(row);
};

describe("perSecondUsd", () => {
  it("reads every SKU shape OpenRouter uses", () => {
    expect(perSecondUsd(videoSpec("google/veo-3.1").pricing, "1080p")).toBe(0.4); // with audio, flat
    expect(perSecondUsd(videoSpec("google/veo-3.1").pricing, "4K")).toBe(0.6); // with audio, per resolution
    expect(perSecondUsd(videoSpec("google/veo-3.1-fast").pricing, "720p")).toBe(0.1);
    expect(perSecondUsd(videoSpec("kwaivgi/kling-v3.0-pro").pricing, "720p")).toBe(0.168); // audio is on by default
    expect(perSecondUsd(videoSpec("minimax/hailuo-3-max").pricing, "480p")).toBe(0.05);
    expect(perSecondUsd(videoSpec("minimax/hailuo-3").pricing, "2K")).toBe(0.13); // flat
    expect(perSecondUsd(videoSpec("x-ai/grok-imagine-video-1.5").pricing, "1080p")).toBe(0.25); // cents
    expect(perSecondUsd(videoSpec("black-forest-labs/flux-3-video").pricing, "1080p")).toBe(0.29); // cents
    expect(perSecondUsd(videoSpec("alibaba/wan-2.6").pricing, "720p")).toBe(0.08); // text-to-video reference
    // Seedance is priced per video token: 1280×720×24/1024 tokens a second at 720p.
    expect(perSecondUsd(videoSpec("bytedance/seedance-2.5").pricing, "720p")).toBeCloseTo(0.2311, 4);
    expect(perSecondUsd(videoSpec("bytedance/seedance-2.0").pricing, "4K")).toBeCloseTo(0.7776, 4);
    expect(perSecondUsd({}, "720p")).toBeUndefined();
    expect(perSecondUsd({ duration_seconds: "free" }, "720p")).toBeUndefined();
  });

  it("reads the price without audio where OpenRouter lists one, a resolution's own price first", () => {
    expect(perSecondUsd(videoSpec("kwaivgi/kling-v3.0-pro").pricing, "720p", false)).toBe(0.112);
    expect(perSecondUsd(videoSpec("google/veo-3.1").pricing, "1080p", false)).toBe(0.2);
    expect(perSecondUsd(videoSpec("google/veo-3.1").pricing, "4K", false)).toBe(0.4);
    expect(perSecondUsd(videoSpec("google/veo-3.1-fast").pricing, "720p", false)).toBe(0.08);
    expect(perSecondUsd(videoSpec("bytedance/seedance-1-5-pro").pricing, "720p", false)).toBeCloseTo(0.0259, 4);
    expect(perSecondUsd(videoSpec("minimax/hailuo-3").pricing, "2K", false)).toBe(0.13); // one price either way
  });
});

describe("buildVideoModel", () => {
  it("keeps a no-audio price only where it is lower than the price with audio", () => {
    expect(buildVideoModel(videoSpec("kwaivgi/kling-v3.0-pro"), findVideoModel("kwaivgi/kling-v3.0-pro")).estCostPerSecNoAudioUsd).toEqual({ "720p": 0.112 });
    expect(buildVideoModel(videoSpec("google/veo-3.1"), findVideoModel("google/veo-3.1")).estCostPerSecNoAudioUsd).toEqual({ "720p": 0.2, "1080p": 0.2, "4K": 0.4 });
    expect(buildVideoModel(videoSpec("bytedance/seedance-2.5"), findVideoModel("bytedance/seedance-2.5")).estCostPerSecNoAudioUsd).toBeUndefined();
  });

  it("keeps a curated editor's own options (OpenRouter lists none) and takes OpenRouter's price and minimum", () => {
    const flux = buildVideoModel(videoSpec("black-forest-labs/flux-video-edit"), findVideoModel("black-forest-labs/flux-video-edit"));
    expect(flux).toMatchObject({ caps: { videoEdit: true }, resolutions: ["720p"], estCostPerSecUsd: { "720p": 0.03 }, editSource: { maxSec: 15, maxMb: 50 } });
    expect(flux.hidden).toBeFalsy();
    expect(flux.minCostUsd).toBeUndefined();
    const aleph = buildVideoModel(videoSpec("runway/aleph-2"), findVideoModel("runway/aleph-2"));
    expect(aleph).toMatchObject({ caps: { videoEdit: true }, estCostPerSecUsd: { "720p": 0.28 }, minCostUsd: 0.56 });
    expect(minimumUsd({ minimum_cents_per_generation: "56" })).toBe(0.56);
    expect(minimumUsd({ cents_per_second_output: "28" })).toBeUndefined();
  });

  it("keeps the curated presentation and quirks but takes OpenRouter's options and prices", () => {
    const curated = findVideoModel("bytedance/seedance-2.0");
    if (!curated) throw new Error("catalog changed");
    const stale = { ...curated, resolutions: ["1080p" as const], estCostPerSecUsd: { "1080p": 9 }, caps: { ...curated.caps, audio: false, lastFrame: false } };
    const m = buildVideoModel(videoSpec("bytedance/seedance-2.0"), stale);
    expect(m).toMatchObject({ name: "Seedance 2.0", featured: true, omitAspectRatioOnI2v: true, verified: true });
    expect(m.caps).toMatchObject({ realFaces: false, audio: true, lastFrame: true, imageToVideo: true });
    expect(m.resolutions).toEqual(["480p", "720p", "1080p", "4K"]);
    expect(m.estCostPerSecUsd["1080p"]).toBeCloseTo(0.3742, 4);
    expect(m.defaultResolution).toBe("1080p");
    expect(m.durations).toEqual({ min: 4, max: 15, step: 1 });
  });

  it("keeps a non-contiguous duration list and picks defaults the model accepts", () => {
    const m = buildVideoModel(videoSpec("kwaivgi/kling-video-o1"));
    expect(m.durations).toEqual({ options: [5, 10] });
    expect(m.defaultDuration).toBe(5);
    expect(m.defaultResolution).toBe("720p");
    const veo = buildVideoModel({ ...videoSpec("google/veo-3.1"), durations: [4, 6, 8] });
    expect(veo.durations).toEqual({ options: [4, 6, 8] });
    expect(veo.defaultDuration).toBe(4); // nearest to 5; a tie keeps the first
  });

  it("hides what the app cannot drive and names discovered models without the vendor prefix", () => {
    expect(buildVideoModel(videoSpec("black-forest-labs/flux-video-edit")).hidden).toBe(true); // an editor the app has no entry for
    // A curated upscaler is offered, not hidden.
    expect(buildVideoModel(videoSpec("black-forest-labs/flux-video-upscale"), findVideoModel("black-forest-labs/flux-video-upscale")).hidden).toBeFalsy();
    expect(buildVideoModel(videoSpec("heygen/avatar-iv"), findVideoModel("heygen/avatar-iv")).hidden).toBe(true);
    const lite = buildVideoModel(videoSpec("x-ai/grok-imagine-video-1.5-lite"));
    expect(lite).toMatchObject({ name: "Grok Imagine Video 1.5 Lite", provider: "x-ai", discovered: true });
    expect(lite.hidden).toBeFalsy();
    expect(displayName({ id: "a/b-1", name: "Vendor: Model One" })).toBe("Model One");
    expect(displayName({ id: "a/b-1" })).toBe("b-1");
  });
});

describe("buildImageModel", () => {
  it("leaves curated chat and images-endpoint models on their verified options", () => {
    const pro = findImageModel("google/gemini-3-pro-image");
    const krea = findImageModel("krea/krea-2-large");
    if (!pro || !krea) throw new Error("catalog changed");
    expect(buildImageModel(imageSpec("google/gemini-3-pro-image"), pro)).toBe(pro);
    expect(buildImageModel(imageSpec("krea/krea-2-large"), krea)).toBe(krea);
  });

  it("builds a native model from the catalog: ratios, sizes, reference limits", () => {
    const m = buildImageModel(imageSpec("bytedance-seed/seedream-5-0-pro"));
    expect(m).toMatchObject({
      endpoint: "native",
      provider: "bytedance",
      name: expect.stringContaining("Seedream"),
      sizes: ["1K", "2K"],
      supportsImageSize: true,
      caps: { textToImage: true, imageToImage: true, maxReferenceImages: 8 },
      estCostUsd: {},
    });
    expect(m?.aspectRatios[0]).toBe("auto");
    expect(m?.aspectRatios).toContain("21:9");
    expect(m?.aspectRatios).not.toContain("9:19.5"); // not an option the app knows
    const flat = buildImageModel(imageSpec("meta/muse-image"));
    expect(flat).toMatchObject({ aspectRatios: ["auto"], sizes: ["1K"], supportsImageSize: false, caps: { imageToImage: false } });
  });

  it("drops vector-only and image-less models, and marks reference-only ones", () => {
    expect(buildImageModel(imageSpec("recraft/recraft-v4-vector"))).toBeUndefined();
    expect(buildImageModel({ ...imageSpec("meta/muse-image"), outputModalities: ["text"] })).toBeUndefined();
    expect(buildImageModel(imageSpec("recraft/recraft-v4-styles"))?.caps).toMatchObject({ textToImage: false, imageToImage: true });
    expect(buildImageModel(imageSpec("sourceful/riverflow-v2.5-fast"))).toBeDefined(); // jpeg only is fine
  });
});
