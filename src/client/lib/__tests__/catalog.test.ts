/**
 * Catalog invariants (`src/shared/models.ts`): every offered option has a cost
 * estimate, defaults are among the allowed values, duration steppers are sane,
 * and every aspect ratio an images-endpoint model offers has a `size` mapping in
 * `payloads.ts`. Pure data checks, no server.
 */
import { describe, expect, it } from "vitest";
import {
  allowedDurations, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_EDIT_MODEL, DEFAULT_VIDEO_MODEL, editedLength, estimateImageCost, estimateVideoCost, findImageModel,
  findVideoModel, IMAGE_ASPECT_RATIOS, IMAGE_MODELS, PROVIDER_LABEL, snapDuration, VIDEO_ASPECT_RATIOS, VIDEO_MODELS,
} from "@shared/models";
import { IMAGES_SIZE_BY_ASPECT } from "../payloads";

const VISIBLE_VIDEO = VIDEO_MODELS.filter((m) => !m.hidden);
const HIDDEN_VIDEO = VIDEO_MODELS.filter((m) => m.hidden);
// On OpenRouter but billed in tokens there, with no per-image price (read 5 Nov 2026): no estimate rather than a guessed one.
const UNPRICED_IMAGE = new Set(["openai/gpt-image-2.6-flare", "openai/gpt-image-2.6-sunburst", "minimax/minimax-h3-image"]);

describe("catalog shape", () => {
  it("has unique slugs and unique display names across image + video", () => {
    const ids = [...IMAGE_MODELS, ...VIDEO_MODELS].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = [...IMAGE_MODELS, ...VIDEO_MODELS].map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/i);
  });

  it("uses only known providers, and every provider has a display label", () => {
    for (const m of [...IMAGE_MODELS, ...VIDEO_MODELS]) expect(PROVIDER_LABEL[m.provider], `${m.id} provider ${m.provider}`).toBeTruthy();
  });

  it("the default models exist, are visible and support text-to-* generation", () => {
    const image = findImageModel(DEFAULT_IMAGE_MODEL);
    expect(image?.caps.textToImage).toBe(true);
    const video = findVideoModel(DEFAULT_VIDEO_MODEL);
    expect(video?.hidden).toBeFalsy();
    expect(video?.caps.textToVideo).toBe(true);
  });
});

describe("image models", () => {
  it.each(IMAGE_MODELS.map((m) => [m.id, m] as const))("%s: sizes, ratios and costs are consistent", (_id, m) => {
    expect(m.sizes.length).toBeGreaterThan(0);
    expect(m.aspectRatios.length).toBeGreaterThan(0);
    expect(new Set(m.sizes).size).toBe(m.sizes.length);
    expect(new Set(m.aspectRatios).size).toBe(m.aspectRatios.length);
    for (const ar of m.aspectRatios) expect(IMAGE_ASPECT_RATIOS, `${m.id} lists unknown aspect ratio ${ar}`).toContain(ar);
    // fal publishes prices only to a signed-in key, so fal-only models carry no estimate.
    if (UNPRICED_IMAGE.has(m.id)) expect(m.estCostUsd, `${m.id} is listed as unpriced`).toEqual({});
    for (const size of m.offOpenRouter || UNPRICED_IMAGE.has(m.id) ? [] : m.sizes) {
      expect(m.estCostUsd, `${m.id} has no estCostUsd for size ${size}`).toHaveProperty(size);
      const cost = m.estCostUsd[size];
      expect(typeof cost).toBe("number");
      expect(cost).toBeGreaterThan(0);
      expect(estimateImageCost(m, size, 2)).toBeCloseTo((cost ?? 0) * 2, 10);
    }
    // No cost listed for a size the model does not offer (stale rows).
    for (const size of Object.keys(m.estCostUsd)) expect(m.sizes, `${m.id} prices unlisted size ${size}`).toContain(size);
    // Reference images: capability and count agree.
    expect(m.caps.maxReferenceImages >= 0).toBe(true);
    expect(m.caps.imageToImage, `${m.id} imageToImage vs maxReferenceImages`).toBe(m.caps.maxReferenceImages > 0);
    expect(m.caps.textToImage || m.caps.imageToImage).toBe(true);
  });

  it("every non-auto aspect ratio of an images-endpoint model maps to a `size` for /images/generations", () => {
    const imagesModels = IMAGE_MODELS.filter((m) => m.endpoint === "images");
    expect(imagesModels.length).toBeGreaterThan(0);
    for (const m of imagesModels) {
      for (const ar of m.aspectRatios) {
        if (ar === "auto") continue;
        expect(IMAGES_SIZE_BY_ASPECT[ar], `${m.id}: aspect ratio ${ar} has no entry in IMAGES_SIZE_BY_ASPECT`).toMatch(/^\d+x\d+$/);
      }
    }
    // And the map itself only names catalog ratios.
    for (const ar of Object.keys(IMAGES_SIZE_BY_ASPECT)) expect(IMAGE_ASPECT_RATIOS).toContain(ar);
  });

  it("chat-endpoint models that honour image_size list more than one size, or say they do not", () => {
    for (const m of IMAGE_MODELS.filter((x) => x.endpoint === "chat")) {
      if (m.sizes.length > 1) expect(m.supportsImageSize, `${m.id} offers ${m.sizes.join("/")} but ignores image_size`).toBe(true);
    }
  });
});

