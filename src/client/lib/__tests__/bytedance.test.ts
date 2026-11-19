/** ByteDance (BytePlus ModelArk): the request each Seedance model gets, what it refuses, its prices, and its client. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BYTEDANCE_VIDEO_MODELS } from "@shared/bytedance-prices";
import { findVideoModel, IMAGE_MODELS, VIDEO_MODELS } from "@shared/models";
import type { VideoModel } from "@shared/types";
import { BYTEDANCE_PROXY_MAX_BODY_BYTES } from "@shared/bytedance-proxy";
import { assertBytedanceOrigin, BytedanceDownloadBlockedError, BytedanceOriginError, BYTEDANCE_NO_SERVER, BYTEDANCE_UNREACHABLE, download, inlineImage, submitVideo, task, taskUrl, testKey } from "../bytedance";
import { buildBytedanceVideoPayload } from "../bytedance-payloads";
import { estimateBytedanceVideoCost } from "../bytedance-pricing";
import { bytesToBase64 } from "../data-url";
import { KEY_VIA_SERVER, modelProviders, providerNotice } from "../providers";
import { TASK_PROVIDERS } from "../task-providers";
import { PNG_2X2 } from "../../__tests__/mock-openrouter";

const video = (id: string): VideoModel => {
  const m = findVideoModel(id);
  if (!m) throw new Error(`catalog has no ${id}`);
  return m;
};

/** A PNG header that says `width` × `height` (the size is all `inlineImage` reads). */
function png(width: number, height: number): string {
  const b = Uint8Array.from(PNG_2X2);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return `data:image/png;base64,${bytesToBase64(b)}`;
}

afterEach(() => vi.unstubAllGlobals());

describe("routes", () => {
  it("every ByteDance route names a ModelArk model in the price table; only Seedance 2.x videos have one", () => {
    const routed = VIDEO_MODELS.filter((m) => m.bytedance);
    for (const m of routed) expect(BYTEDANCE_VIDEO_MODELS[m.bytedance?.model ?? ""], m.id).toBeDefined();
    expect(routed.map((m) => m.id)).toEqual(["bytedance/seedance-2.5", "bytedance/seedance-2.0", "bytedance/seedance-2.0-fast", "bytedance/seedance-2.0-mini"]);
    // No catalog image model is on ModelArk (its Seedream 5.0 and 4.x are not curated here), and Seedance 1.5 Pro retires on 11 Nov 2026.
    expect(IMAGE_MODELS.some((m) => "bytedance" in m)).toBe(false);
    expect(modelProviders(video("bytedance/seedance-2.0"))).toEqual(["openrouter", "kie", "apimart", "revana", "bytedance", "replicate"]);
    expect(providerNotice({ ...video("bytedance/seedance-2.5"), offOpenRouter: true }, {})).toBe(
      "Seedance 2.5 needs a fal, kie.ai, APIMart, Revana, ByteDance or Replicate key. Add one in Settings to use it.",
    );
  });
});

describe("key", () => {
  it("next to the key field, Settings says the ByteDance key goes through the server and is never stored; only Replicate's does too", () => {
    expect(Object.keys(KEY_VIA_SERVER)).toEqual(["bytedance", "replicate"]);
    expect(KEY_VIA_SERVER.bytedance).toBe(
      "Unlike the other providers, your ByteDance key is sent to the higgsfree server so it can call ByteDance's API (it blocks direct browser calls). It is only used to forward your request and is never stored or logged.",
    );
  });
});

