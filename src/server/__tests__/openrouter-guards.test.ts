/**
 * Guards around the OpenRouter client: the Bearer key never leaves the configured
 * origin, malformed 2xx bodies become a 502 (not a TypeError), upstream 401 / 5xx
 * are mapped to our 502, and a stalled download is aborted on idle, not on a
 * whole-body deadline.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HttpError } from "../errors.ts";

const BASE = "https://openrouter.test";
let or: typeof import("../openrouter.ts");
let dir: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  process.env.OPENROUTER_BASE_URL = BASE;
  or = await import("../openrouter.ts");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "higgsfree-guards-"));
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const mockFetch = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>): ReturnType<typeof vi.fn> => {
  const fn = vi.fn((input: string | URL | Request, init?: RequestInit) => impl(String(input), init));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
};
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rejects = async (p: Promise<unknown>): Promise<HttpError> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof HttpError) return err;
    throw new Error(`expected HttpError, got ${String(err)}`, { cause: err });
  }
  throw new Error("expected a rejection");
};

describe("assertProviderOrigin", () => {
  it("resolves relative and same-origin urls against OPENROUTER_BASE", () => {
    expect(or.assertProviderOrigin("/api/v1/videos/v1")).toBe(`${BASE}/api/v1/videos/v1`);
    expect(or.assertProviderOrigin(`${BASE}/api/v1/videos/v1/content?index=0`)).toBe(`${BASE}/api/v1/videos/v1/content?index=0`);
  });

  it("refuses another origin with a 502 that names the host", () => {
    for (const url of ["https://evil.example/steal", "http://openrouter.test/api", "https://openrouter.test:8443/api", "//evil.example/x"]) {
      expect(() => or.assertProviderOrigin(url)).toThrow(HttpError);
    }
    const err = (() => {
      try {
        or.assertProviderOrigin("https://evil.example/steal");
      } catch (e) {
        return e as HttpError;
      }
      return undefined;
    })();
    expect(err).toBeInstanceOf(or.ForeignOriginError);
    expect(err).toMatchObject({ status: 502, message: "Refusing to send the API key to evil.example" });
  });

  it("never fetches a foreign polling or content url with the key", async () => {
    const fetch = mockFetch(() => json(200, { status: "completed" }));
    await expect(or.pollVideo("k", "https://evil.example/poll")).rejects.toMatchObject({ status: 502, message: "Refusing to send the API key to evil.example" });
    await expect(or.downloadVideo("k", "https://evil.example/clip.mp4", path.join(dir, "x.mp4"))).rejects.toMatchObject({ status: 502 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("request body handling", () => {
  it("turns an empty 2xx body into a 502 instead of a TypeError", async () => {
    mockFetch(() => new Response("", { status: 200 }));
    const err = await rejects(or.credits("k"));
    expect(err).toMatchObject({ status: 502, message: "OpenRouter returned a non-JSON response" });
    expect(err.provider).toBeUndefined();
  });

  it("keeps a text 2xx body as the provider payload", async () => {
    mockFetch(() => new Response("<html>gateway</html>", { status: 200 }));
    const err = await rejects(or.keyInfo("k"));
    expect(err).toMatchObject({ status: 502, message: "OpenRouter returned a non-JSON response", provider: "<html>gateway</html>" });
  });

  it("maps a failed fetch or a body read error to a 502", async () => {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await rejects(or.credits("k"))).toMatchObject({ status: 502, message: "OpenRouter request failed: fetch failed" });
    mockFetch(() => {
      const body = new ReadableStream<Uint8Array>({
        start(ctl) {
          ctl.enqueue(new TextEncoder().encode("{"));
          ctl.error(new Error("socket hang up"));
        },
      });
      return new Response(body, { status: 200 });
    });
    expect(await rejects(or.credits("k"))).toMatchObject({ status: 502, message: "OpenRouter request failed: socket hang up" });
  });

  it("maps upstream 401 and 5xx to 502 and passes other 4xx through, body intact", async () => {
    const unauthorized = { error: { message: "User not found.", code: 401 } };
    mockFetch(() => json(401, unauthorized));
    const e401 = await rejects(or.credits("k"));
    expect(e401).toMatchObject({ status: 502, message: "OpenRouter rejected the API key", provider: unauthorized });
    expect(or.isKeyRejected(e401)).toBe(true);

    mockFetch(() => json(503, { error: { message: "upstream busy" } }));
    expect(await rejects(or.credits("k"))).toMatchObject({ status: 502, message: "upstream busy" });
    expect(or.isKeyRejected(new HttpError(502, "upstream busy"))).toBe(false);

    mockFetch(() => json(429, { error: { message: "slow down" } }));
    expect(await rejects(or.credits("k"))).toMatchObject({ status: 429, message: "slow down" });
  });
});

describe("downloadVideo", () => {
  it("aborts a stalled download on idle, removes the partial file and reports why", async () => {
    let sent = 0;
    mockFetch((_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(ctl) {
          ctl.enqueue(new Uint8Array(1024));
          sent++;
          // then nothing: the stream stays open until the client aborts it
          init?.signal?.addEventListener("abort", () => ctl.error(init.signal?.reason));
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "video/mp4" } });
    });
    const dest = path.join(dir, "stalled.mp4");
    const err = await rejects(or.downloadVideo("k", "/api/v1/videos/v1/content", dest, { idleMs: 60, maxMs: 10_000 }));
    expect(err.status).toBe(502);
    expect(err.message).toBe("Video download failed: no data received for 0 seconds");
    expect(sent).toBe(1);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("does not abort a slow but steady download that outlives the idle window", async () => {
    mockFetch((_url, init) => {
      let n = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(ctl) {
          await new Promise((r) => setTimeout(r, 20));
          if (init?.signal?.aborted) return ctl.error(init.signal.reason);
          ctl.enqueue(new Uint8Array(10));
          if (++n === 8) ctl.close();
        },
      });
      return new Response(body, { status: 200 });
    });
    const dest = path.join(dir, "steady.mp4");
    // 8 chunks 20 ms apart take about 160 ms; a 40 ms idle window must tolerate that.
    await expect(or.downloadVideo("k", "/api/v1/videos/v1/content", dest, { idleMs: 40, maxMs: 10_000 })).resolves.toBe(80);
    expect(fs.statSync(dest).size).toBe(80);
  });

  it("maps a 401 on the content url to 502 with the provider body", async () => {
    const body = { error: { message: "User not found.", code: 401 } };
    mockFetch(() => json(401, body));
    const err = await rejects(or.downloadVideo("k", "/api/v1/videos/v1/content", path.join(dir, "denied.mp4")));
    expect(err).toMatchObject({ status: 502, message: "Video download failed: OpenRouter rejected the API key", provider: body });
  });
});
