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
    expect(q.quotes.map((x) => x.provider)).toEqual(["openrouter", "fal", "kie", "apimart", "revana", "bytedance", "replicate"]);
    expect(usd(q).openrouter).toBeCloseTo(1.1555);
    expect(usd(q).fal).toBeCloseTo(2.838);
    const pricier = { ...video("bytedance/seedance-2.5"), estCostPerSecUsd: { "720p": 1 } };
    expect(quoteVideo(pricier, { duration: 5, resolution: "720p" }, BOTH, NOW)).toMatchObject({ provider: "fal", reason: "cheaper" });
  });

  it("at the same price, the first in the catalog's order runs it, with the sound on or off", () => {
    const kling = video("kwaivgi/kling-v3.0-pro");
    const silent = quoteVideo(kling, { prompt: "a fox", duration: 5, audio: false }, BOTH, NOW);
    expect(silent).toMatchObject({ provider: "openrouter", reason: "tie" });
    expect(usd(silent)).toEqual({ openrouter: expect.closeTo(0.56), fal: expect.closeTo(0.56), kie: expect.closeTo(0.45), apimart: expect.closeTo(0.448), replicate: expect.closeTo(1.12) });
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
    expect(usd(veo)).toEqual({ openrouter: expect.closeTo(3.2), kie: expect.closeTo(1.275), apimart: expect.closeTo(1), revana: expect.closeTo(3.2), replicate: expect.closeTo(3.2) }); // APIMart, Revana and Replicate have no key here
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
    expect(usd(q)).toEqual({ fal: expect.closeTo(2.35), kie: expect.closeTo(2.125), apimart: expect.closeTo(2.35), revana: expect.closeTo(2.7), replicate: expect.closeTo(2.35) });
    const refs = quoteVideo(kling, { prompt: "a fox", duration: 5, resolution: "720p", references: true }, { fal: true, apimart: true }, NOW);
    expect(refs).toMatchObject({ provider: "apimart", reason: "one-ready" });
    expect(refs.quotes[0]).toMatchObject({ provider: "fal", refusal: "Takes no style references" });
  });

  it("PixVerse 6 Max, on fal, kie.ai and APIMart: APIMart is the cheapest and takes a frame without a prompt, fal the dearest", () => {
    const max = video("pixverse/pixverse-v6-max");
    const all = { fal: true, kie: true, apimart: true };
    // 10 s at 1080p with sound: $2.52 on fal, $1.12 on kie, $0.996 on APIMart.
    const q = quoteVideo(max, { prompt: "a fox", duration: 10, resolution: "1080p", audio: true }, all, NOW);
    expect(q).toMatchObject({ provider: "apimart", reason: "cheaper" });
    expect(usd(q)).toEqual({ fal: expect.closeTo(2.52), kie: expect.closeTo(1.12), apimart: expect.closeTo(0.9956), revana: expect.closeTo(1.3), replicate: expect.closeTo(2.8) });
    const noPrompt = quoteVideo(max, { prompt: "", duration: 5, firstFrame: true }, { kie: true, apimart: true }, NOW);
    expect(noPrompt).toMatchObject({ provider: "apimart", reason: "one-ready" });
    expect(noPrompt.quotes[1]).toMatchObject({ provider: "kie", refusal: "Needs a prompt" });
    // With fal and kie.ai keys, kie; with fal's alone, fal.
    expect(quoteVideo(max, { prompt: "a fox", duration: 5 }, { fal: true, kie: true }, NOW)).toMatchObject({ provider: "kie", reason: "cheaper" });
    expect(quoteVideo(max, { prompt: "a fox", duration: 5 }, BOTH, NOW)).toMatchObject({ provider: "fal" });
  });

  it("Seedance 1.5 Pro, on APIMart only since OpenRouter retired it: APIMart runs it at its price, and no other key helps", () => {
    const s15 = video("bytedance/seedance-1-5-pro");
    // 5 s at 720p: $0.22 on APIMart.
    const q = quoteVideo(s15, { prompt: "a fox", duration: 5, resolution: "720p", aspectRatio: "16:9" }, { openrouter: true, fal: true, kie: true, apimart: true }, NOW);
    expect(q).toMatchObject({ provider: "apimart", reason: "only" });
    expect(q.quotes).toEqual([{ provider: "apimart", noKey: false, usd: expect.closeTo(0.22) }]);
    expect(quoteVideo(s15, { prompt: "a fox", duration: 5 }, { openrouter: true, fal: true, kie: true }, NOW)).toMatchObject({ quotes: [{ provider: "apimart", noKey: true }], reason: "none" });
  });

  it("Gemini Omni Flash 1.2, on fal, kie.ai and APIMart: kie is the cheapest, fal takes no style references, APIMart no length and no price yet", () => {
    const omni = video("google/gemini-omni-flash-1.2");
    const all = { fal: true, kie: true, apimart: true };
    const both = { fal: true, apimart: true };
    // 8 s at 1080p: $0.9832 on fal, $0.40 on kie (10 credits a second).
    const q = quoteVideo(omni, { prompt: "a fox", duration: 8, resolution: "1080p", aspectRatio: "9:16" }, all, NOW);
    expect(q).toMatchObject({ provider: "kie", reason: "cheaper" });
    expect(q.quotes).toEqual([
      { provider: "fal", noKey: false, usd: expect.closeTo(0.9832) },
      { provider: "kie", noKey: false, usd: expect.closeTo(0.4) },
      { provider: "apimart", noKey: false },
      { provider: "replicate", noKey: true, usd: expect.closeTo(1.24) },
    ]);
    expect(quoteVideo(omni, { prompt: "a fox", duration: 8, resolution: "1080p", aspectRatio: "9:16" }, both, NOW)).toMatchObject({ provider: "fal", reason: "cheaper" });
    // kie and APIMart take style references, fal does not.
    const refs = quoteVideo(omni, { prompt: "a fox", duration: 8, references: true }, both, NOW);
    expect(refs).toMatchObject({ provider: "apimart", reason: "one-ready" });
    expect(refs.quotes[0]).toMatchObject({ provider: "fal", refusal: "Takes no style references" });
    expect(quoteVideo(omni, { prompt: "a fox", duration: 8, references: true }, all, NOW)).toMatchObject({ provider: "kie", reason: "cheaper" });
    // APIMart takes no length, so it runs only at the default: any other goes to fal or kie.
    const long = quoteVideo(omni, { prompt: "a fox", duration: 12 }, both, NOW);
    expect(long).toMatchObject({ provider: "fal", reason: "one-ready" });
    expect(long.quotes[2]).toMatchObject({ provider: "apimart", refusal: "Takes clips of 8 s" });
    // Between two frames fal and kie stop at 10 s, and nobody else takes 12.
    expect(quoteVideo(omni, { prompt: "a fox", duration: 10, firstFrame: true, lastFrame: true }, all, NOW)).toMatchObject({ provider: "kie" });
    expect(quoteVideo(omni, { prompt: "a fox", duration: 12, firstFrame: true, lastFrame: true }, all, NOW)).toMatchObject({ reason: "none" });
    // APIMart alone runs it, with no price known yet.
    expect(quoteVideo(omni, { prompt: "a fox", duration: 8 }, { apimart: true }, NOW)).toMatchObject({ provider: "apimart", reason: "one-ready" });
    expect(quoteVideo(omni, { prompt: "", duration: 8 }, { apimart: true }, NOW).quotes[2]).toMatchObject({ refusal: "Needs a prompt" });
    // An OpenRouter key does not help.
    expect(quoteVideo(omni, { prompt: "a fox", duration: 8 }, { openrouter: true }, NOW)).toMatchObject({ reason: "none" });
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

  it("ByteDance, on BytePlus ModelArk: OpenRouter's price (a tie goes to OpenRouter), less than fal, kie.ai and at times Revana; APIMart stays cheaper", () => {
    const sd25 = video("bytedance/seedance-2.5");
    const req = { prompt: "a fox", duration: 5, resolution: "720p", aspectRatio: "16:9" } as const;
    // 5 s at 720p: $1.156 on ByteDance (108,000 tokens at $10.70 per million), $1.575 on kie, $2.84 on fal.
    const q25 = quoteVideo(sd25, req, { fal: true, kie: true, bytedance: true }, NOW);
    expect(q25).toMatchObject({ provider: "bytedance", reason: "cheaper" });
    expect(usd(q25)).toMatchObject({ openrouter: expect.closeTo(1.1555), fal: expect.closeTo(2.838), kie: expect.closeTo(1.575), bytedance: expect.closeTo(1.1556) });
    expect(quoteVideo(sd25, req, { openrouter: true, bytedance: true }, NOW)).toMatchObject({ provider: "openrouter", reason: "tie" });
    // Style references: fal takes none, ByteDance up to 30.
    expect(quoteVideo(sd25, { ...req, references: true }, { fal: true, bytedance: true }, NOW)).toMatchObject({ provider: "bytedance", reason: "one-ready" });
    // Seedance 2.0 at 1080p: $1.87 on ByteDance, $2.00 on Revana, $2.55 on kie; APIMart's $1.77 wins when it has a key.
    const sd20 = video("bytedance/seedance-2.0");
    const hd = { prompt: "a fox", duration: 5, resolution: "1080p", aspectRatio: "16:9" } as const;
    const q20 = quoteVideo(sd20, hd, { kie: true, revana: true, bytedance: true }, NOW);
    expect(q20).toMatchObject({ provider: "bytedance", reason: "cheaper" });
    expect(usd(q20)).toMatchObject({ kie: expect.closeTo(2.55), revana: expect.closeTo(2), bytedance: expect.closeTo(1.871) });
    expect(quoteVideo(sd20, hd, { apimart: true, bytedance: true }, NOW).provider).toBe("apimart");
    // Seedance 2.0 Fast costs more on ModelArk ($5.60 per million tokens) than on OpenRouter ($4.20).
    expect(quoteVideo(video("bytedance/seedance-2.0-fast"), { ...req }, { openrouter: true, bytedance: true }, NOW)).toMatchObject({ provider: "openrouter", reason: "cheaper" });
    // What ModelArk does not take goes elsewhere: 9:21, or a reference video (it takes videos by public link only).
    const tall = quoteVideo(sd20, { ...hd, aspectRatio: "9:21" }, { openrouter: true, bytedance: true }, NOW);
    expect(tall).toMatchObject({ provider: "openrouter", reason: "one-ready" });
    expect(tall.quotes.find((x) => x.provider === "bytedance")).toMatchObject({ refusal: "Takes no 9:21" });
    const withVideo = quoteVideo(sd20, { ...hd, referenceVideos: true, referenceVideoSec: 4 }, { kie: true, bytedance: true }, NOW);
    expect(withVideo).toMatchObject({ provider: "kie", reason: "one-ready" });
    expect(withVideo.quotes.find((x) => x.provider === "bytedance")).toMatchObject({ refusal: "Takes videos by public link only" });
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
