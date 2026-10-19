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
    expect(q.quotes.map((x) => x.provider)).toEqual(["openrouter", "fal"]);
    expect(usd(q).openrouter).toBeCloseTo(1.1555);
    expect(usd(q).fal).toBeCloseTo(2.365);
    const pricier = { ...video("bytedance/seedance-2.5"), estCostPerSecUsd: { "720p": 1 } };
    expect(quoteVideo(pricier, { duration: 5, resolution: "720p" }, BOTH, "openrouter", NOW)).toMatchObject({ provider: "fal", reason: "cheaper" });
  });

  it("lets the preference decide at the same price, with the sound on or off", () => {
    const kling = video("kwaivgi/kling-v3.0-pro");
    const silent = quoteVideo(kling, { duration: 5, audio: false }, BOTH, "fal", NOW);
    expect(silent).toMatchObject({ provider: "fal", reason: "tie" });
    expect(usd(silent)).toEqual({ openrouter: expect.closeTo(0.56), fal: expect.closeTo(0.56) });
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
