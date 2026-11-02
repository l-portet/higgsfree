/** Who runs a video, and what it costs on each provider (`quoteVideo`). */
import { describe, expect, it } from "vitest";
import { findVideoModel } from "@shared/models";
import type { VideoModel } from "@shared/types";
import { pinQuote, quoteVideo, shownQuote } from "../video-cost";

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
    const q = quoteVideo(video("bytedance/seedance-2.5"), { duration: 5, resolution: "720p", aspectRatio: "16:9", audio: true }, BOTH, NOW);
    expect(q).toMatchObject({ provider: "openrouter", reason: "cheaper" });
    expect(q.quotes.map((x) => x.provider)).toEqual(["openrouter", "fal", "kie", "apimart", "revana"]);
    expect(usd(q).openrouter).toBeCloseTo(1.1555);
    expect(usd(q).fal).toBeCloseTo(2.838);
    const pricier = { ...video("bytedance/seedance-2.5"), estCostPerSecUsd: { "720p": 1 } };
    expect(quoteVideo(pricier, { duration: 5, resolution: "720p" }, BOTH, NOW)).toMatchObject({ provider: "fal", reason: "cheaper" });
  });

  it("at the same price, the first in the catalog's order runs it, with the sound on or off", () => {
    const kling = video("kwaivgi/kling-v3.0-pro");
    const silent = quoteVideo(kling, { prompt: "a fox", duration: 5, audio: false }, BOTH, NOW);
    expect(silent).toMatchObject({ provider: "openrouter", reason: "tie" });
    expect(usd(silent)).toEqual({ openrouter: expect.closeTo(0.56), fal: expect.closeTo(0.56), kie: expect.closeTo(0.45), apimart: expect.closeTo(0.448) });
    expect(quoteVideo(kling, { duration: 5, audio: true }, BOTH, NOW)).toMatchObject({ provider: "openrouter", reason: "tie" });
  });

  it("goes to the provider that takes the request and has a key", () => {
    const kling = video("kwaivgi/kling-v3.0-pro");
    const refs = quoteVideo(kling, { duration: 5, references: true }, BOTH, NOW);
    expect(refs).toMatchObject({ provider: "openrouter", reason: "one-ready" });
    expect(refs.quotes[1]).toMatchObject({ provider: "fal", refusal: "Takes no style references" });
    const falOnlyKey = quoteVideo(video("bytedance/seedance-2.5"), { duration: 5, resolution: "720p" }, { openrouter: false, fal: true }, NOW);
    expect(falOnlyKey).toMatchObject({ provider: "fal", reason: "one-ready" });
    expect(falOnlyKey.quotes[0]).toMatchObject({ provider: "openrouter", noKey: true });
    // No key yet: nobody runs it, and the composer shows the cheapest price.
    const none = quoteVideo(video("bytedance/seedance-2.5"), { duration: 5, resolution: "720p" }, { openrouter: false, fal: false }, NOW);
    expect(none.reason).toBe("none");
    expect(none.provider).toBeUndefined();
    expect(shownQuote(none)?.provider).toBe("openrouter");
  });

  it("with a kie.ai key: the cheapest of three, and kie's refusals send the run elsewhere", () => {
    const ALL = { openrouter: true, fal: true, kie: true };
    // Veo 3.1 at 1080p, 8 s with sound: $3.20 on OpenRouter, $1.275 a clip on kie.
    const veo = quoteVideo(video("google/veo-3.1"), { prompt: "a fox", duration: 8, resolution: "1080p", audio: true }, ALL, NOW);
    expect(veo).toMatchObject({ provider: "kie", reason: "cheaper" });
    expect(usd(veo)).toEqual({ openrouter: expect.closeTo(3.2), kie: expect.closeTo(1.275), apimart: expect.closeTo(1), revana: expect.closeTo(3.2) }); // APIMart and Revana have no key here
    // kie's Veo always has sound: with it off, OpenRouter runs it.
    const silent = quoteVideo(video("google/veo-3.1"), { prompt: "a fox", duration: 8, resolution: "1080p", audio: false }, ALL, NOW);
    expect(silent).toMatchObject({ provider: "openrouter", reason: "one-ready" });
    expect(silent.quotes[1]).toMatchObject({ provider: "kie", refusal: "Always adds sound" });
    // Seedance 2.5 stays cheapest on OpenRouter.
    expect(quoteVideo(video("bytedance/seedance-2.5"), { prompt: "a fox", duration: 5, resolution: "720p" }, ALL, NOW)).toMatchObject({ provider: "openrouter", reason: "cheaper" });
    // Kling 3.0 Pro without sound: $0.45 on kie against $0.56 on the other two.
    expect(quoteVideo(video("kwaivgi/kling-v3.0-pro"), { prompt: "a fox", duration: 5, audio: false }, ALL, NOW)).toMatchObject({ provider: "kie", reason: "cheaper" });
    // A tie among the cheapest goes to the first of them in the catalog's order.
    const pricier = { ...video("kwaivgi/kling-v3.0-pro"), estCostPerSecNoAudioUsd: { "720p": 0.09 } };
    expect(quoteVideo(pricier, { prompt: "a fox", duration: 5, audio: false }, ALL, NOW)).toMatchObject({ provider: "openrouter", reason: "tie" });
  });

  it("Kling 4.0, off OpenRouter: the cheapest of fal, kie.ai and APIMart; style references skip fal", () => {
    const kling = video("fal/kling-v4");
    // 10 s at 1080p: $2.35 on fal and APIMart, $2.125 on kie.
    const q = quoteVideo(kling, { prompt: "a fox", duration: 10, resolution: "1080p", aspectRatio: "21:9" }, { fal: true, kie: true, apimart: true }, NOW);
    expect(q).toMatchObject({ provider: "kie", reason: "cheaper" });
    expect(usd(q)).toEqual({ fal: expect.closeTo(2.35), kie: expect.closeTo(2.125), apimart: expect.closeTo(2.35), revana: expect.closeTo(2.7) });
    const refs = quoteVideo(kling, { prompt: "a fox", duration: 5, resolution: "720p", references: true }, { fal: true, apimart: true }, NOW);
    expect(refs).toMatchObject({ provider: "apimart", reason: "one-ready" });
    expect(refs.quotes[0]).toMatchObject({ provider: "fal", refusal: "Takes no style references" });
  });

  it("PixVerse 6 Max, on kie.ai and APIMart only: APIMart is cheaper, and takes a frame without a prompt", () => {
    const max = video("pixverse/pixverse-v6-max");
    // 10 s at 1080p with sound: $1.12 on kie, $0.996 on APIMart.
    const q = quoteVideo(max, { prompt: "a fox", duration: 10, resolution: "1080p", audio: true }, { kie: true, apimart: true }, NOW);
    expect(q).toMatchObject({ provider: "apimart", reason: "cheaper" });
    expect(usd(q)).toEqual({ kie: expect.closeTo(1.12), apimart: expect.closeTo(0.9956), revana: expect.closeTo(1.3) });
    const noPrompt = quoteVideo(max, { prompt: "", duration: 5, firstFrame: true }, { kie: true, apimart: true }, NOW);
    expect(noPrompt).toMatchObject({ provider: "apimart", reason: "one-ready" });
    expect(noPrompt.quotes[0]).toMatchObject({ provider: "kie", refusal: "Needs a prompt" });
    // OpenRouter and fal keys do not help.
    expect(quoteVideo(max, { prompt: "a fox", duration: 5 }, BOTH, NOW)).toMatchObject({ reason: "none" });
  });

  it("Gemini Omni Flash 1.2, on APIMart only: it runs there with no price known yet", () => {
    const omni = video("google/gemini-omni-flash-1.2");
    const q = quoteVideo(omni, { prompt: "a fox", duration: 8, resolution: "1080p", aspectRatio: "9:16", references: true }, { apimart: true }, NOW);
    expect(q).toMatchObject({ provider: "apimart", reason: "only" });
    expect(q.quotes).toEqual([{ provider: "apimart", noKey: false }]);
    expect(quoteVideo(omni, { prompt: "", duration: 8 }, { apimart: true }, NOW).quotes[0]).toMatchObject({ refusal: "Needs a prompt" });
    // No other key helps.
    expect(quoteVideo(omni, { prompt: "a fox", duration: 8 }, { openrouter: true, fal: true, kie: true }, NOW)).toMatchObject({ reason: "none" });
  });

  it("prices motion control and editing by the input video, once its length is known", () => {
    const motion = quoteVideo(video("fal/kling-v3-pro-motion-control"), { duration: 5, videoSec: 7.5 }, BOTH, NOW);
    expect(motion).toMatchObject({ provider: "fal", reason: "only" });
    expect(usd(motion)).toEqual({ fal: expect.closeTo(1.26) });
    const flux = video("black-forest-labs/flux-video-edit");
    // Not priced until the video's length is known: the first in the catalog's order.
    expect(quoteVideo(flux, { duration: 5 }, BOTH, NOW)).toMatchObject({ provider: "openrouter", reason: "unpriced" });
    const known = quoteVideo(flux, { duration: 5, videoSec: 10 }, BOTH, NOW);
    expect(known).toMatchObject({ provider: "openrouter", reason: "tie" });
    expect(usd(known)).toEqual({ openrouter: expect.closeTo(0.3), fal: expect.closeTo(0.3) });
  });

  it("sends reference videos and audio to kie.ai only", () => {
    const wan = video("alibaba/wan-3.0");
    const all = { openrouter: true, kie: true, apimart: true };
    const q = quoteVideo(wan, { prompt: "p", duration: 5, resolution: "720p", referenceAudios: true }, all, NOW);
    expect(q.provider).toBe("kie");
    expect(q.quotes.find((x) => x.provider === "openrouter")?.refusal).toBe("Takes no reference video or audio");
    expect(q.quotes.find((x) => x.provider === "apimart")?.refusal).toBe("Takes no uploaded video or audio");
    expect(quoteVideo(wan, { prompt: "p", duration: 5, referenceVideos: true }, { openrouter: true, apimart: true }, NOW).reason).toBe("none");
  });
});

describe("pinQuote", () => {
  const ALL = { openrouter: true, fal: true, kie: true };
  const veo = (audio: boolean) => quoteVideo(video("google/veo-3.1"), { prompt: "a fox", duration: 8, resolution: "1080p", audio }, ALL, NOW);

  it("runs it on the provider picked by hand, though another costs less", () => {
    expect(veo(true).provider).toBe("kie");
    expect(pinQuote(veo(true), "openrouter")).toMatchObject({ provider: "openrouter", picked: true });
    expect(shownQuote(pinQuote(veo(true), "openrouter"))?.usd).toBeCloseTo(3.2);
  });

  it("keeps the automatic choice while the pick has no key, refuses the request or is unset", () => {
    expect(pinQuote(veo(true), "apimart")).toEqual(veo(true)); // no APIMart key
    expect(pinQuote(veo(false), "kie")).toEqual(veo(false)); // kie's Veo always adds sound
    expect(pinQuote(veo(true), undefined)).toEqual(veo(true));
  });
});