describe("video models (visible)", () => {
  it.each(VISIBLE_VIDEO.map((m) => [m.id, m] as const))("%s: resolutions, durations, defaults and costs are consistent", (_id, m) => {
    // fal-only models: no resolution choice on some endpoints, and no published price (see above).
    // Upscalers take a scale instead.
    if (!m.offOpenRouter && !m.caps.upscale) expect(m.resolutions.length).toBeGreaterThan(0);
    expect(new Set(m.resolutions).size).toBe(m.resolutions.length);
    expect(m.aspectRatios.length).toBeGreaterThan(0);
    for (const ar of m.aspectRatios) expect(VIDEO_ASPECT_RATIOS, `${m.id} lists unknown aspect ratio ${ar}`).toContain(ar);

    for (const res of m.offOpenRouter ? [] : m.resolutions) {
      expect(m.estCostPerSecUsd, `${m.id} has no estCostPerSecUsd for ${res}`).toHaveProperty(res);
      const per = m.estCostPerSecUsd[res];
      expect(typeof per).toBe("number");
      expect(per).toBeGreaterThan(0);
      expect(estimateVideoCost(m, 10, res)).toBeCloseTo((per ?? 0) * 10, 10);
    }
    for (const res of Object.keys(m.estCostPerSecUsd)) expect(m.resolutions, `${m.id} prices unlisted resolution ${res}`).toContain(res);
    for (const [res, per] of Object.entries(m.estCostPerSecNoAudioUsd ?? {})) {
      expect(m.caps.audio, `${m.id} has a no-audio price without audio`).toBe(true);
      expect(m.resolutions, `${m.id} prices unlisted resolution ${res} without audio`).toContain(res);
      expect(per, `${m.id} no-audio price at ${res}`).toBeLessThan(m.estCostPerSecUsd[res as keyof typeof m.estCostPerSecUsd] ?? 0);
    }

    if (m.defaultResolution !== undefined) expect(m.resolutions, `${m.id} defaultResolution ${m.defaultResolution}`).toContain(m.defaultResolution);
    // An upscaler's price follows the source's size and length (`lib/upscale.ts`), not a per-second rate.
    if (!m.offOpenRouter && !m.caps.upscale) expect(estimateVideoCost(m, m.defaultDuration), `${m.id} default cost`).toBeGreaterThan(0);

    const durations = allowedDurations(m);
    expect(durations.length).toBeGreaterThan(0);
    expect(durations, `${m.id} defaultDuration ${m.defaultDuration} not allowed (${durations.join(", ")})`).toContain(m.defaultDuration);
    expect(snapDuration(m, m.defaultDuration)).toBe(m.defaultDuration);
    for (const d of durations) {
      expect(Number.isInteger(d), `${m.id} duration ${d}`).toBe(true);
      expect(d).toBeGreaterThan(0);
    }
    if ("options" in m.durations) {
      expect(m.durations.options).toEqual([...m.durations.options].sort((a, b) => a - b));
      expect(new Set(m.durations.options).size).toBe(m.durations.options.length);
    } else {
      expect(m.durations.min).toBeGreaterThan(0);
      expect(m.durations.max).toBeGreaterThanOrEqual(m.durations.min);
      if (m.durations.step !== undefined) {
        expect(m.durations.step, `${m.id} durations.step`).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(m.durations.step)).toBe(true);
      }
      expect(durations[0]).toBe(m.durations.min);
      expect(durations.at(-1)).toBeLessThanOrEqual(m.durations.max);
    }
    expect(m.caps.textToVideo || m.caps.imageToVideo || m.caps.motionControl || m.caps.videoEdit, `${m.id} can generate nothing`).toBe(true);
    if (m.caps.videoEdit) {
      expect(Boolean(m.caps.textToVideo || m.caps.imageToVideo || m.caps.motionControl), `${m.id} edits and generates`).toBe(false);
      const { minSec, maxSec } = m.editSource ?? {};
      if (minSec !== undefined && maxSec !== undefined) expect(maxSec).toBeGreaterThan(minSec);
      if (m.editSource?.truncates) expect(maxSec, `${m.id} truncates without a maxSec`).toBeDefined();
    }
    if (m.caps.lastFrame) expect(m.caps.imageToVideo, `${m.id} lastFrame without imageToVideo`).toBe(true);
  });

  it("snapDuration picks the nearest allowed value and never leaves the range", () => {
    const seedance = findVideoModel("bytedance/seedance-2.5");
    const veo = findVideoModel("google/veo-3.1");
    if (!seedance || !veo) throw new Error("catalog changed");
    expect(snapDuration(seedance, 7.4)).toBe(7);
    expect(snapDuration(seedance, 0)).toBe(seedance.durations && "min" in seedance.durations ? seedance.durations.min : 4);
    expect(snapDuration(seedance, 999)).toBe(30);
    expect(snapDuration(veo, 5)).toBe(4); // ties resolve to the first listed option
    expect(snapDuration(veo, 7.5)).toBe(8);
  });
});

