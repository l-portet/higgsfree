/**
 * Host / Origin / Content-Type guard: cross-origin "simple requests" and DNS
 * rebinding must never reach a credit-spending route.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { Hono as HonoApp } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hostnameOf, isAllowedHost, originHostname, parseAllowedHosts, securityGuard } from "../security.ts";

const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const str = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const PNG_2X2 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), ...str("IHDR"), ...u32(2), ...u32(2), 8, 6, 0, 0, 0, ...u32(0),
]);
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG_2X2).toString("base64")}`;

describe("parseAllowedHosts / hostnameOf", () => {
  it("always includes loopback names and the APP_URL host, plus ALLOWED_HOSTS entries", () => {
    const set = parseAllowedHosts(" studio.example , 192.168.1.20:8787, https://Tailnet.ts.net/x, [::1]:9", "https://higgs.example.com:8443");
    expect(set).not.toBe("*");
    if (set === "*") return;
    expect([...set].sort()).toEqual(["0.0.0.0", "127.0.0.1", "192.168.1.20", "::1", "higgs.example.com", "localhost", "studio.example", "tailnet.ts.net"]);
  });
  it("treats * as allow-all", () => {
    expect(parseAllowedHosts("localhost, *")).toBe("*");
    expect(isAllowedHost("*", "anything.example")).toBe(true);
    expect(isAllowedHost("*", undefined)).toBe(true);
  });
  it("strips ports and IPv6 brackets from Host headers", () => {
    expect(hostnameOf("localhost:8787")).toBe("localhost");
    expect(hostnameOf("LOCALHOST.")).toBe("localhost");
    expect(hostnameOf("[::1]:8787")).toBe("::1");
    expect(hostnameOf("::1")).toBe("::1");
    expect(hostnameOf("")).toBeUndefined();
    expect(hostnameOf("[::1")).toBeUndefined();
  });
  it("reads Origin hostnames and rejects null / garbage", () => {
    expect(originHostname("http://localhost:5173")).toBe("localhost");
    expect(originHostname("https://evil.example")).toBe("evil.example");
    expect(originHostname("null")).toBeUndefined();
    expect(originHostname(undefined)).toBeUndefined();
  });
});

describe("securityGuard (unit)", () => {
  const build = (allowed: ReturnType<typeof parseAllowedHosts>): HonoApp => {
    const app = new Hono();
    app.use("*", securityGuard({ allowedHosts: allowed }));
    app.post("/api/x", (c) => c.json({ ok: true }));
    app.delete("/api/x", (c) => c.json({ ok: true }));
    app.get("/api/x", (c) => c.json({ ok: true }));
    app.get("/media/f.png", (c) => c.text("png"));
    return app;
  };
  const strict = build(parseAllowedHosts(undefined, "http://localhost:8787"));

  it("ALLOWED_HOSTS=* allows any Host and Origin", async () => {
    const open = build(parseAllowedHosts("*"));
    expect((await open.request("/api/x", { headers: { host: "evil.example" } })).status).toBe(200);
    const res = await open.request("/api/x", {
      method: "POST", headers: { host: "anything.example", origin: "https://other.example", "content-type": "application/json", "content-length": "2" }, body: "{}",
    });
    expect(res.status).toBe(200);
  });

  it("rejects an unknown Host on API, media and page routes", async () => {
    expect((await strict.request("/api/x", { headers: { host: "evil.example" } })).status).toBe(403);
    expect((await strict.request("/media/f.png", { headers: { host: "evil.example:8787" } })).status).toBe(403);
    expect((await strict.request("/api/x", { headers: { host: "[::1]:8787" } })).status).toBe(200);
    expect((await strict.request("/api/x", { headers: { host: "127.0.0.1:8787" } })).status).toBe(200);
  });

  it("lets a bodiless DELETE / POST through without a Content-Type (browser fetch sends none)", async () => {
    expect((await strict.request("/api/x", { method: "DELETE" })).status).toBe(200);
    expect((await strict.request("/api/x", { method: "POST", headers: { "content-length": "0" } })).status).toBe(200);
  });

  it("accepts Origin from the Vite dev server (same hostname, different port)", async () => {
    const res = await strict.request("/api/x", {
      method: "POST", headers: { origin: "http://localhost:5173", "sec-fetch-site": "same-site", "content-type": "application/json", "content-length": "2" }, body: "{}",
    });
    expect(res.status).toBe(200);
  });
});

describe("securityGuard (real app)", () => {
  let app: HonoApp;
  let dataDir: string;
  let dbmod: typeof import("../db.ts");

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openhiggsfield-sec-"));
    process.env.DATA_DIR = dataDir;
    process.env.NODE_ENV = "test";
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:9"; // never reached
    delete process.env.ALLOWED_HOSTS;
    app = (await import("../app.ts")).createApp();
    dbmod = await import("../db.ts");
  });
  afterAll(() => {
    dbmod.closeDatabase();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const uploadJson = JSON.stringify({ dataUrl: PNG_DATA_URL });
  const jsonHeaders = { "content-type": "application/json", "content-length": String(Buffer.byteLength(uploadJson)) };

  it("415 for a text/plain POST (CORS simple request) to /api/upload", async () => {
    const res = await app.request("/api/upload", { method: "POST", headers: { ...jsonHeaders, "content-type": "text/plain" }, body: uploadJson });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "Content-Type must be application/json", status: 415 });
    const form = await app.request("/api/settings", { method: "PUT", headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "9" }, body: "apiKey=xx" });
    expect(form.status).toBe(415);
  });

  it("403 for Sec-Fetch-Site: cross-site", async () => {
    const res = await app.request("/api/upload", { method: "POST", headers: { ...jsonHeaders, "sec-fetch-site": "cross-site" }, body: uploadJson });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain("Cross-site");
  });

  it("403 for a foreign Origin, including Origin: null", async () => {
    const res = await app.request("/api/upload", { method: "POST", headers: { ...jsonHeaders, origin: "https://evil.example" }, body: uploadJson });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Origin not allowed", status: 403 });
    const nul = await app.request("/api/generate/image", { method: "POST", headers: { ...jsonHeaders, origin: "null" }, body: "{}" });
    expect(nul.status).toBe(403);
  });

  it("403 Unrecognised Host for DNS rebinding, even on /api/health and /media", async () => {
    const res = await app.request("/api/health", { headers: { host: "evil.example" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Unrecognised Host", status: 403 });
    expect((await app.request("/media/gen_x.png", { headers: { host: "evil.example:8787" } })).status).toBe(403);
    expect((await app.request("/api/health", { headers: { host: "127.0.0.1:8787" } })).status).toBe(200);
  });

  it("same-origin JSON POST and multipart upload still work", async () => {
    const json = await app.request("/api/upload", { method: "POST", headers: { ...jsonHeaders, origin: "http://localhost:5173", "sec-fetch-site": "same-origin" }, body: uploadJson });
    expect(json.status).toBe(200);
    expect(((await json.json()) as { media: { width: number } }).media.width).toBe(2);

    const form = new FormData();
    form.append("file", new Blob([PNG_2X2], { type: "image/png" }), "a.png");
    const multipart = await app.request("/api/upload", { method: "POST", headers: { origin: "http://localhost:8787", "transfer-encoding": "chunked" }, body: form });
    expect(multipart.status).toBe(200);
    expect(multipart.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sends nosniff on media responses", async () => {
    const res = await app.request("/media/gen_missing.png");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