describe("buildBytedanceVideoPayload", () => {
  it("text to video: the prompt in `content`, the options in their own fields, never a watermark", () => {
    const p = buildBytedanceVideoPayload(video("bytedance/seedance-2.0"), { prompt: " a fox ", duration: 8, resolution: "4K", aspectRatio: "9:16", audio: false }, {});
    expect(p.body).toEqual({
      model: "dreamina-seedance-2-0-260128",
      content: [{ type: "text", text: "a fox" }],
      resolution: "4k",
      ratio: "9:16",
      duration: 8,
      generate_audio: false,
      watermark: false,
    });
    expect(p.params).toEqual({ duration: 8, resolution: "4K", aspectRatio: "9:16", audio: false });
  });

  it("frames go as first_frame / last_frame with no ratio (they set the shape); style references as reference_image with one", () => {
    const frames = buildBytedanceVideoPayload(video("bytedance/seedance-2.5"), { prompt: "", duration: 5, resolution: "720p", aspectRatio: "16:9" }, { firstFrame: "data:a", lastFrame: "data:b" });
    expect(frames.body.content).toEqual([
      { type: "image_url", image_url: { url: "data:a" }, role: "first_frame" },
      { type: "image_url", image_url: { url: "data:b" }, role: "last_frame" },
    ]);
    expect(frames.body).not.toHaveProperty("ratio");
    expect(frames.body.generate_audio).toBe(true);
    const refs = buildBytedanceVideoPayload(video("bytedance/seedance-2.0-mini"), { prompt: "like these", duration: 5, resolution: "480p", aspectRatio: "1:1" }, { references: ["data:r1", "data:r2"] });
    expect(refs.body).toMatchObject({ ratio: "1:1", content: [{ type: "text" }, { role: "reference_image" }, { role: "reference_image" }] });
  });

  it("refuses what ModelArk does not take, or not from a browser", () => {
    const sd2 = video("bytedance/seedance-2.0");
    const fast = video("bytedance/seedance-2.0-fast");
    expect(() => buildBytedanceVideoPayload(sd2, { prompt: "x", duration: 5, aspectRatio: "9:21" }, {})).toThrow("Takes no 9:21");
    expect(() => buildBytedanceVideoPayload(sd2, { prompt: "x", duration: 5 }, { referenceVideos: ["https://v"] })).toThrow("Takes videos by public link only");
    expect(() => buildBytedanceVideoPayload(sd2, { prompt: "x", duration: 5 }, { referenceAudios: ["https://a"] })).toThrow("Takes no reference video or audio");
    expect(() => buildBytedanceVideoPayload(sd2, { prompt: "x", duration: 5 }, { lastFrame: "data:b" })).toThrow("Needs a first frame with the last frame");
    expect(() => buildBytedanceVideoPayload(sd2, { prompt: "x", duration: 5 }, { firstFrame: "data:a", references: ["data:r"] })).toThrow("Takes frames or style references, not both");
    expect(() => buildBytedanceVideoPayload(sd2, { prompt: "x", duration: 5 }, { references: Array.from({ length: 10 }, () => "data:r") })).toThrow("Takes up to 9 reference images");
    expect(() => buildBytedanceVideoPayload(sd2, { prompt: "", duration: 5 }, {})).toThrow("Needs a prompt");
    // A catalog that offers more than ModelArk does: 1080p on Fast, 20 s on 2.0.
    expect(() => buildBytedanceVideoPayload({ ...fast, resolutions: ["480p", "720p", "1080p"] }, { prompt: "x", duration: 5, resolution: "1080p" }, {})).toThrow("Takes no 1080p");
    expect(() => buildBytedanceVideoPayload({ ...sd2, durations: { min: 4, max: 30, step: 1 } }, { prompt: "x", duration: 20 }, {})).toThrow("Takes clips of 4–15 s");
    expect(() => buildBytedanceVideoPayload(video("bytedance/seedance-1-5-pro"), { prompt: "x", duration: 5 }, {})).toThrow("is not available on ByteDance");
  });
});