describe("estimateVideoCost", () => {
  it("takes the no-audio price only when the sound is off", () => {
    const kling = findVideoModel("kwaivgi/kling-v3.0-pro");
    if (!kling) throw new Error("catalog changed");
    expect(estimateVideoCost(kling, 5, "720p", false)).toBeCloseTo(0.56);
    expect(estimateVideoCost(kling, 5, "720p", true)).toBeCloseTo(0.84);
    expect(estimateVideoCost(kling, 5, "720p")).toBeCloseTo(0.84);
  });
});

describe("video editing", () => {
  it("the default editor exists, is visible and runs on both providers", () => {
    const m = findVideoModel(DEFAULT_VIDEO_EDIT_MODEL);
    expect(m?.caps.videoEdit).toBe(true);
    expect(m?.hidden).toBeFalsy();
    expect(m?.offOpenRouter).toBeFalsy();
    expect(m?.fal?.edit).toBeTruthy();
  });

  it("an edit is as long as its source, or as much of it as the model keeps", () => {
    const flux = findVideoModel("black-forest-labs/flux-video-edit");
    const grok = findVideoModel("fal/grok-imagine-edit");
    if (!flux || !grok) throw new Error("catalog changed");
    expect(editedLength(flux, 12.4)).toBe(12.4);
    expect(editedLength(grok, 12.4)).toBe(8);
    expect(editedLength(grok, 5)).toBe(5);
  });

  it("applies the provider's minimum charge (Runway Aleph 2: $0.56)", () => {
    const aleph = findVideoModel("runway/aleph-2");
    if (!aleph) throw new Error("catalog changed");
    expect(estimateVideoCost(aleph, 1)).toBeCloseTo(0.56);
    expect(estimateVideoCost(aleph, 10)).toBeCloseTo(2.8);
  });
});

