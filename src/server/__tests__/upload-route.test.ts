/**
 * `POST /api/upload`: only PNG / JPEG / WebP bytes are accepted (sniffed, the
 * declared MIME is ignored), a good upload lands under `/media/up_*` and is
 * served back with the right Content-Type, and oversized bodies are a 413
 * before they are buffered. Same 413 guard on `POST /api/generate/image`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApiError, UploadResponse } from "../../shared/types.ts";

// ---- a real, minimal PNG: 1×1 grayscale, valid CRCs, zlib-compressed IDAT ----
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  return Buffer.concat([u32(data.length), typed, u32(zlib.crc32(typed))]);
};
const PNG_1X1 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", Buffer.concat([u32(1), u32(1), Buffer.from([8, 0, 0, 0, 0])])), // 8-bit grayscale
  chunk("IDAT", zlib.deflateSync(Buffer.from([0, 0x7f]))), // filter byte + one pixel
  chunk("IEND", Buffer.alloc(0)),
]);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "latin1");
const GIF = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.from([1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0x3b])]);

const dataUrl = (mime: string, bytes: Buffer): string => `data:${mime};base64,${bytes.toString("base64")}`;

let dataDir: string;
let app: Hono;
let dbmod: typeof import("../db.ts");
let media: typeof import("../media.ts");
let generate: typeof import("../routes/generate.ts");

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "higgsfree-upload-"));
  process.env.DATA_DIR = dataDir;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:9"; // never reached
  app = (await import("../app.ts")).createApp();
  dbmod = await import("../db.ts");
  media = await import("../media.ts");
  generate = await import("../routes/generate.ts");
});

afterAll(() => {
  dbmod.closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const postJson = async (url: string, body: string): Promise<Response> =>
  app.request(url, { method: "POST", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body });
const postForm = async (bytes: Buffer, type: string, name: string): Promise<Response> => {
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(bytes)], { type }), name);
  return app.request("/api/upload", { method: "POST", body: form });
};
const UNSUPPORTED = "Unsupported file type. Only PNG, JPEG and WebP images are accepted.";

describe("POST /api/upload rejections", () => {
  it("sanity: the hand-built PNG is a valid image the sniffer understands", () => {
    expect(PNG_1X1.length).toBeLessThan(80);
    expect(zlib.inflateSync(PNG_1X1.subarray(33 + 8, PNG_1X1.length - 12 - 4))).toEqual(Buffer.from([0, 0x7f]));
  });

  it("rejects a PDF sent as multipart", async () => {
    const res = await postForm(PDF, "application/pdf", "doc.pdf");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: UNSUPPORTED, status: 400 });
  });

  it("rejects a GIF, even when the data URL claims image/png", async () => {
    const res = await postJson("/api/upload", JSON.stringify({ dataUrl: dataUrl("image/png", GIF) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: UNSUPPORTED, status: 400 });
    const asGif = await postForm(GIF, "image/gif", "a.gif");
    expect(asGif.status).toBe(400);
  });

  it("rejects an empty file, a missing multipart field and a non-data URL", async () => {
    const empty = await postForm(Buffer.alloc(0), "image/png", "empty.png");
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "Empty file", status: 400 });

    const form = new FormData();
    form.append("other", new Blob([Uint8Array.from(PNG_1X1)], { type: "image/png" }), "a.png");
    const noField = await app.request("/api/upload", { method: "POST", body: form });
    expect(noField.status).toBe(400);
    expect(((await noField.json()) as ApiError).error).toContain('"file" field');

    const notData = await postJson("/api/upload", JSON.stringify({ dataUrl: "https://example.com/a.png" }));
    expect(notData.status).toBe(400);
    expect(await notData.json()).toEqual({ error: "dataUrl must be a base64 data URL", status: 400 });
    expect(fs.existsSync(path.join(dataDir, "media", "uploads")) ? fs.readdirSync(path.join(dataDir, "media", "uploads")) : []).toEqual([]);
  });
});

describe("POST /api/upload accepts a real PNG", () => {
  it("as a JSON data URL, and serves it back from /media with image/png", async () => {
    const res = await postJson("/api/upload", JSON.stringify({ dataUrl: dataUrl("image/png", PNG_1X1) }));
    expect(res.status).toBe(200);
    const { media: ref } = (await res.json()) as UploadResponse;
    expect(ref.url).toMatch(/^\/media\/up_[A-Za-z0-9_-]{12}\.png$/);
    expect(ref).toMatchObject({ mime: "image/png", bytes: PNG_1X1.length, width: 1, height: 1 });
    expect(fs.readFileSync(path.join(dataDir, "media", "uploads", path.basename(ref.url)))).toEqual(PNG_1X1);

    const served = await app.request(ref.url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("content-length")).toBe(String(PNG_1X1.length));
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG_1X1);
  });

  it("as multipart/form-data, ignoring the declared MIME", async () => {
    const res = await postForm(PNG_1X1, "application/octet-stream", "whatever.bin");
    expect(res.status).toBe(200);
    const { media: ref } = (await res.json()) as UploadResponse;
    expect(ref.url).toMatch(/^\/media\/up_[A-Za-z0-9_-]+\.png$/);
    expect(ref.mime).toBe("image/png");
    expect((await app.request(ref.url)).headers.get("content-type")).toBe("image/png");
  });
});

describe("body limits", () => {
  /** Mirrors `limit` in routes/upload.ts (not exported): 25 MB + base64 / multipart overhead. */
  const uploadBodyLimit = (): number => Math.ceil(media.MAX_UPLOAD_BYTES * 1.37) + 4096;

  it("POST /api/upload returns 413 for a body just over the limit, without touching disk", async () => {
    const UPLOAD_BODY_LIMIT = uploadBodyLimit();
    const prefix = '{"dataUrl":"data:image/png;base64,';
    const suffix = '"}';
    const body = prefix + "A".repeat(UPLOAD_BODY_LIMIT + 1 - prefix.length - suffix.length) + suffix;
    expect(Buffer.byteLength(body)).toBe(UPLOAD_BODY_LIMIT + 1);
    const before = fs.readdirSync(path.join(dataDir, "media", "uploads")).length;
    const res = await postJson("/api/upload", body);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "File exceeds the 25 MB upload limit", status: 413 });
    expect(fs.readdirSync(path.join(dataDir, "media", "uploads")).length).toBe(before);
  });

  it("POST /api/upload returns 413 when the decoded file itself is over 25 MB", async () => {
    // Fits under the transport limit but decodes to MAX_UPLOAD_BYTES + 1 bytes: `saveUpload` refuses it.
    const png = Buffer.concat([PNG_1X1, Buffer.alloc(media.MAX_UPLOAD_BYTES + 1 - PNG_1X1.length)]);
    const body = JSON.stringify({ dataUrl: dataUrl("image/png", png) });
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(uploadBodyLimit());
    const res = await postJson("/api/upload", body);
    expect(res.status).toBe(413);
    expect(((await res.json()) as ApiError).error).toContain("25 MB");
  });

  it("POST /api/generate/image returns 413 for a streamed body over GENERATE_BODY_LIMIT", async () => {
    const limit = generate.GENERATE_BODY_LIMIT;
    expect(limit).toBeGreaterThan(uploadBodyLimit());
    // One shared 1 MiB chunk enqueued repeatedly: the body is limit + 1 bytes on the wire, ~1 MiB in RAM.
    const piece = new Uint8Array(1024 * 1024).fill(0x41);
    let remaining = limit + 1;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (remaining <= 0) return controller.close();
        const n = Math.min(remaining, piece.length);
        controller.enqueue(n === piece.length ? piece : piece.subarray(0, n));
        remaining -= n;
      },
    });
    const res = await app.request("/api/generate/image", {
      method: "POST",
      headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(413);
    const err = (await res.json()) as ApiError;
    expect(err.status).toBe(413);
    expect(err.error).toContain(`Request body exceeds ${Math.round(limit / 1024 / 1024)} MB`);
    expect(err.error).toContain("/api/upload");
  });

  it("POST /api/generate/image returns 413 when Content-Length alone announces an oversized body", async () => {
    const res = await app.request("/api/generate/image", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(generate.GENERATE_BODY_LIMIT + 1) },
      body: "{}",
    });
    expect(res.status).toBe(413);
  });
});
