/**
 * The ByteDance pass-through: only the calls the app makes reach ModelArk, at exactly its API host; the key is
 * forwarded once and never echoed, logged or kept; ModelArk's answers come back unchanged; and the media route only
 * streams from ModelArk's own storage.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { BYTEDANCE_PROXY_MAX_BODY_BYTES, MODELARK_API } from "@shared/bytedance-proxy";
import { taskUrl } from "@/lib/bytedance";
import * as route from "../../app/api/bytedance/[...path]/route";
import { handleBytedanceProxy, modelArkTarget } from "../bytedance-proxy";

const ORIGIN = "https://higgsfree.example";
const KEY = "ark-secret-0123456789";
const AUTH = { Authorization: `Bearer ${KEY}` };
const TASKS = "/api/bytedance/v3/contents/generations/tasks";
const FILE = "https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/out/cgt-1.mp4?X-Tos-Signature=abc";

const call = (path: string, init: RequestInit = {}): Promise<Response> => handleBytedanceProxy(new Request(`${ORIGIN}${path}`, init));
const media = (url: unknown, init: RequestInit = {}): Promise<Response> =>
  call("/api/bytedance/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), ...init });
const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

let upstream: MockInstance<typeof fetch>;
let consoles: MockInstance[];

beforeEach(() => {
  upstream = vi.fn<typeof fetch>(async () => json(200, { id: "cgt-1" }));
  vi.stubGlobal("fetch", upstream);
  consoles = (["log", "info", "warn", "error", "debug", "trace"] as const).map((m) => vi.spyOn(console, m));
});

afterEach(() => {
  // Nothing the pass-through does writes to the console, whatever happened.
  for (const c of consoles) expect(c).not.toHaveBeenCalled();
});

/** The one upstream call made, as `[url, init]`. */
function sent(): [string, RequestInit] {
  expect(upstream).toHaveBeenCalledTimes(1);
  const [url, init] = upstream.mock.calls[0] ?? [];
  return [String(url), init ?? {}];
}