describe("video models (hidden)", () => {
  it("are unusable from the UI and carry no cost table, so they are not priced", () => {
    expect(HIDDEN_VIDEO.length).toBeGreaterThan(0);
    for (const m of HIDDEN_VIDEO) {
      expect(m.caps.textToVideo || m.caps.imageToVideo, `${m.id} is hidden but generates from text/image`).toBe(false);
      expect(allowedDurations(m)).toContain(m.defaultDuration);
      if (m.defaultResolution !== undefined) expect(m.resolutions).toContain(m.defaultResolution);
      // Hidden entries list resolutions without prices (empty estCostPerSecUsd); the estimate must degrade to undefined, not NaN.
      expect(estimateVideoCost(m, m.defaultDuration)).toBeUndefined();
    }
  });
});

describe("fal routes", () => {
  it("every fal-only model has a route, and every route covers what the model offers", () => {
    for (const m of IMAGE_MODELS) {
      // GPT Image 2.6 and Seedream 5.5 are only on APIMart, GPT Image 2.6 Economy only on kie.ai.
      if (m.offOpenRouter) {
        expect(m.fal ?? m.kie ?? m.apimart, `${m.id} is off OpenRouter without a route`).toBeDefined();
        expect(m.endpoint).toBe("fal");
      }
      if (!m.fal) continue;
      if (m.caps.textToImage) expect(m.fal.textToImage, `${m.id} text-to-image endpoint`).toBeTruthy();
      if (m.caps.imageToImage) expect(m.fal.edit, `${m.id} edit endpoint`).toBeTruthy();
    }
    for (const m of VIDEO_MODELS.filter((v) => !v.hidden)) {
      // PixVerse 6 Max is only on kie.ai and APIMart.
      if (m.offOpenRouter) expect(m.fal ?? m.kie ?? m.apimart, `${m.id} is off OpenRouter without a route`).toBeDefined();
      if (!m.fal) continue;
      if (m.caps.motionControl) {
        expect(m.fal.motionControl, `${m.id} motion-control endpoint`).toBeTruthy();
        expect(m.offOpenRouter).toBe(true);
        continue;
      }
      if (m.caps.videoEdit) {
        expect(m.fal.edit, `${m.id} video-edit endpoint`).toBeTruthy();
        if (m.fal.resolutions) for (const r of m.resolutions) expect(m.fal.resolutions[r], `${m.id} has no fal value for ${r}`).toBeTruthy();
        continue;
      }
      if (m.caps.textToVideo) expect(m.fal.textToVideo, `${m.id} text-to-video endpoint`).toBeTruthy();
      if (m.caps.imageToVideo) expect(m.fal.imageToVideo, `${m.id} image-to-video endpoint`).toBeTruthy();
      if (m.caps.lastFrame) expect(m.fal.endImage || Boolean(m.fal.firstLastFrameToVideo), `${m.id} last frame on fal`).toBe(true);
      if (m.caps.audio && m.offOpenRouter) expect(m.fal.audio, `${m.id} audio field`).toBeTruthy();
      if (m.fal.resolutions) for (const r of m.resolutions) expect(m.fal.resolutions[r], `${m.id} has no fal value for ${r}`).toBeTruthy();
    }
  });

  it("Seedream 5.5 has an APIMart route and no other", () => {
    const m = findImageModel("bytedance/seedream-5.5");
    expect(m?.apimart).toEqual({ family: "seedream", model: "seedream-5.5" });
    expect(m?.offOpenRouter).toBe(true);
    expect(m?.fal ?? m?.kie ?? m?.revana).toBeUndefined();
  });

  it("GPT Image 2.6 Economy has a kie.ai route and no other, and is not verified", () => {
    const m = findImageModel("openai/gpt-image-2.6-economy");
    expect(m?.kie).toEqual({ family: "gpt-image-economy", model: "gpt-image-2-6/economy-text-to-image", editModel: "gpt-image-2-6/economy-image-to-image" });
    expect(m?.offOpenRouter).toBe(true);
    expect(m?.verified).toBe(false);
    expect(m?.fal ?? m?.apimart ?? m?.revana).toBeUndefined();
  });
});
