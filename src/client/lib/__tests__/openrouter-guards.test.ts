/**
 * Guards around the OpenRouter client: the Bearer key never leaves the configured origin,
 * malformed 2xx bodies become a 502 (not a TypeError), upstream statuses are kept, a failed
 * fetch is "unreachable" (status 0), and a stalled download is aborted on idle, not on a
 * whole-body deadline.
 */
import { describe, expect, it, vi } from "vitest";
import { ApiClientError, isKeyRejected, OFFLINE_MESSAGE } from "../errors";
import * as or from "../openrouter";

const BASE = "https://openrouter.ai";

const mockFetch = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>): ReturnType<typeof vi.fn> => {
  const fn = vi.fn((input: string | URL | Request, init?: RequestInit) => impl(String(input), init));
  vi.stubGlobal("fetch", fn);
  return fn;
};
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rejects = async (p: Promise<unknown>): Promise<ApiClientError> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof ApiClientError) return err;
    throw new Error(`expected ApiClientError, got ${String(err)}`, { cause: err });
  }
  throw new Error("expected a rejection");
};
const drain = async (stream: ReadableStream<Uint8Array>): Promise<number> => new Blob([await new Response(stream).arrayBuffer()]).size;

describe("assertProviderOrigin", () => {
  it("resolves relative and same-origin urls against OPENROUTER_BASE", () => {
    expect(or.OPENROUTER_BASE).toBe(BASE);
    expect(or.assertProviderOrigin("/api/v1/videos/v1")).toBe(`${BASE}/api/v1/videos/v1`);
    expect(or.assertProviderOrigin(`${BASE}/api/v1/videos/v1/content?index=0`)).toBe(`${BASE}/api/v1/videos/v1/content?index=0`);
  });

  it("refuses another origin with a 502 that names the host", () => {
    for (const url of ["https://evil.example/steal", "http://openrouter.ai/api", "https://openrouter.ai:8443/api", "//evil.example/x"]) {
      expect(() => or.assertProviderOrigin(url)).toThrow(ApiClientError);
    }
    const err = (() => {
      try {
        or.assertProviderOrigin("https://evil.example/steal");
      } catch (e) {
        return e as ApiClientError;
      }
      return undefined;
    })();
    expect(err).toBeInstanceOf(or.ForeignOriginError);
    expect(err).toMatchObject({ status: 502, message: "Refusing to send the API key to evil.example" });
  });

  it("never fetches a foreign polling or content url with the key", async () => {
    const fetch = mockFetch(() => json(200, { status: "completed" }));
    await expect(or.pollVideo("k", "https://evil.example/poll")).rejects.toMatchObject({ status: 502, message: "Refusing to send the API key to evil.example" });
    await expect(or.openVideoStream("k", "https://evil.example/clip.mp4")).rejects.toMatchObject({ status: 502 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("request handling", () => {
  it("sends the key, the attribution headers and JSON", async () => {
    const fetch = mockFetch(() => json(200, { data: { total_credits: 1, total_usage: 0 } }));
    await or.credits("k");
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer k");
    expect(headers.get("x-title")).toBe("higgsfree");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

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

  it("reports a failed fetch or a body read error as unreachable (status 0)", async () => {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    const err = await rejects(or.credits("k"));
    expect(err).toMatchObject({ status: 0, message: OFFLINE_MESSAGE, provider: "fetch failed" });
    expect(err.offline).toBe(true);
    mockFetch(() => {
      const body = new ReadableStream<Uint8Array>({
        start(ctl) {
          ctl.enqueue(new TextEncoder().encode("{"));
          ctl.error(new Error("socket hang up"));
        },
      });
      return new Response(body, { status: 200 });
    });
    expect(await rejects(or.credits("k"))).toMatchObject({ status: 0, provider: "socket hang up" });
  });

  it("keeps upstream statuses: 401 is the key, 5xx and 4xx pass through with the body", async () => {
    const unauthorized = { error: { message: "User not found.", code: 401 } };
    mockFetch(() => json(401, unauthorized));
    const e401 = await rejects(or.credits("k"));
    expect(e401).toMatchObject({ status: 401, message: "OpenRouter rejected the API key", provider: unauthorized });
    expect(isKeyRejected(e401)).toBe(true);

    mockFetch(() => json(503, { error: { message: "upstream busy" } }));
    expect(await rejects(or.credits("k"))).toMatchObject({ status: 503, message: "upstream busy" });
    expect(isKeyRejected(new ApiClientError(401, "Invalid API key"))).toBe(false);

    mockFetch(() => json(429, { error: { message: "slow down" } }));
    expect(await rejects(or.credits("k"))).toMatchObject({ status: 429, message: "slow down" });
  });

  it("maps a caller's abort to 499", async () => {
    mockFetch((_url, init) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return json(200, {});
    });
    const controller = new AbortController();
    controller.abort();
    expect(await rejects(or.pollVideo("k", "/api/v1/videos/v1", { signal: controller.signal }))).toMatchObject({ status: 499, message: "Request cancelled" });
  });
});

describe("openVideoStream", () => {
  it("aborts a stalled download on idle and reports why", async () => {
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
    const stream = await or.openVideoStream("k", "/api/v1/videos/v1/content", { idleMs: 60, maxMs: 10_000 });
    const err = await rejects(drain(stream));
    expect(err.status).toBe(502);
    expect(err.message).toBe("Video download failed: no data received for 0 seconds");
    expect(sent).toBe(1);
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
    // 8 chunks 20 ms apart take about 160 ms; a 40 ms idle window must tolerate that.
    const stream = await or.openVideoStream("k", "/api/v1/videos/v1/content", { idleMs: 40, maxMs: 10_000 });
    expect(await drain(stream)).toBe(80);
  });

  it("keeps a 401 on the content url as 401 with the provider body", async () => {
    const body = { error: { message: "User not found.", code: 401 } };
    mockFetch(() => json(401, body));
    const err = await rejects(or.openVideoStream("k", "/api/v1/videos/v1/content"));
    expect(err).toMatchObject({ status: 401, message: "Video download failed: OpenRouter rejected the API key", provider: body });
  });
});
