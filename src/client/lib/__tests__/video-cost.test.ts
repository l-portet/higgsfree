/** Who runs a video, and what it costs on each provider (`quoteVideo`). */
import { describe, expect, it } from "vitest";
import { findVideoModel } from "@shared/models";
import type { VideoModel } from "@shared/types";
import { quoteVideo, shownQuote } from "../video-cost";

const video = (id: string): VideoModel => {
  const m = findVideoModel(id);
  if (!m) throw new Error(`catalog has no ${id}`);
  return m;
};
const NOW = new Date("2026-10-19T12:00:00Z");
const BOTH = { openrouter: true, fal: true };
const usd = (q: ReturnType<typeof quoteVideo>) => Object.fromEntries(q.quotes.map((x) => [x.provider, x.usd]));

describe("quoteVideo", () => {
  it("runs a video on the cheaper provider, whatever the preference", () => {
    const q = quoteVideo(video("bytedance/seedance-2.5"), { duration: 5, resolution: "720p", aspectRatio: "16:9", audio: true }, BOTH, "fal", NOW);
    expect(q).toMatchObject({ provider: "openrouter", reason: "cheaper" });
    expect(q.quotes.map((x) => x.provider)).toEqual(["openrouter", "fal", "kie", "apimart"]);
    expect(usd(q).openrouter).toBeCloseTo(1.1555);
    expect(usd(q).fal).toBeCloseTo(2.365);
    const pricier = { ...video("bytedance/seedance-2.5"), estCostPerSecUsd: { "720p": 1 } };
    expect(quoteVideo(pricier, { duration: 5, resolution: "720p" }, BOTH, "openrouter", NOW)).toMatchObject({ provider: "fal", reason: "cheaper" });
  });

  it("lets the preference decide at the same price, with the sound on or off", () => {
    const kling = video("kwaivgi/kling-v3.0-pro");
    const silent = quoteVideo(kling, { prompt: "a fox", duration: 5, audio: false }, BOTH, "fal", NOW);
    expect(silent).toMatchObject({ provider: "fal", reason: "tie" });
    expect(usd(silent)).toEqual({ openrouter: expect.closeTo(0.56), fal: expect.closeTo(0.56), kie: expect.closeTo(0.45), apimart: expect.closeTo(0.448) });
    expect(quoteVideo(kling, { duration: 5, audio: true }, BOTH, "openrouter", NOW)).toMatchObject({ provider: "openrouter", reason: "tie" });
  });

  it("goes to the provider that takes the request and has a key", () => {
    const kling = video("kwaivgi/kling-v3.0-pro");
    const refs = quoteVideo(kling, { duration: 5, references: true }, BOTH, "fal", NOW);
    expect(refs).toMatchObject({ provider: "openrouter", reason: "one-ready" });
    expect(refs.quotes[1]).toMatchObject({ provider: "fal", refusal: "Takes no style references" });
    const falOnlyKey = quoteVideo(video("bytedance/seedance-2.5"), { duration: 5, resolution: "720p" }, { openrouter: false, fal: true }, "openrouter", NOW);
    expect(falOnlyKey).toMatchObject({ provider: "fal", reason: "one-ready" });
    expect(falOnlyKey.quotes[0]).toMatchObject({ provider: "openrouter", noKey: true });
    // No key yet: nobody runs it, and the composer shows the cheapest price.
    const none = quoteVideo(video("bytedance/seedance-2.5"), { duration: 5, resolution: "720p" }, { openrouter: false, fal: false }, "fal", NOW);
    expect(none.reason).toBe("none");
    expect(none.provider).toBeUndefined();
    expect(shownQuote(none)?.provider).toBe("openrouter");
  });

  it("with a kie.ai key: the cheapest of three, and kie's refusals send the run elsewhere", () => {
    const ALL = { openrouter: true, fal: true, kie: true };
    // Veo 3.1 at 1080p, 8 s with sound: $3.20 on OpenRouter, $1.275 a clip on kie.
    const veo = quoteVideo(video("google/veo-3.1"), { prompt: "a fox", duration: 8, resolution: "1080p", audio: true }, ALL, "openrouter", NOW);
    expect(veo).toMatchObject({ provider: "kie", reason: "cheaper" });
    expect(usd(veo)).toEqual({ openrouter: expect.closeTo(3.2), kie: expect.closeTo(1.275), apimart: expect.closeTo(1) }); // APIMart has no key here
    // kie's Veo always has sound: with it off, OpenRouter runs it.
    const silent = quoteVideo(video("google/veo-3.1"), { prompt: "a fox", duration: 8, resolution: "1080p", audio: false }, ALL, "kie", NOW);
    expect(silent).toMatchObject({ provider: "openrouter", reason: "one-ready" });
    expect(silent.quotes[1]).toMatchObject({ provider: "kie", refusal: "Always adds sound" });
    // Seedance 2.5 stays cheapest on OpenRouter.
    expect(quoteVideo(video("bytedance/seedance-2.5"), { prompt: "a fox", duration: 5, resolution: "720p" }, ALL, "kie", NOW)).toMatchObject({ provider: "openrouter", reason: "cheaper" });
    // Kling 3.0 Pro without sound: $0.45 on kie against $0.56 on the other two.
    expect(quoteVideo(video("kwaivgi/kling-v3.0-pro"), { prompt: "a fox", duration: 5, audio: false }, ALL, "fal", NOW)).toMatchObject({ provider: "kie", reason: "cheaper" });
    // A tie among the cheapest goes to the preferred one if it is among them, else the first.
    const pricier = { ...video("kwaivgi/kling-v3.0-pro"), estCostPerSecNoAudioUsd: { "720p": 0.09 } };
    expect(quoteVideo(pricier, { prompt: "a fox", duration: 5, audio: false }, ALL, "kie", NOW)).toMatchObject({ provider: "kie", reason: "tie" });
    expect(quoteVideo(pricier, { prompt: "a fox", duration: 5, audio: false }, ALL, "fal", NOW)).toMatchObject({ provider: "openrouter", reason: "tie" });
  });

  it("Kling 4.0, off OpenRouter: the cheapest of fal, kie.ai and APIMart; style references skip fal", () => {
    const kling = video("fal/kling-v4");
    // 10 s at 1080p: $2.35 on fal and APIMart, $2.125 on kie.
    const q = quoteVideo(kling, { prompt: "a fox", duration: 10, resolution: "1080p", aspectRatio: "21:9" }, { fal: true, kie: true, apimart: true }, "fal", NOW);
    expect(q).toMatchObject({ provider: "kie", reason: "cheaper" });
    expect(usd(q)).toEqual({ fal: expect.closeTo(2.35), kie: expect.closeTo(2.125), apimart: expect.closeTo(2.35) });
    const refs = quoteVideo(kling, { prompt: "a fox", duration: 5, resolution: "720p", references: true }, { fal: true, apimart: true }, "fal", NOW);
    expect(refs).toMatchObject({ provider: "apimart", reason: "one-ready" });
    expect(refs.quotes[0]).toMatchObject({ provider: "fal", refusal: "Takes no style references" });
  });

  it("prices motion control and editing by the input video, once its length is known", () => {
    const motion = quoteVideo(video("fal/kling-v3-pro-motion-control"), { duration: 5, videoSec: 7.5 }, BOTH, "openrouter", NOW);
    expect(motion).toMatchObject({ provider: "fal", reason: "only" });
    expect(usd(motion)).toEqual({ fal: expect.closeTo(1.26) });
    const flux = video("black-forest-labs/flux-video-edit");
    expect(quoteVideo(flux, { duration: 5 }, BOTH, "fal", NOW)).toMatchObject({ provider: "fal", reason: "unpriced" });
    const known = quoteVideo(flux, { duration: 5, videoSec: 10 }, BOTH, "openrouter", NOW);
    expect(known).toMatchObject({ provider: "openrouter", reason: "tie" });
    expect(usd(known)).toEqual({ openrouter: expect.closeTo(0.3), fal: expect.closeTo(0.3) });
  });
});
