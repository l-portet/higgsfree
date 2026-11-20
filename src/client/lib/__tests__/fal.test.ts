/** fal request builders, provider choice, and the client's guards. */
import { describe, expect, it, vi } from "vitest";
import { findImageModel, findVideoModel } from "@shared/models";
import type { ImageModel, VideoModel } from "@shared/types";
import { ApiClientError } from "../errors";
import * as fal from "../fal";
import { quoteImage } from "../image-cost";
import { buildFalImagePayload, buildFalVideoPayload, falScaledSize } from "../fal-payloads";
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
    expect(modelProviders(image("krea/krea-2-medium-turbo"))).toEqual(["openrouter"]);
    expect(modelProviders(image("google/gemini-3-pro-image"))).toEqual(["openrouter", "fal", "kie", "apimart", "revana", "replicate"]);
    expect(modelProviders(video("fal/kling-v3-pro-motion-control"))).toEqual(["fal"]);
    expect(modelProviders(video("fal/vidu-q4"))).toEqual(["fal", "kie", "apimart", "revana"]);
    expect(modelProviders(video("kwaivgi/kling-video-o1"))).toEqual(["openrouter", "apimart", "revana"]);
    expect(modelProviders(video("google/gemini-omni-flash-1.2"))).toEqual(["fal", "kie", "apimart", "replicate"]);
    expect(modelProviders(video("pixverse/pixverse-v6-max"))).toEqual(["fal", "kie", "apimart", "revana", "replicate"]);
    expect(modelProviders(video("bytedance/seedance-1-5-pro"))).toEqual(["apimart"]);
    expect(modelProviders(image("openai/gpt-image-2.6-flare"))).toEqual(["openrouter", "fal", "kie", "apimart"]);
    expect(modelProviders(image("openai/gpt-image-2.6-sunburst"))).toEqual(["openrouter", "fal", "kie", "apimart"]);
    expect(modelProviders(image("openai/gpt-image-2.6-economy"))).toEqual(["kie"]);
    expect(modelProviders(image("bytedance-seed/seedream-5-5"))).toEqual(["openrouter", "fal", "kie", "apimart"]);
    expect(modelProviders(image("minimax/minimax-h3-image"))).toEqual(["openrouter", "fal", "kie", "apimart"]);
    expect(modelProviders(image("fal/kling-image-v4"))).toEqual(["fal", "kie"]);
    expect(modelProviders(image("fal/ideogram-4.6"))).toEqual(["fal"]);
    expect(modelProviders(image("microsoft/mai-image-2.7"))).toEqual(["openrouter", "fal"]);
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
    expect(providerNotice(image("krea/krea-2-medium-turbo"), { openrouter: false, fal: true })).toBe("Krea 2 Turbo runs on OpenRouter. Add an OpenRouter key in Settings to use it.");
    expect(providerNotice(video("kwaivgi/kling-v3.0-pro"), { openrouter: false, fal: false })).toBe("Kling 3.0 Pro needs an OpenRouter, fal, kie.ai, APIMart or Replicate key. Add one in Settings to use it.");
    expect(providerNotice(video("fal/vidu-q4"), { openrouter: true })).toBe("Vidu Q4 needs a fal, kie.ai, APIMart or Revana key. Add one in Settings to use it.");
    expect(providerNotice(video("bytedance/seedance-1-5-pro"), { openrouter: true, fal: true })).toBe("Seedance 1.5 Pro runs on APIMart. Add an APIMart key in Settings to use it.");
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

  it.each(["flare", "sunburst"])("GPT Image 2.6 %s: a preset or an explicit size, references as `image_urls` on the edit endpoint", (tier) => {
    const m = image(`openai/gpt-image-2.6-${tier}`);
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "16:9", size: "1K" }, [])).toEqual({
      endpoint: `openai/gpt-image-2.6/${tier}/text-to-image`,
      input: { prompt: "p", image_size: "landscape_16_9" },
    });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "21:9", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: { width: 1536, height: 640 } });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "auto", size: "1K" }, ["data:a", "data:b"])).toEqual({
      endpoint: `openai/gpt-image-2.6/${tier}/edit`,
      input: { prompt: "p", image_urls: ["data:a", "data:b"] },
    });
  });

  it("MiniMax H3 Image: the ratio and the size in one explicit `image_size`, square for `auto` without references", () => {
    const h3 = image("minimax/minimax-h3-image");
    expect(buildFalImagePayload(h3, { prompt: "p", aspectRatio: "16:9", size: "1K" }, [])).toEqual({
      endpoint: "minimax/h3-image/text-to-image",
      input: { prompt: "p", image_size: { width: 1344, height: 768 } },
    });
    expect(buildFalImagePayload(h3, { prompt: "p", aspectRatio: "auto", size: "2K" }, []).input).toEqual({ prompt: "p", image_size: { width: 2048, height: 2048 } });
    expect(buildFalImagePayload(h3, { prompt: "p", aspectRatio: "21:9", size: "4K" }, []).input).toEqual({ prompt: "p", image_size: { width: 6272, height: 2688 } });
    expect(buildFalImagePayload(h3, { prompt: "p", aspectRatio: "9:16", size: "4K" }, ["data:a"])).toEqual({
      endpoint: "minimax/h3-image/edit",
      input: { prompt: "p", image_urls: ["data:a"], image_size: { width: 3072, height: 5440 } },
    });
    // With references, `auto` is fal's: the first reference's ratio, about 2K.
    expect(buildFalImagePayload(h3, { prompt: "p", aspectRatio: "auto", size: "4K" }, ["data:a", "data:b"]).input).toEqual({ prompt: "p", image_urls: ["data:a", "data:b"] });
  });

  it("MiniMax H3 Image: priced on neither OpenRouter nor fal, so OpenRouter runs it when its key is there (and no kie.ai key)", () => {
    const h3 = image("minimax/minimax-h3-image");
    const req = { aspectRatio: "16:9" as const, size: "4K" as const, count: 1, references: 2 };
    // kie.ai prices it ((5.5 + 2 × 0.5) credits at 4K with two references), but has no key here; APIMart bills it in tokens.
    expect(quoteImage(h3, req, { openrouter: true, fal: true })).toEqual({
      quotes: [
        { provider: "openrouter", noKey: false },
        { provider: "fal", noKey: false },
        { provider: "kie", noKey: true, usd: expect.closeTo(0.0325) },
        { provider: "apimart", noKey: true },
      ],
      provider: "openrouter",
      reason: "unpriced",
    });
    expect(quoteImage(h3, req, { fal: true })).toMatchObject({ provider: "fal", reason: "one-ready" });
  });

  it("MiniMax H3 Image: every ratio and size it offers is within fal's limits (1:3 to 3:1, 655,360 px to 20 MP, sides 468 to 7745)", () => {
    const h3 = image("minimax/minimax-h3-image");
    for (const ar of h3.aspectRatios.filter((a) => a !== "auto")) {
      for (const size of h3.sizes) {
        const { width, height } = falScaledSize(ar, size);
        expect(width * height, `${ar} ${size}`).toBeGreaterThanOrEqual(655_360);
        expect(width * height, `${ar} ${size}`).toBeLessThanOrEqual(20_000_000);
        expect(Math.min(width, height), `${ar} ${size}`).toBeGreaterThanOrEqual(468);
        expect(Math.max(width, height), `${ar} ${size}`).toBeLessThanOrEqual(7745);
        expect(Math.max(width, height) / Math.min(width, height), `${ar} ${size}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("MAI-Image-2.7: every ratio as one of fal's seven `image_size` presets, none for `auto`, no `resolution`", () => {
    const m = image("microsoft/mai-image-2.7");
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "16:9", size: "1K" }, [])).toEqual({
      endpoint: "microsoft/mai-image-2.7/text-to-image",
      input: { prompt: "p", image_size: "landscape_16_9" },
    });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "3:2", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: "landscape_3_2" });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "2:3", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: "portrait_3_2" });
    // `auto`: fal's default (square) without references, a size close to the first reference with them.
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "auto", size: "1K" }, []).input).toEqual({ prompt: "p" });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "auto", size: "1K" }, ["data:a", "data:b"])).toEqual({
      endpoint: "microsoft/mai-image-2.7/edit",
      input: { prompt: "p", image_urls: ["data:a", "data:b"] },
    });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "9:16", size: "1K" }, ["data:a"]).input).toEqual({ prompt: "p", image_urls: ["data:a"], image_size: "portrait_16_9" });
    // fal's presets (read 18 Nov 2026). A custom size must be at least 768 px a side, which the app's fallback for 21:9 (1536×640) is not.
    const presets = ["square_hd", "portrait_4_3", "landscape_4_3", "portrait_3_2", "landscape_3_2", "portrait_16_9", "landscape_16_9"];
    for (const ar of m.aspectRatios.filter((a) => a !== "auto")) {
      expect(presets, ar).toContain(buildFalImagePayload(m, { prompt: "p", aspectRatio: ar, size: "1K" }, []).input.image_size);
    }
  });

  it("MAI-Image-2.7: priced on neither OpenRouter nor fal, so OpenRouter runs it when its key is there", () => {
    const m = image("microsoft/mai-image-2.7");
    const req = { aspectRatio: "4:3" as const, size: "1K" as const, count: 1, references: 3 };
    expect(quoteImage(m, req, { openrouter: true, fal: true })).toEqual({
      quotes: [
        { provider: "openrouter", noKey: false },
        { provider: "fal", noKey: false },
      ],
      provider: "openrouter",
      reason: "unpriced",
    });
    expect(quoteImage(m, req, { fal: true })).toMatchObject({ provider: "fal", reason: "one-ready" });
  });

  it("Ideogram 4.6: a preset or an explicit ~1 MP `image_size`, none for `auto`, the image to edit as `image_url`", () => {
    const m = image("fal/ideogram-4.6");
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "16:9", size: "1K" }, [])).toEqual({
      endpoint: "ideogram/v4.6",
      input: { prompt: "p", image_size: "landscape_16_9" },
    });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "21:9", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: { width: 1536, height: 640 } });
    // `auto`: fal's own (about 2K) without a reference, the source's size with one.
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "auto", size: "1K" }, []).input).toEqual({ prompt: "p" });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "auto", size: "1K" }, ["data:a"])).toEqual({
      endpoint: "ideogram/v4.6/edit",
      input: { prompt: "p", image_url: "data:a" },
    });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "3:4", size: "1K" }, ["data:a"]).input).toEqual({ prompt: "p", image_url: "data:a", image_size: "portrait_4_3" });
    // fal's rules for an explicit size (read 20 Nov 2026): multiples of 32, 256 to 4096 a side, 1:6 to 6:1, and every
    // size at most 2048 × 2048 in area, where fal's higher price starts.
    const presets = ["square_hd", "portrait_4_3", "landscape_4_3", "portrait_16_9", "landscape_16_9"];
    for (const ar of m.aspectRatios.filter((a) => a !== "auto")) {
      const size = buildFalImagePayload(m, { prompt: "p", aspectRatio: ar, size: "1K" }, []).input.image_size;
      if (typeof size === "string") {
        expect(presets, ar).toContain(size);
        continue;
      }
      const { width, height } = size as { width: number; height: number };
      for (const side of [width, height]) {
        expect(side % 32, ar).toBe(0);
        expect(side, ar).toBeGreaterThanOrEqual(256);
        expect(side, ar).toBeLessThanOrEqual(4096);
      }
      expect(Math.max(width, height) / Math.min(width, height), ar).toBeLessThanOrEqual(6);
      expect(width * height, ar).toBeLessThanOrEqual(2048 * 2048);
    }
  });

  it("Ideogram 4.6: runs on fal only, at $0.06 an image (medium, up to 2K)", () => {
    const m = image("fal/ideogram-4.6");
    const req = { aspectRatio: "16:9" as const, size: "1K" as const, count: 2, references: 1 };
    expect(quoteImage(m, req, { fal: true })).toEqual({
      quotes: [{ provider: "fal", noKey: false, usd: expect.closeTo(0.12) }],
      provider: "fal",
      reason: "only",
    });
    expect(quoteImage(m, req, { openrouter: true, kie: true, apimart: true, revana: true, replicate: true })).toMatchObject({ reason: "none" });
  });

  it("Seedream 5.5: the ratio and the size in one explicit `image_size`, and fal's own `auto_1K` / `auto_2K` for `auto`", () => {
    const m = image("bytedance-seed/seedream-5-5");
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "16:9", size: "2K" }, [])).toEqual({
      endpoint: "bytedance/seedream/v5.5/text-to-image",
      input: { prompt: "p", image_size: { width: 2752, height: 1536 } },
    });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "4:5", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: { width: 896, height: 1152 } });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "auto", size: "1K" }, []).input).toEqual({ prompt: "p", image_size: "auto_1K" });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "auto", size: "2K" }, ["data:a", "data:b"])).toEqual({
      endpoint: "bytedance/seedream/v5.5/edit",
      input: { prompt: "p", image_urls: ["data:a", "data:b"], image_size: "auto_2K" },
    });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "21:9", size: "1K" }, ["data:a"]).input).toEqual({ prompt: "p", image_urls: ["data:a"], image_size: { width: 1536, height: 640 } });
  });

  it("Seedream 5.5: every ratio and size it offers is within fal's limits (921,600 to 4,624,220 px), and 1K stays in fal's lower price tier", () => {
    const m = image("bytedance-seed/seedream-5-5");
    for (const ar of m.aspectRatios.filter((a) => a !== "auto")) {
      for (const size of m.sizes) {
        const { width, height } = falScaledSize(ar, size);
        expect(width * height, `${ar} ${size}`).toBeGreaterThanOrEqual(921_600);
        expect(width * height, `${ar} ${size}`).toBeLessThanOrEqual(4_624_220);
        // fal bills up to 2.61 MP at its 1K rate, and above that at its 2K one.
        expect(width * height > 2_610_000, `${ar} ${size}`).toBe(size === "2K");
      }
    }
  });

  it("Seedream 5.5: the cheapest provider with a key runs it, each reference image counted", () => {
    const m = image("bytedance-seed/seedream-5-5");
    const req = { aspectRatio: "16:9" as const, size: "2K" as const, count: 1, references: 2 };
    const all = quoteImage(m, req, { openrouter: true, fal: true, kie: true, apimart: true });
    expect(all).toMatchObject({ provider: "apimart", reason: "cheaper" });
    expect(all.quotes.map((q) => q.provider)).toEqual(["openrouter", "fal", "kie", "apimart"]);
    expect(all.quotes[0]?.usd).toBeCloseTo(0.035 + 2 * 0.008);
    expect(all.quotes[1]?.usd).toBeCloseTo(0.0405 + 2 * 0.012);
    expect(all.quotes[2]?.usd).toBeCloseTo((6.3 + 2 * 1.44) * 0.005);
    expect(all.quotes[3]?.usd).toBeCloseTo(0.02275 + 2 * 0.0052);
    expect(quoteImage(m, req, { openrouter: true, fal: true, kie: true })).toMatchObject({ provider: "kie", reason: "cheaper" });
    expect(quoteImage(m, req, { openrouter: true, fal: true })).toMatchObject({ provider: "openrouter", reason: "cheaper" });
    expect(quoteImage(m, req, { fal: true })).toMatchObject({ provider: "fal", reason: "one-ready" });
    // kie.ai and APIMart have no 4:5: OpenRouter runs it.
    const portrait = quoteImage(m, { ...req, aspectRatio: "4:5" }, { openrouter: true, kie: true, apimart: true });
    expect(portrait).toMatchObject({ provider: "openrouter", reason: "one-ready" });
    expect(portrait.quotes[2]?.refusal).toBe("Takes no 4:5");
  });
});

describe("buildFalVideoPayload", () => {
  it("Kling Image 4.0: `aspect_ratio` and `resolution` (2K or 4K), references as `image_urls` on image-to-image", () => {
    const m = image("fal/kling-image-v4");
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "16:9", size: "2K" }, [])).toEqual({
      endpoint: "kling/v4/text-to-image",
      input: { prompt: "p", aspect_ratio: "16:9", resolution: "2K" },
    });
    // `auto` is fal's default: no ratio goes out.
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "auto", size: "4K" }, []).input).toEqual({ prompt: "p", resolution: "4K" });
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "21:9", size: "4K" }, ["data:a", "data:b"])).toEqual({
      endpoint: "kling/v4/image-to-image",
      input: { prompt: "p", image_urls: ["data:a", "data:b"], aspect_ratio: "21:9", resolution: "4K" },
    });
    // A ratio or a size it does not offer is never sent: fal has no 4:5 and no 1K.
    expect(buildFalImagePayload(m, { prompt: "p", aspectRatio: "4:5", size: "1K" }, []).input).toEqual({ prompt: "p" });
  });

  it("Kling Image 4.0: on fal (priced at 2K, not at 4K) and kie.ai; with a fal key only, fal runs it", () => {
    const m = image("fal/kling-image-v4");
    const req = { aspectRatio: "16:9" as const, size: "2K" as const, count: 2, references: 1 };
    // kie.ai prices it ((11.3 + 0.5) credits at 2K, (17 + 0.5) at 4K, with one reference), but has no key here.
    expect(quoteImage(m, req, { fal: true })).toEqual({
      quotes: [{ provider: "fal", noKey: false, usd: expect.closeTo(0.126) }, { provider: "kie", noKey: true, usd: expect.closeTo(0.118) }],
      provider: "fal",
      reason: "one-ready",
    });
    expect(quoteImage(m, { ...req, size: "4K" }, { fal: true })).toEqual({
      quotes: [{ provider: "fal", noKey: false }, { provider: "kie", noKey: true, usd: expect.closeTo(0.175) }],
      provider: "fal",
      reason: "one-ready",
    });
    expect(quoteImage(m, req, { openrouter: true, apimart: true, revana: true, replicate: true })).toMatchObject({ reason: "none" });
  });

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

  it("Gemini Omni Flash 1.2: the length up to 15 s, the ratio with a frame too, and no more than 10 s between two frames", () => {
    const m = video("google/gemini-omni-flash-1.2");
    expect(buildFalVideoPayload(m, { prompt: "p", duration: 15, resolution: "4K", aspectRatio: "9:16" }, {})).toEqual({
      endpoint: "google/gemini-omni-flash/v1.2/text-to-video",
      input: { prompt: "p", duration: 15, aspect_ratio: "9:16", resolution: "4k" },
      params: { duration: 15, aspectRatio: "9:16", resolution: "4K" },
    });
    expect(buildFalVideoPayload(m, { prompt: "p", duration: 15, aspectRatio: "16:9" }, { firstFrame: "data:f" })).toMatchObject({
      endpoint: "google/gemini-omni-flash/v1.2/image-to-video",
      input: { prompt: "p", duration: 15, image_url: "data:f", aspect_ratio: "16:9", resolution: "720p" },
    });
    expect(buildFalVideoPayload(m, { prompt: "p", duration: 10 }, { firstFrame: "data:f", lastFrame: "data:l" }).input).toEqual({
      prompt: "p", duration: 10, image_url: "data:f", end_image_url: "data:l", resolution: "720p",
    });
    expect(() => buildFalVideoPayload(m, { prompt: "p", duration: 11 }, { firstFrame: "data:f", lastFrame: "data:l" })).toThrow("Takes clips of up to 10 s between two frames");
  });

  it("PixVerse 6 Max: PixVerse 6's fields on its own `pixverse/v6/max` endpoints, a first frame only", () => {
    const m = video("pixverse/pixverse-v6-max");
    expect(buildFalVideoPayload(m, { prompt: "p", duration: 15, resolution: "1080p", aspectRatio: "2:3", audio: false }, {})).toEqual({
      endpoint: "pixverse/v6/max/text-to-video",
      input: { prompt: "p", duration: 15, aspect_ratio: "2:3", resolution: "1080p", generate_audio_switch: false },
      params: { duration: 15, aspectRatio: "2:3", resolution: "1080p", audio: false },
    });
    expect(buildFalVideoPayload(m, { prompt: "p", duration: 5, aspectRatio: "16:9", audio: true }, { firstFrame: "data:f" })).toEqual({
      endpoint: "pixverse/v6/max/image-to-video",
      input: { prompt: "p", duration: 5, image_url: "data:f", resolution: "720p", generate_audio_switch: true },
      params: { duration: 5, resolution: "720p", audio: true },
    });
    expect(() => buildFalVideoPayload(m, { prompt: "p", duration: 5 }, { firstFrame: "data:f", lastFrame: "data:l" })).toThrow("does not take a last frame");
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
    expect(buildFalVideoPayload(video("fal/gemini-omni-flash-1.2-edit"), { prompt: "make it snow", duration: 5, resolution: "1080p" }, { sourceVideo: "u" })).toEqual({
      endpoint: "google/gemini-omni-flash/v1.2/edit",
      input: { prompt: "make it snow", video_url: "u", resolution: "1080p" },
      params: { duration: 0, resolution: "1080p" },
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
