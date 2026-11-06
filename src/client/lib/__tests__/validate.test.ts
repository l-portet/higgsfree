/** The source-video check the composer and the engine share for video editing. */
import { describe, expect, it } from "vitest";
import { findVideoModel } from "@shared/models";
import type { VideoModel } from "@shared/types";
import { sourceVideoProblem, validateVideoRequest } from "../validate";

const video = (id: string): VideoModel => {
  const m = findVideoModel(id);
  if (!m) throw new Error(`catalog has no ${id}`);
  return m;
};

describe("sourceVideoProblem", () => {
  it("names the length or size that is out of the model's limits", () => {
    const kling = video("fal/kling-o3-edit");
    expect(sourceVideoProblem(kling, 2.4, 1_000_000)).toBe("The video is 2.4 s. Kling O3 Edit needs at least 3 s.");
    expect(sourceVideoProblem(kling, 20, 1_000_000)).toBe("The video is 20 s. Kling O3 Edit takes up to 15 s.");
    expect(sourceVideoProblem(kling, 15.02, 1_000_000)).toBeUndefined(); // header rounding
    const flux = video("black-forest-labs/flux-video-edit");
    expect(sourceVideoProblem(flux, 10, 64 * 1024 * 1024)).toBe("The video is 64 MB. FLUX Video Edit takes up to 50 MB.");
    expect(sourceVideoProblem(video("fal/gemini-omni-flash-1.2-edit"), 20, 1_000_000)).toBe("The video is 20 s. Gemini Omni Flash 1.2 Edit takes up to 15 s.");
    expect(sourceVideoProblem(video("fal/gemini-omni-flash-1.2-upscale"), 20, 1_000_000)).toBe("The video is 20 s. Gemini Omni Flash 1.2 Upscale takes up to 15 s.");
  });

  it("lets through what it cannot know, and lengths a model cuts rather than refuses", () => {
    expect(sourceVideoProblem(video("fal/kling-o3-edit"), undefined, undefined)).toBeUndefined();
    expect(sourceVideoProblem(video("fal/grok-imagine-edit"), 30, 1_000_000)).toBeUndefined(); // keeps the first 8 s
    expect(sourceVideoProblem(video("fal/gemini-omni-flash-1.1-edit"), 60, 80 * 1024 * 1024)).toBeUndefined(); // no known limits
  });
});

describe("validateVideoRequest: reference videos and audio", () => {
  const req = { prompt: "p", model: "alibaba/wan-3.0", duration: 5 };
  it("takes them on models that do, up to their count, and never with frames", () => {
    const wan = video("alibaba/wan-3.0");
    expect(() => validateVideoRequest(wan, { ...req, referenceVideos: ["up_abcdefgh.mp4"], referenceAudios: ["up_abcdefgh.mp3"] }, "p")).not.toThrow();
    expect(() => validateVideoRequest(wan, { ...req, referenceAudios: Array(6).fill("up_abcdefgh.wav") }, "p")).toThrow("at most 5");
    expect(() => validateVideoRequest(wan, { ...req, referenceAudios: ["up_abcdefgh.png"] }, "p")).not.toThrow();
    expect(() => validateVideoRequest(wan, { ...req, referenceAudios: ["not-an-id"] }, "p")).toThrow("stored audio clip");
    expect(() => validateVideoRequest(wan, { ...req, firstFrame: "up_abcdefgh.png", referenceVideos: ["up_abcdefgh.mp4"] }, "p")).toThrow("do not go with frames");
  });
  it("refuses them on models that do not", () => {
    const wan27 = video("alibaba/wan-2.7");
    expect(() => validateVideoRequest(wan27, { ...req, referenceVideos: ["up_abcdefgh.mp4"] }, "p")).toThrow("does not take a reference video");
    expect(() => validateVideoRequest(wan27, { ...req, referenceAudios: ["up_abcdefgh.mp3"] }, "p")).toThrow("does not take reference audio");
  });
});
