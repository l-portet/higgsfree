import { describe, expect, it } from "vitest";
import { findImageModel, findVideoModel, snapDuration } from "@shared/models";
import { buildImagePayload, buildVideoEditPayload, buildVideoPayload } from "../payloads";

const must = <T>(v: T | undefined, label: string): T => {
  if (!v) throw new Error(`${label} missing from catalog`);
  return v;
};
const DATA_A = "data:image/png;base64,AAAA";
const DATA_B = "data:image/jpeg;base64,BBBB";

describe("buildImagePayload (chat endpoint)", () => {
  const nanoPro = must(findImageModel("google/gemini-3-pro-image"), "gemini-3-pro-image");
  const nano = must(findImageModel("google/gemini-2.5-flash-image"), "gemini-2.5-flash-image");

  it("text-to-image sends a string content, modalities and image_config", () => {
    const p = buildImagePayload(nanoPro, { prompt: "a cat", aspectRatio: "9:16", size: "2K" }, []);
    expect(p.endpoint).toBe("chat");
    if (p.endpoint !== "chat") return;
    expect(p.body).toEqual({
      model: "google/gemini-3-pro-image",
      messages: [{ role: "user", content: "a cat" }],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "9:16", image_size: "2K" },
      usage: { include: true },
    });
  });

  it("omits aspect_ratio when the user picked auto", () => {
    const p = buildImagePayload(nanoPro, { prompt: "x", aspectRatio: "auto", size: "1K" }, []);
    if (p.endpoint !== "chat") throw new Error("expected chat");
    expect(p.body.image_config).toEqual({ image_size: "1K" });
    expect(p.body.image_config).not.toHaveProperty("aspect_ratio");
  });

  it("sends image_size only when the catalog says supportsImageSize", () => {
    expect(nano.supportsImageSize).toBe(false);
    const p = buildImagePayload(nano, { prompt: "x", aspectRatio: "1:1", size: "1K" }, []);
    if (p.endpoint !== "chat") throw new Error("expected chat");
    expect(p.body.image_config).toEqual({ aspect_ratio: "1:1" });
  });

  it("drops image_config entirely when nothing applies (auto + no image_size)", () => {
    const p = buildImagePayload(nano, { prompt: "x", aspectRatio: "auto", size: "1K" }, []);
    if (p.endpoint !== "chat") throw new Error("expected chat");
    expect(p.body).not.toHaveProperty("image_config");
  });

  it("image-to-image uses a content array of text + image_url parts", () => {
    const p = buildImagePayload(nanoPro, { prompt: "make it night", aspectRatio: "auto", size: "1K" }, [DATA_A, DATA_B]);
    if (p.endpoint !== "chat") throw new Error("expected chat");
    expect(p.body.messages[0].content).toEqual([
      { type: "text", text: "make it night" },
      { type: "image_url", image_url: { url: DATA_A } },
      { type: "image_url", image_url: { url: DATA_B } },
    ]);
  });
});

describe("buildImagePayload (images endpoint)", () => {
  const krea = must(findImageModel("krea/krea-2-large"), "krea-2-large");
  const gptImage2 = must(findImageModel("openai/gpt-image-2"), "gpt-image-2");

  it("Krea gets the minimal { model, prompt } body", () => {
    const p = buildImagePayload(krea, { prompt: "a street", aspectRatio: "1:1", size: "1K" }, []);
    expect(p).toEqual({ endpoint: "images", body: { model: "krea/krea-2-large", prompt: "a street" } });
  });

  it("gpt-image-2 maps aspect ratio to size and omits it on auto", () => {
    const a = buildImagePayload(gptImage2, { prompt: "p", aspectRatio: "2:3", size: "1K" }, []);
    expect(a.body).toMatchObject({ size: "1024x1536" });
    const b = buildImagePayload(gptImage2, { prompt: "p", aspectRatio: "auto", size: "1K" }, []);
    expect(b.body).not.toHaveProperty("size");
  });

  it("gpt-image-2 edits send image[] and input_fidelity: high", () => {
    const p = buildImagePayload(gptImage2, { prompt: "edit", aspectRatio: "1:1", size: "1K" }, [DATA_A]);
    expect(p.body).toEqual({ model: "openai/gpt-image-2", prompt: "edit", size: "1024x1024", image: [DATA_A], input_fidelity: "high" });
  });
});