describe("prices", () => {
  it("tokens of the frame ModelArk renders, at the model's rate: its own price examples (5 s, 16:9)", () => {
    const at = (id: string, resolution: VideoModel["resolutions"][number], extra = {}) =>
      estimateBytedanceVideoCost(id.endsWith("2.5") ? { ...video(id), resolutions: ["480p", "720p", "1080p"] } : video(id), { prompt: "p", duration: 5, resolution, aspectRatio: "16:9", ...extra });
    expect(at("bytedance/seedance-2.5", "480p")).toBeCloseTo(0.514, 3);
    expect(at("bytedance/seedance-2.5", "720p")).toBeCloseTo(1.156, 3);
    expect(at("bytedance/seedance-2.5", "1080p")).toBeCloseTo(2.843, 3);
    expect(at("bytedance/seedance-2.0", "480p")).toBeCloseTo(0.35, 2); // 864 × 496, not 854 × 480
    expect(at("bytedance/seedance-2.0", "1080p")).toBeCloseTo(1.87, 2);
    expect(at("bytedance/seedance-2.0", "4K")).toBeCloseTo(3.89, 2);
    expect(at("bytedance/seedance-2.0-fast", "720p")).toBeCloseTo(0.6, 2);
    expect(at("bytedance/seedance-2.0-mini", "480p")).toBeCloseTo(0.18, 2);
    // The ratio's own frame: 4:3 at 720p is 1112 × 834. A first frame sets the shape: priced at 16:9.
    expect(at("bytedance/seedance-2.5", "720p", { aspectRatio: "4:3" })).toBeCloseTo((5 * 1112 * 834 * 24 * 10.7) / 1024 / 1e6, 6);
    expect(at("bytedance/seedance-2.5", "720p", { aspectRatio: "4:3", firstFrame: true })).toBeCloseTo(1.156, 3);
    expect(at("bytedance/seedance-2.0", "720p", { referenceVideos: true })).toBeUndefined();
  });
});

