/** Revana: the request each model gets, what it refuses, its prices, and when a run goes there. */
import { describe, expect, it } from "vitest";
import { findImageModel, findVideoModel, IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import { REVANA_MODELS } from "@shared/revana-models";
import type { ImageModel, VideoModel } from "@shared/types";
import { quoteImage } from "../image-cost";
import { buildRevanaImagePayload, buildRevanaVideoPayload } from "../revana-payloads";
import { estimateRevanaVideoCost } from "../revana-pricing";
import { quoteVideo } from "../video-cost";

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

describe("routes", () => {
  it("every Revana route names a model in the bundled list, of the same kind", () => {
    for (const m of [...IMAGE_MODELS, ...VIDEO_MODELS]) {
      if (!m.revana) continue;
      expect(REVANA_MODELS[m.revana.model]?.kind, m.id).toBe(m.kind);
    }
  });
});

describe("buildRevanaVideoPayload", () => {
  it("sends the shared input fields the model offers", () => {
    const p = buildRevanaVideoPayload(video("google/veo-3.1-fast"), { prompt: "a fox", duration: 8, resolution: "1080p", aspectRatio: "9:16", audio: true }, {});
    expect(p).toMatchObject({ model: "veo-3.1-fast", input: { prompt: "a fox", duration: 8, resolution: "1080p", aspect_ratio: "9:16", audio: true }, params: { duration: 8, resolution: "1080p", aspectRatio: "9:16", audio: true } });
  });

  it("frames go as image_url / end_image_url, an edit as video_url without a duration, Seedance 2.5's references as video_urls", () => {
    const frames = buildRevanaVideoPayload(video("alibaba/wan-3.0"), { prompt: "go", duration: 5, resolution: "720p" }, { firstFrame: "https://a", lastFrame: "https://b" });
    expect(frames.input).toMatchObject({ image_url: "https://a", end_image_url: "https://b" });
    expect(frames.input).not.toHaveProperty("aspect_ratio");
    const edit = buildRevanaVideoPayload(video("fal/wan-2.7-edit"), { prompt: "make it snow", duration: 5, resolution: "1080p" }, { sourceVideo: "https://v" });
    expect(edit.input).toEqual({ prompt: "make it snow", resolution: "1080p", video_url: "https://v" });
    const refs = buildRevanaVideoPayload(video("bytedance/seedance-2.5"), { prompt: "like video 1", duration: 5, resolution: "720p" }, { referenceVideos: ["https://v"] });
    expect(refs.input.video_urls).toEqual(["https://v"]);
  });

  it("refuses what the model does not take", () => {
    const wan = video("alibaba/wan-3.0");
    expect(() => buildRevanaVideoPayload(wan, { prompt: "x", duration: 5 }, { referenceVideos: ["https://v"] })).toThrow("Takes no reference video or audio");
    expect(() => buildRevanaVideoPayload(video("x-ai/grok-imagine-video"), { prompt: "x", duration: 5, resolution: "480p" }, {})).toThrow("Takes clips of 6–30 s");
    expect(() => buildRevanaVideoPayload(video("google/veo-3.1"), { prompt: "x", duration: 8, aspectRatio: "1:1" }, {})).toThrow("Takes no 1:1");
  });
});

describe("prices", () => {
  it("per second at the resolution, with the sound rate when it has one and the video-input rate with a video attached", () => {
    expect(estimateRevanaVideoCost(video("google/veo-3.1"), { prompt: "p", duration: 8, resolution: "1080p", audio: false })).toBeCloseTo(1.6);
    expect(estimateRevanaVideoCost(video("google/veo-3.1"), { prompt: "p", duration: 8, resolution: "1080p", audio: true })).toBeCloseTo(3.2);
    // 5 s out plus 4 s of reference in, at 720p's video-input rate.
    expect(estimateRevanaVideoCost(video("bytedance/seedance-2.5"), { prompt: "p", duration: 5, resolution: "720p", referenceVideos: true, referenceVideoSec: 4 })).toBeCloseTo(0.15 * 9);
    expect(estimateRevanaVideoCost(video("bytedance/seedance-2.5"), { prompt: "p", duration: 5, resolution: "720p", referenceVideos: true })).toBeUndefined();
    // An edit: the clip's length.
    expect(estimateRevanaVideoCost(video("fal/wan-2.7-edit"), { prompt: "p", duration: 5, resolution: "1080p", videoSec: 6 })).toBeCloseTo(0.84);
  });

  it("pictures by size", () => {
    const q = quoteImage(image("google/gemini-3-pro-image"), { aspectRatio: "1:1", size: "4K", count: 2, references: 0 }, { revana: true });
    expect(q.quotes.find((x) => x.provider === "revana")?.usd).toBeCloseTo(0.16);
    expect(buildRevanaImagePayload(image("fal/z-image-turbo"), { prompt: "p", aspectRatio: "auto", size: "1K" }, []).input).toEqual({ prompt: "p", resolution: "1K" });
  });
});

describe("routing", () => {
  it("a run goes to Revana when it is the cheapest with a key", () => {
    // MiniMax H3 at 2K, 5 s: Revana $0.20, kie.ai $0.325, APIMart ~$0.46.
    const h3 = quoteVideo(video("minimax/hailuo-3"), { prompt: "p", duration: 5, resolution: "2K" }, { kie: true, apimart: true, revana: true });
    expect(h3.provider).toBe("revana");
    // Seedance 2.0 Mini at 720p: APIMart is cheaper.
    const mini = quoteVideo(video("bytedance/seedance-2.0-mini"), { prompt: "p", duration: 5, resolution: "720p" }, { apimart: true, revana: true });
    expect(mini.provider).toBe("apimart");
  });
});