describe("buildVideoPayload", () => {
  const seedance = must(findVideoModel("bytedance/seedance-2.5"), "seedance-2.5");
  const kling = must(findVideoModel("kwaivgi/kling-v3.0-pro"), "kling-v3.0-pro");
  const hailuo = must(findVideoModel("minimax/hailuo-3"), "hailuo-3");
  const veo = must(findVideoModel("google/veo-3.1"), "veo-3.1");

  it("text-to-video sends aspect_ratio + listed resolution, no frame_images", () => {
    const { body, effective } = buildVideoPayload(seedance, { prompt: "waves", duration: 5, aspectRatio: "9:16", resolution: "720p" }, {});
    expect(body).toEqual({ model: "bytedance/seedance-2.5", prompt: "waves", duration: 5, aspect_ratio: "9:16", resolution: "720p" });
    expect(effective).toEqual({ duration: 5, aspectRatio: "9:16", resolution: "720p" });
  });

  it("image-to-video uses frame_images with frame_type and NO top-level image", () => {
    const { body } = buildVideoPayload(kling, { prompt: "slow zoom", duration: 5, aspectRatio: "9:16" }, { firstFrame: DATA_A, lastFrame: DATA_B });
    expect(body.frame_images).toEqual([
      { type: "image_url", image_url: { url: DATA_A }, frame_type: "first_frame" },
      { type: "image_url", image_url: { url: DATA_B }, frame_type: "last_frame" },
    ]);
    expect(body).not.toHaveProperty("image");
    // Kling keeps aspect_ratio on i2v
    expect(body.aspect_ratio).toBe("9:16");
  });

  it("omits aspect_ratio for Seedance image-to-video (omitAspectRatioOnI2v)", () => {
    const { body, effective } = buildVideoPayload(seedance, { prompt: "p", duration: 5, aspectRatio: "9:16", resolution: "720p" }, { firstFrame: DATA_A });
    expect(body).not.toHaveProperty("aspect_ratio");
    expect(body.frame_images).toHaveLength(1);
    expect(effective.aspectRatio).toBeUndefined();
    // still sends aspect_ratio for Seedance text-to-video
    expect(buildVideoPayload(seedance, { prompt: "p", duration: 5, aspectRatio: "9:16" }, {}).body.aspect_ratio).toBe("9:16");
  });

  it("only sends resolution when the model lists it (Hailuo 3 → 2K)", () => {
    const { body } = buildVideoPayload(hailuo, { prompt: "p", duration: 5, aspectRatio: "9:16", resolution: "1080p" }, {});
    expect(body.resolution).toBe("2K");
    const none = buildVideoPayload({ ...hailuo, resolutions: [], defaultResolution: undefined }, { prompt: "p", duration: 5, resolution: "1080p" }, {});
    expect(none.body).not.toHaveProperty("resolution");
  });

  it("falls back to the model default resolution when none is requested", () => {
    expect(buildVideoPayload(seedance, { prompt: "p", duration: 5 }, {}).body.resolution).toBe("720p");
  });

  it("input_references carry style refs without frame_type", () => {
    const { body } = buildVideoPayload(seedance, { prompt: "p", duration: 5 }, {}, [DATA_A]);
    expect(body.input_references).toEqual([{ type: "image_url", image_url: { url: DATA_A } }]);
    expect(body).not.toHaveProperty("frame_images");
  });

  it("sends generate_audio only for audio-capable models and only when the user chose", () => {
    expect(seedance.caps.audio).toBe(true);
    expect(buildVideoPayload(seedance, { prompt: "p", duration: 5, audio: false }, {}).body.generate_audio).toBe(false);
    expect(buildVideoPayload(seedance, { prompt: "p", duration: 5, audio: true }, {}).body.generate_audio).toBe(true);
    expect(buildVideoPayload(seedance, { prompt: "p", duration: 5 }, {}).body).not.toHaveProperty("generate_audio");
    const silent = must(findVideoModel("minimax/hailuo-3-max"), "hailuo-3-max");
    expect(silent.caps.audio).toBe(false);
    expect(buildVideoPayload(silent, { prompt: "p", duration: 5, audio: false }, {}).body).not.toHaveProperty("generate_audio");
    expect(buildVideoPayload(silent, { prompt: "p", duration: 5, audio: true }, {}).body).not.toHaveProperty("generate_audio");
    expect(kling.caps.audio).toBe(true); // OpenRouter lists generate_audio for Kling 3.0 since Oct 2026
  });

  it("snaps duration to the model's allowed values", () => {
    expect(buildVideoPayload(veo, { prompt: "p", duration: 5 }, {}).body.duration).toBe(4);
    expect(buildVideoPayload(veo, { prompt: "p", duration: 9 }, {}).body.duration).toBe(8);
    expect(buildVideoPayload(seedance, { prompt: "p", duration: 7.4 }, {}).body.duration).toBe(7);
    expect(buildVideoPayload(seedance, { prompt: "p", duration: 99 }, {}).body.duration).toBe(30);
  });
});

describe("buildVideoEditPayload", () => {
  it("sends the prompt and the source as a video reference, nothing else", () => {
    const aleph = must(findVideoModel("runway/aleph-2"), "aleph-2");
    expect(buildVideoEditPayload(aleph, "relight it at dusk", "data:video/mp4;base64,AAAA")).toEqual({
      model: "runway/aleph-2",
      prompt: "relight it at dusk",
      input_references: [{ type: "video_url", video_url: { url: "data:video/mp4;base64,AAAA" } }],
    });
  });
});

describe("snapDuration", () => {
  it("clamps ranges and snaps option lists", () => {
    const seedance = must(findVideoModel("bytedance/seedance-2.5"), "seedance-2.5");
    const hailuo23 = must(findVideoModel("minimax/hailuo-2.3"), "hailuo-2.3");
    expect(snapDuration(seedance, 0)).toBe(4);
    expect(snapDuration(seedance, 12.6)).toBe(13);
    expect(snapDuration(seedance, 31)).toBe(30);
    expect(snapDuration(hailuo23, 8)).toBe(6);
    expect(snapDuration(hailuo23, 9)).toBe(10);
  });
});