describe("client", () => {
  const TASK = "/api/bytedance/v3/contents/generations/tasks/cgt-1";
  const FILE = "https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/out/v.mp4?X-Tos-Signature=s";
  const answer = (status: number, body: unknown) => vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status }));
  /** Every call the client makes, answered with `body`. */
  function record(body: unknown = { id: "cgt-1" }, status = 200): { url: string; method: string; headers: Headers; body?: string }[] {
    const calls: { url: string; method: string; headers: Headers; body?: string }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET", headers: new Headers(init?.headers), ...(typeof init?.body === "string" ? { body: init.body } : {}) });
      return body instanceof Response ? body : new Response(JSON.stringify(body), { status });
    });
    return calls;
  }

  it("calls go to the pass-through on the app's own origin, never to ModelArk or its storage directly", async () => {
    expect(taskUrl("cgt-20250730114109-jfd6d")).toBe("/api/bytedance/v3/contents/generations/tasks/cgt-20250730114109-jfd6d");
    expect(() => taskUrl("../../images/generations")).toThrow("task id the app does not recognise");

    const calls = record();
    await expect(submitVideo("ark-key", { model: "m", content: [] })).resolves.toBe("cgt-1");
    await testKey("ark-key");
    await task("ark-key", TASK);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/bytedance/v3/contents/generations/tasks",
      "GET /api/bytedance/v3/contents/generations/tasks?page_size=1",
      `GET ${TASK}`,
    ]);
    expect(calls.every((c) => c.headers.get("authorization") === "Bearer ark-key")).toBe(true);

    // The file: through the pass-through, as `{ url }`, without the key.
    const media = record(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } }));
    expect((await download(FILE)).size).toBe(3);
    expect(media).toEqual([{ url: "/api/bytedance/media", method: "POST", headers: expect.any(Headers), body: JSON.stringify({ url: FILE }) }]);
    expect(media[0]?.headers.get("authorization")).toBeNull();

    // A url off this origin, or outside the pass-through, never gets the key.
    for (const url of ["https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-1", "//evil.example/api/bytedance/v3/x", "/api/bytedance/media", "/api/bytedance/v3/../media"]) {
      expect(() => assertBytedanceOrigin(url), url).toThrow(BytedanceOriginError);
    }
  });

  it("a request too large for the pass-through is refused before it is sent", async () => {
    const calls = record();
    const image = "A".repeat(BYTEDANCE_PROXY_MAX_BODY_BYTES);
    await expect(submitVideo("k", { content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${image}` } }] })).rejects.toMatchObject({ status: 413, error: expect.stringContaining("up to 4 MB") });
    expect(calls).toHaveLength(0);
  });

  it("a copy of the app with no pass-through (a host that only serves files) says ByteDance can't run there", async () => {
    record(new Response("<!doctype html><title>404</title>", { status: 404, headers: { "content-type": "text/html" } }));
    await expect(testKey("k")).rejects.toMatchObject({ error: BYTEDANCE_NO_SERVER });
    record(new Response("<!doctype html><title>404</title>", { status: 404, headers: { "content-type": "text/html" } }));
    await expect(download(FILE)).rejects.toMatchObject({ error: BYTEDANCE_NO_SERVER });
  });

  it("a task: its video, and what it cost from the tokens ModelArk billed", async () => {
    answer(200, { id: "cgt-1", model: "dreamina-seedance-2-0-260128", status: "succeeded", resolution: "720p", content: { video_url: "https://x.tos-ap-southeast-1.volces.com/v.mp4" }, usage: { completion_tokens: 108900 } });
    const t = await task("k", TASK);
    expect(t).toMatchObject({ status: "succeeded", urls: ["https://x.tos-ap-southeast-1.volces.com/v.mp4"] });
    expect(t.costUsd).toBeCloseTo(0.7623, 4);
    answer(200, { id: "cgt-1", model: "dreamina-seedance-2-0-260128", status: "failed", error: { code: "InputImageSensitiveContentDetected.PrivacyInformation", message: "may contain real person" } });
    expect((await task("k", TASK)).error).toContain("Seedance 2.x takes no real faces");
    answer(200, { id: "cgt-1", status: "expired" });
    expect(await TASK_PROVIDERS.bytedance.status("k", TASK)).toMatchObject({ state: "failed", error: "ByteDance's task expired before it finished" });
  });

  it("errors: the key only goes to the pass-through; ModelArk's codes say what to do; no answer says what to check", async () => {
    await expect(task("k", "https://evil.example/api/v3/contents/generations/tasks/x")).rejects.toBeInstanceOf(BytedanceOriginError);
    // ModelArk's own errors come back through the pass-through, readable.
    answer(404, { error: { code: "ModelNotOpen", message: "Your account has not activated the model" } });
    await expect(task("k", TASK)).rejects.toMatchObject({ status: 404, error: expect.stringContaining("openManagement") });
    answer(400, { error: { code: "InvalidParameter", message: "the parameter `ratio` specified in the request is not valid" } });
    await expect(task("k", TASK)).rejects.toMatchObject({ status: 400, error: "the parameter `ratio` specified in the request is not valid" });
    answer(401, { error: { code: "AuthenticationError", message: "The API key format is incorrect" } });
    await expect(task("k", TASK)).rejects.toMatchObject({ status: 401, error: "ByteDance rejected the API key" });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(task("k", TASK)).rejects.toMatchObject({ status: 0, error: BYTEDANCE_UNREACHABLE });
    // A result off ModelArk's storage is never fetched: the job ends, with the link.
    const err = await download("https://x.tos-ap-southeast-1.volces.com/v.mp4?sig=1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BytedanceDownloadBlockedError);
    expect((err as Error).message).toContain("https://x.tos-ap-southeast-1.volces.com/v.mp4?sig=1");
    expect(TASK_PROVIDERS.bytedance.endsJob(err)).toBe(true);
    // So does the pass-through refusing one (a redirect off its hosts); a file host error is retried instead.
    answer(502, { error: { code: "RedirectNotAllowed", message: "ByteDance's file host redirected off its own hosts" } });
    await expect(download(FILE)).rejects.toBeInstanceOf(BytedanceDownloadBlockedError);
    answer(502, { error: { code: "UpstreamUnreachable", message: "Could not reach ByteDance's file host" } });
    const retried = await download(FILE).catch((e: unknown) => e);
    expect(retried).toMatchObject({ status: 502, error: "ByteDance file download failed (Could not reach ByteDance's file host)" });
    expect(TASK_PROVIDERS.bytedance.endsJob(retried)).toBe(false);
  });

  it("images go inline, checked against ModelArk's limits", () => {
    expect(inlineImage(png(640, 480).replace("image/png", "IMAGE/PNG"))).toMatch(/^data:image\/png;base64,/);
    expect(() => inlineImage(png(2, 2))).toThrow("ByteDance takes images of 300 to 6000 px a side, not 2×2");
    expect(() => inlineImage(png(1500, 400))).toThrow("from 2:5 to 5:2");
    expect(() => inlineImage("data:text/plain;base64,aGk=")).toThrow("Not an image data URL");
  });
});