describe("ModelArk calls", () => {
  it("passes exactly the app's three calls on, to ModelArk's API host and nowhere else", async () => {
    const body = JSON.stringify({ model: "dreamina-seedance-2-0-260128", content: [{ type: "text", text: "a fox" }] });
    expect((await call(TASKS, { method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body })).status).toBe(200);
    const [url, init] = sent();
    expect(url).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "manual", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" } });
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(body);

    upstream.mockClear();
    await call(`${TASKS}?page_size=1`, { headers: AUTH });
    expect(sent()).toEqual([`${MODELARK_API}/contents/generations/tasks?page_size=1`, expect.objectContaining({ method: "GET", headers: { Authorization: `Bearer ${KEY}` } })]);

    upstream.mockClear();
    await call(`${TASKS}/cgt-20250730114109-jfd6d`, { headers: AUTH });
    expect(sent()[0]).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-20250730114109-jfd6d");
    // The browser's own urls are the ones that pass.
    expect(modelArkTarget("GET", new URL(taskUrl("cgt-1"), ORIGIN))).toEqual({ target: `${MODELARK_API}/contents/generations/tasks/cgt-1`, body: false });
  });

  it("refuses every other path, method and query before anything leaves the server", async () => {
    const refused: [string, RequestInit, number][] = [
      ["/api/bytedance/v3/chat/completions", { method: "POST" }, 404],
      ["/api/bytedance/v3/images/generations", { method: "POST" }, 404],
      ["/api/bytedance/v3/contents/generations", {}, 404],
      ["/api/bytedance/v3/files", {}, 404],
      ["/api/bytedance/other", {}, 404],
      [`${TASKS}/cgt-1`, { method: "DELETE" }, 405],
      [`${TASKS}/cgt-1`, { method: "POST", body: "{}" }, 405],
      [`${TASKS}/cgt-1`, { method: "HEAD" }, 405],
      [TASKS, { method: "PUT", body: "{}" }, 405],
      [TASKS, { method: "DELETE" }, 405],
      [TASKS, {}, 400],
      [`${TASKS}?page_size=1&filter.status=succeeded`, {}, 400],
      [`${TASKS}?page_size=101`, {}, 400],
      [`${TASKS}?page_size=0`, {}, 400],
      [`${TASKS}?page_num=1`, {}, 400],
      [`${TASKS}?callback=x`, { method: "POST", body: "{}" }, 400],
      [`${TASKS}/cgt-1?x=1`, {}, 400],
    ];
    for (const [path, init, status] of refused) {
      const res = await call(path, { ...init, headers: { ...AUTH, "Content-Type": "application/json" } });
      expect(res.status, `${init.method ?? "GET"} ${path}`).toBe(status);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("only polls ids of ModelArk's own shape", async () => {
    for (const id of ["x", "cgt-", "cgt-1.json", "cgt-1%2F..%2Fx", "cgt-1/extra", "cgt-%2e%2e", "..%2F..%2Fimages%2Fgenerations", `cgt-${"a".repeat(200)}`]) {
      const res = await call(`${TASKS}/${id}`, { headers: AUTH });
      expect(res.status, id).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: "InvalidTaskId" } });
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("needs a Bearer key, a JSON body to submit, and no more than the size Vercel lets through", async () => {
    expect((await call(`${TASKS}/cgt-1`)).status).toBe(401);
    expect((await call(`${TASKS}/cgt-1`, { headers: { Authorization: `Basic ${KEY}` } })).status).toBe(401);
    expect((await call(TASKS, { method: "POST", headers: { ...AUTH, "Content-Type": "text/plain" }, body: "{}" })).status).toBe(415);
    const big = JSON.stringify({ content: "A".repeat(BYTEDANCE_PROXY_MAX_BODY_BYTES) });
    expect((await call(TASKS, { method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: big })).status).toBe(413);
    // The same without a Content-Length: counted as it streams in.
    const stream = new Blob([big]).stream();
    const streamed = await call(TASKS, { method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    expect(streamed.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("answers with ModelArk's own status and body, so the browser shows its real errors", async () => {
    const errors = [
      [401, { error: { code: "AuthenticationError", message: "The API key format is incorrect. Request id: 1", param: "", type: "Unauthorized" } }],
      [404, { error: { code: "ModelNotOpen", message: "Your account 2100 has not activated the model dreamina-seedance-2-0-260128.", type: "NotFound" } }],
      [400, { error: { code: "InputImageSensitiveContentDetected.PrivacyInformation", message: "may contain real person", type: "BadRequest" } }],
      [429, { error: { code: "RateLimitExceeded.EndpointRPMExceeded", message: "Too many requests", type: "TooManyRequests" } }],
    ] as const;
    for (const [status, body] of errors) {
      upstream.mockResolvedValueOnce(json(status, body, { "set-cookie": "s=1", "x-upstream": "y" }));
      const res = await call(`${TASKS}/cgt-1`, { headers: AUTH });
      expect(res.status).toBe(status);
      expect(await res.text()).toBe(JSON.stringify(body));
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("content-type")).toBe("application/json");
      // Only the body's type is passed on, never ModelArk's other headers.
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("never echoes the key: not in its answers, not in an error, not kept for the next call", async () => {
    upstream.mockResolvedValueOnce(json(200, { id: "cgt-1", status: "running" }));
    const ok = await call(`${TASKS}/cgt-1`, { headers: AUTH });
    expect([...ok.headers].flat().join(" ")).not.toContain(KEY);
    expect(await ok.text()).not.toContain(KEY);

    // A failure that names the key in its cause is answered with a fixed message.
    upstream.mockRejectedValueOnce(new TypeError("fetch failed", { cause: new Error(`connect ECONNREFUSED (Authorization: Bearer ${KEY})`) }));
    const down = await call(`${TASKS}/cgt-1`, { headers: AUTH });
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: { code: "UpstreamUnreachable", message: "Could not reach ByteDance (BytePlus ModelArk)" } });
    expect(down.headers.get("cache-control")).toBe("no-store");
    upstream.mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect((await call(`${TASKS}/cgt-1`, { headers: AUTH })).status).toBe(504);

    // Each call carries its own key; one without a key is refused, not served with the last one.
    upstream.mockClear();
    await call(`${TASKS}/cgt-1`, { headers: { Authorization: "Bearer other-key" } });
    expect(sent()[1].headers).toEqual({ Authorization: "Bearer other-key" });
    expect((await call(`${TASKS}/cgt-1`)).status).toBe(401);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("does not follow a redirect from ModelArk (the key would go with it)", async () => {
    upstream.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }));
    const res = await call(`${TASKS}/cgt-1`, { headers: AUTH });
    expect(res.status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});

describe("media", () => {
  it("streams a finished video from ModelArk's storage, without the key, as a download only", async () => {
    const bytes = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    upstream.mockResolvedValueOnce(new Response(bytes, { status: 200, headers: { "content-type": "video/mp4", "set-cookie": "s=1" } }));
    const res = await media(FILE, { headers: { "Content-Type": "application/json", ...AUTH } });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(res.headers.get("set-cookie")).toBeNull();
    const [url, init] = sent();
    expect(url).toBe(FILE);
    // Even when the browser sent one, the key does not go to the bucket.
    expect(init.headers).toBeUndefined();
    expect(init).toMatchObject({ redirect: "manual", cache: "no-store" });
  });

  it("only fetches https urls on ModelArk's own bucket: no other host, no http, no IP, no credentials, no port", async () => {
    const refused = [
      "http://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/out/x.mp4",
      "https://someone-else.tos-ap-southeast-1.volces.com/out/x.mp4",
      "https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com.evil.example/x.mp4",
      "https://evil.example/ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/x.mp4",
      "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks",
      "https://user:pass@ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/x.mp4",
      "https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com:8443/x.mp4",
      "https://127.0.0.1/x.mp4",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/x.mp4",
      "https://10.0.0.1/x.mp4",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "not a url",
    ];
    for (const url of refused) {
      const res = await media(url);
      expect(res.status, url).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "HostNotAllowed" } });
    }
    expect((await media(42)).status).toBe(400);
    expect((await call("/api/bytedance/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: "not json" })).status).toBe(400);
    expect((await call("/api/bytedance/media", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ url: FILE }) })).status).toBe(415);
    expect((await call(`/api/bytedance/media?url=${encodeURIComponent(FILE)}`)).status).toBe(405);
    expect((await call(`/api/bytedance/media?url=${encodeURIComponent(FILE)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("follows a redirect only onto ModelArk's own bucket, and only a few", async () => {
    const other = "https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/elsewhere.mp4";
    upstream.mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: other } })).mockResolvedValueOnce(new Response("ok", { headers: { "content-type": "video/mp4" } }));
    expect((await media(FILE)).status).toBe(200);
    expect(upstream.mock.calls.map(([u]) => String(u))).toEqual([FILE, other]);

    for (const location of ["https://evil.example/x.mp4", "http://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/x.mp4", "https://169.254.169.254/", "//evil.example/x"]) {
      upstream.mockReset();
      upstream.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));
      const res = await media(FILE);
      expect(res.status, location).toBe(502);
      expect(await res.json()).toMatchObject({ error: { code: "RedirectNotAllowed" } });
      expect(upstream).toHaveBeenCalledTimes(1);
    }

    upstream.mockReset();
    upstream.mockImplementation(async () => new Response(null, { status: 302, headers: { location: FILE } }));
    expect((await media(FILE)).status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(4);
  });

  it("says what the file host answered; never serves anything but a video or an image as one", async () => {
    upstream.mockResolvedValueOnce(new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403, headers: { "content-type": "application/xml" } }));
    const expired = await media(FILE);
    expect(expired.status).toBe(403);
    expect(await expired.json()).toEqual({ error: { code: "FileHostError", message: "ByteDance's file host answered HTTP 403" } });
    upstream.mockResolvedValueOnce(new Response("oops", { status: 503 }));
    expect((await media(FILE)).status).toBe(502);
    upstream.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await (await media(FILE)).json()).toEqual({ error: { code: "UpstreamUnreachable", message: "Could not reach ByteDance's file host" } });
    upstream.mockResolvedValueOnce(new Response("<script>alert(1)</script>", { headers: { "content-type": "text/html" } }));
    expect((await media(FILE)).headers.get("content-type")).toBe("application/octet-stream");
  });
});

describe("route", () => {
  it("serves GET and POST from the same handler; no other method, and Node's runtime with Vercel Hobby's longest run", () => {
    expect(route.GET).toBe(handleBytedanceProxy);
    expect(route.POST).toBe(handleBytedanceProxy);
    expect(Object.keys(route).sort()).toEqual(["GET", "POST", "maxDuration"]);
    expect(route.maxDuration).toBe(300);
  });
});
