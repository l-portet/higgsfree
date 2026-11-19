/**
 * The Replicate pass-through: only the calls the app makes reach Replicate, at exactly its API host; the key is
 * forwarded once and never echoed, logged or kept; Replicate's answers come back as they are, a prediction without
 * the input it echoes.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { REPLICATE_PROXY_MAX_BODY_BYTES } from "@shared/replicate-proxy";
import { taskUrl } from "@/lib/replicate";
import * as route from "../../app/api/replicate/[...path]/route";
import { handleReplicateProxy, replicateTarget } from "../replicate-proxy";

const ORIGIN = "https://higgsfree.example";
const KEY = "r8_secret0123456789";
const AUTH = { Authorization: `Bearer ${KEY}` };
const JSON_AUTH = { ...AUTH, "Content-Type": "application/json" };
const SUBMIT = "/api/replicate/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions";
const PREDICTION = "/api/replicate/v1/predictions/gm3qorzdhgbfurvjtvhg6dckhu";
const ACCOUNT = "/api/replicate/v1/account";

const call = (path: string, init: RequestInit = {}): Promise<Response> => handleReplicateProxy(new Request(`${ORIGIN}${path}`, init));
const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

let upstream: MockInstance<typeof fetch>;
let consoles: MockInstance[];

beforeEach(() => {
  upstream = vi.fn<typeof fetch>(async () => json(201, { id: "gm3qorzdhgbfurvjtvhg6dckhu", status: "starting" }));
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

describe("Replicate calls", () => {
  it("passes exactly the app's three calls on, to Replicate's API host and nowhere else", async () => {
    const body = JSON.stringify({ input: { prompt: "a fox" } });
    expect((await call(SUBMIT, { method: "POST", headers: JSON_AUTH, body })).status).toBe(201);
    const [url, init] = sent();
    expect(url).toBe("https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "manual", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" } });
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(body);

    upstream.mockClear();
    await call(PREDICTION, { headers: AUTH });
    expect(sent()).toEqual(["https://api.replicate.com/v1/predictions/gm3qorzdhgbfurvjtvhg6dckhu", expect.objectContaining({ method: "GET", headers: { Authorization: `Bearer ${KEY}` } })]);

    upstream.mockClear();
    await call(ACCOUNT, { headers: AUTH });
    expect(sent()[0]).toBe("https://api.replicate.com/v1/account");
  });

  it("sends nothing of the browser's request on but the key and the body", async () => {
    await call(SUBMIT, { method: "POST", headers: { ...JSON_AUTH, Prefer: "wait=60", Cookie: "session=1", "X-Forwarded-For": "1.2.3.4", "Cancel-After": "5s" }, body: "{}" });
    expect(sent()[1].headers).toEqual({ Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
  });

  it("refuses every other path, method and query before anything leaves the server", async () => {
    const refused: [string, RequestInit, number][] = [
      // Replicate's other calls: versions, deployments, files, trainings, cancelling, listing.
      ["/api/replicate/v1/predictions", { method: "POST", headers: JSON_AUTH, body: "{}" }, 404],
      ["/api/replicate/v1/predictions", { headers: AUTH }, 404],
      [`${PREDICTION}/cancel`, { method: "POST", headers: AUTH }, 404],
      ["/api/replicate/v1/files", { method: "POST", headers: AUTH }, 404],
      ["/api/replicate/v1/models", { headers: AUTH }, 404],
      ["/api/replicate/v1/models/black-forest-labs/flux-dev", { headers: AUTH }, 404],
      ["/api/replicate/v1/models/black-forest-labs/flux-dev/versions", { headers: AUTH }, 404],
      ["/api/replicate/v1/deployments/acme/app/predictions", { method: "POST", headers: JSON_AUTH, body: "{}" }, 404],
      ["/api/replicate/v1/account/extra", { headers: AUTH }, 404],
      ["/api/replicate/v2/account", { headers: AUTH }, 404],
      ["/api/replicate/media", { method: "POST", headers: JSON_AUTH, body: "{}" }, 404],
      ["/api/replicate", { headers: AUTH }, 404],
      // The right paths, the wrong way.
      [SUBMIT, { headers: AUTH }, 405],
      [SUBMIT, { method: "PUT", headers: JSON_AUTH, body: "{}" }, 405],
      [PREDICTION, { method: "POST", headers: JSON_AUTH, body: "{}" }, 405],
      [PREDICTION, { method: "DELETE", headers: AUTH }, 405],
      [ACCOUNT, { method: "POST", headers: JSON_AUTH, body: "{}" }, 405],
      [`${SUBMIT}?wait=1`, { method: "POST", headers: JSON_AUTH, body: "{}" }, 400],
      [`${PREDICTION}?expand=1`, { headers: AUTH }, 400],
      [`${ACCOUNT}?x=1`, { headers: AUTH }, 400],
    ];
    for (const [path, init, status] of refused) {
      const res = await call(path, init);
      expect([path, init.method ?? "GET", res.status]).toEqual([path, init.method ?? "GET", status]);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("only runs models and polls predictions of Replicate's own shape", async () => {
    const run = (model: string): Promise<Response> => call(`/api/replicate/v1/models/${model}/predictions`, { method: "POST", headers: JSON_AUTH, body: "{}" });
    for (const model of ["Black-Forest/flux", "acme/.hidden", "acme/a%2Fb", "acme/a b", "acme/a@evil.example", `acme/${"a".repeat(65)}`]) {
      expect([model, (await run(model)).status]).toEqual([model, 400]);
    }
    // A dot segment is resolved by the url before it is read, so it lands on a path that is not a call at all.
    expect((await run("acme/..")).status).toBe(404);
    for (const id of ["abc", "GM3QORZDHGBFURVJTVHG6DCKHU", "gm3qorzd-hgbfurvj", "gm3qorzd%2Fcancel", "gm3qorzd.hgbfurvj", "a".repeat(65)]) {
      expect([id, (await call(`/api/replicate/v1/predictions/${id}`, { headers: AUTH })).status]).toEqual([id, 400]);
    }
    expect(upstream).not.toHaveBeenCalled();
    expect(replicateTarget("GET", new URL(`${ORIGIN}${PREDICTION}`))).toEqual({ target: "https://api.replicate.com/v1/predictions/gm3qorzdhgbfurvjtvhg6dckhu", body: false, prediction: true });
    // The id the client polls is one the pass-through takes.
    expect(taskUrl("gm3qorzdhgbfurvjtvhg6dckhu")).toBe(PREDICTION);
    expect(() => taskUrl("../account")).toThrow(/does not recognise/);
  });

  it("needs a Bearer key, a JSON body to submit, and no more than the size Vercel lets through", async () => {
    expect((await call(ACCOUNT)).status).toBe(401);
    expect((await call(ACCOUNT, { headers: { Authorization: "Token r8_x" } })).status).toBe(401);
    expect((await call(ACCOUNT, { headers: { Authorization: `Bearer ${KEY} extra` } })).status).toBe(401);
    expect((await call(SUBMIT, { method: "POST", headers: { ...AUTH, "Content-Type": "text/plain" }, body: "{}" })).status).toBe(415);
    expect((await call(SUBMIT, { method: "POST", headers: { ...AUTH, "Content-Type": "multipart/form-data; boundary=x" }, body: "x" })).status).toBe(415);
    const big = await call(SUBMIT, { method: "POST", headers: JSON_AUTH, body: JSON.stringify({ input: { image: "a".repeat(REPLICATE_PROXY_MAX_BODY_BYTES) } }) });
    expect(big.status).toBe(413);
    expect(await big.json()).toMatchObject({ title: "RequestTooLarge", detail: expect.stringContaining("4 MB") });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("answers with Replicate's own status and body, so the browser shows its real errors", async () => {
    upstream.mockResolvedValueOnce(json(422, { title: "Input validation failed", detail: "- input.aspect_ratio: must be one of 16:9, 9:16", status: 422 }, { "content-type": "application/problem+json", "set-cookie": "a=b" }));
    const refused = await call(SUBMIT, { method: "POST", headers: JSON_AUTH, body: "{}" });
    expect(refused.status).toBe(422);
    expect(refused.headers.get("content-type")).toBe("application/problem+json");
    // Only the content type is taken from Replicate's headers.
    expect(refused.headers.get("set-cookie")).toBeNull();
    expect(refused.headers.get("cache-control")).toBe("no-store");
    expect(await refused.json()).toEqual({ title: "Input validation failed", detail: "- input.aspect_ratio: must be one of 16:9, 9:16", status: 422 });

    upstream.mockResolvedValueOnce(json(402, { title: "Insufficient credit", detail: "You have insufficient credit to run this model.", status: 402 }));
    expect((await call(SUBMIT, { method: "POST", headers: JSON_AUTH, body: "{}" })).status).toBe(402);

    upstream.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }));
    const html = await call(PREDICTION, { headers: AUTH });
    expect([html.status, await html.text()]).toEqual([502, "<html>bad gateway</html>"]);
  });

  it("hands a prediction back without the input it echoes or its logs; the account is passed whole", async () => {
    const image = `data:image/png;base64,${"A".repeat(4096)}`;
    const prediction = { id: "gm3qorzdhgbfurvjtvhg6dckhu", status: "succeeded", input: { prompt: "a fox", image }, logs: "Using seed 42", output: ["https://replicate.delivery/xezq/a/out-0.png"], error: null, metrics: { predict_time: 3 } };
    upstream.mockResolvedValueOnce(json(200, prediction));
    const polled = await call(PREDICTION, { headers: AUTH });
    expect(polled.status).toBe(200);
    expect(await polled.json()).toEqual({ id: prediction.id, status: "succeeded", output: prediction.output, error: null, metrics: { predict_time: 3 } });

    upstream.mockResolvedValueOnce(json(201, { ...prediction, status: "starting", output: null }));
    const created = await call(SUBMIT, { method: "POST", headers: JSON_AUTH, body: JSON.stringify({ input: prediction.input }) });
    expect(created.status).toBe(201);
    expect(await created.text()).not.toContain("data:image");

    // A success that is not a JSON object goes back as it came.
    upstream.mockResolvedValueOnce(new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }));
    const odd = await call(PREDICTION, { headers: AUTH });
    expect([odd.status, odd.headers.get("content-type"), await odd.text()]).toEqual([200, "text/plain", "not json"]);

    upstream.mockResolvedValueOnce(json(200, { type: "user", username: "tester", input: "kept: not a prediction" }));
    expect(await (await call(ACCOUNT, { headers: AUTH })).json()).toEqual({ type: "user", username: "tester", input: "kept: not a prediction" });
  });

  it("never echoes the key: not in its answers, not in an error, not kept for the next call", async () => {
    upstream.mockRejectedValueOnce(new Error(`connect ECONNREFUSED with Bearer ${KEY}`));
    const down = await call(ACCOUNT, { headers: AUTH });
    expect(down.status).toBe(502);
    expect(await down.text()).not.toContain(KEY);

    upstream.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    const slow = await call(PREDICTION, { headers: AUTH });
    expect([slow.status, (await slow.json()).title]).toEqual([504, "UpstreamTimeout"]);

    const answers = [await call(ACCOUNT), await call("/api/replicate/v1/nope", { headers: AUTH }), await call(SUBMIT, { method: "POST", headers: { ...AUTH, "Content-Type": "text/plain" }, body: "{}" })];
    for (const res of answers) {
      expect(await res.text()).not.toContain(KEY);
      expect([...res.headers.values()].join(" ")).not.toContain(KEY);
    }
    // The next caller's request carries its own key only.
    upstream.mockClear();
    await call(ACCOUNT, { headers: { Authorization: "Bearer r8_another" } });
    expect(sent()[1].headers).toEqual({ Authorization: "Bearer r8_another" });
  });

  it("does not follow a redirect from Replicate (the key would go with it)", async () => {
    upstream.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }));
    const res = await call(ACCOUNT, { headers: AUTH });
    expect([res.status, (await res.json()).title]).toEqual([502, "UpstreamRedirect"]);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});

describe("route", () => {
  it("serves GET and POST from the same handler; no other method, on Node's runtime", () => {
    expect(route.GET).toBe(handleReplicateProxy);
    expect(route.POST).toBe(handleReplicateProxy);
    expect(Object.keys(route).sort()).toEqual(["GET", "POST", "maxDuration"]);
    expect(route.maxDuration).toBeGreaterThan(100);
  });
});
