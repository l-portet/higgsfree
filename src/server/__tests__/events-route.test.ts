/**
 * `GET /api/events`: an SSE stream that opens with a `hello` frame, forwards every
 * event published on the in-process bus, keeps the connection alive with a
 * comment ping, and tears its subscriber down when the client goes away.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Generation, ServerEvent } from "../../shared/types.ts";

let dataDir: string;
let app: Hono;
let events: typeof import("../events.ts");
let dbmod: typeof import("../db.ts");

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openhiggsfield-events-"));
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:9"; // never reached
  app = (await import("../app.ts")).createApp();
  events = await import("../events.ts");
  dbmod = await import("../db.ts");
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  events.closeAllStreams();
  dbmod.closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
};

/** Reads one `\n\n`-terminated SSE frame at a time from a streaming response. */
class SseClient {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private buffer = "";

  constructor(readonly res: Response) {
    if (!res.body) throw new Error("no response body");
    this.reader = res.body.getReader();
  }

  async frame(timeoutMs = 2000): Promise<string> {
    for (;;) {
      const end = this.buffer.indexOf("\n\n");
      if (end >= 0) {
        const frame = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 2);
        return frame;
      }
      const { done, value } = await withTimeout(this.reader.read(), timeoutMs, "an SSE frame");
      if (done) throw new Error("stream ended");
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  /** Next frame parsed as a `data:` JSON event. */
  async event(timeoutMs?: number): Promise<ServerEvent> {
    const frame = await this.frame(timeoutMs);
    const data = frame
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => l.slice("data: ".length))
      .join("\n");
    return JSON.parse(data) as ServerEvent;
  }

  /** What the node server does when the socket closes: cancel the response body. */
  disconnect(): Promise<void> {
    return this.reader.cancel();
  }
}

const connect = async (): Promise<SseClient> => new SseClient(await app.request("/api/events"));
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const fakeGeneration = (id: string): Generation => {
  const ts = new Date().toISOString();
  return {
    id, type: "image", status: "completed", prompt: "p", model: "google/gemini-3-pro-image", modelName: "Nano Banana Pro",
    params: { aspectRatio: "1:1", size: "1K" }, createdAt: ts, updatedAt: ts,
  };
};

describe("GET /api/events", () => {
  it("answers with text/event-stream and a hello frame first", async () => {
    const client = await connect();
    expect(client.res.status).toBe(200);
    expect(client.res.headers.get("content-type")).toContain("text/event-stream");
    expect(client.res.headers.get("cache-control")).toBe("no-cache");
    expect(client.res.headers.get("x-accel-buffering")).toBe("no");
    expect(events.openStreamCount()).toBe(1);

    const frame = await client.frame();
    expect(frame).toBe('data: {"type":"hello","pendingJobs":0}');
    await client.disconnect();
    await tick();
    expect(events.openStreamCount()).toBe(0);
  });

  it("forwards events published on the bus, in order", async () => {
    const client = await connect();
    expect((await client.event()).type).toBe("hello");

    events.publishGeneration(fakeGeneration("gen_sse1"));
    events.publishGenerationDeleted("gen_gone");
    events.publishGeneration(fakeGeneration("gen_sse2"));

    const first = await client.event();
    expect(first.type).toBe("generation");
    if (first.type === "generation") expect(first.generation).toMatchObject({ id: "gen_sse1", status: "completed", modelName: "Nano Banana Pro" });
    expect(await client.event()).toEqual({ type: "generation-deleted", id: "gen_gone" });
    const third = await client.event();
    expect(third.type === "generation" && third.generation.id).toBe("gen_sse2");

    await client.disconnect();
    await tick();
    expect(events.openStreamCount()).toBe(0);
  });

  it("fans one event out to every open stream and counts them independently", async () => {
    const a = await connect();
    const b = await connect();
    expect(events.openStreamCount()).toBe(2);
    await a.event();
    await b.event();
    events.publishGenerationDeleted("gen_both");
    expect(await a.event()).toEqual({ type: "generation-deleted", id: "gen_both" });
    expect(await b.event()).toEqual({ type: "generation-deleted", id: "gen_both" });

    await a.disconnect();
    await tick();
    expect(events.openStreamCount()).toBe(1);
    // b is still served after a left.
    events.publishGenerationDeleted("gen_only_b");
    expect(await b.event()).toEqual({ type: "generation-deleted", id: "gen_only_b" });
    await b.disconnect();
    await tick();
    expect(events.openStreamCount()).toBe(0);
  });

  it("unsubscribes on disconnect so later publishes hit no dead stream", async () => {
    const client = await connect();
    await client.event();
    await client.disconnect();
    await tick();
    expect(events.openStreamCount()).toBe(0);
    // Nothing is listening any more; publishing must be a no-op rather than a write to a closed stream.
    expect(() => {
      events.publishGeneration(fakeGeneration("gen_after_close"));
      events.publishGenerationDeleted("gen_after_close");
    }).not.toThrow();
    // A second cancel on an already-cleaned stream is harmless too.
    await expect(client.disconnect()).resolves.toBeUndefined();
    expect(events.openStreamCount()).toBe(0);
  });

  it("closeAllStreams() ends every open connection (server shutdown)", async () => {
    const a = await connect();
    const b = await connect();
    await a.event();
    await b.event();
    expect(events.openStreamCount()).toBe(2);
    events.closeAllStreams();
    expect(events.openStreamCount()).toBe(0);
    // The handler resolves and hono closes the body: readers see end-of-stream, not a hang.
    await expect(a.frame(2000)).rejects.toThrow("stream ended");
    await expect(b.frame(2000)).rejects.toThrow("stream ended");
  });

  it("sends a comment ping every 15 s and stops the timer on disconnect", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const client = await connect();
    await client.event();
    expect(vi.getTimerCount()).toBe(1); // the ping interval
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await client.frame()).toBe(": ping");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await client.frame()).toBe(": ping");

    await client.disconnect();
    await tick();
    expect(events.openStreamCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0); // clearInterval ran in cleanup
  });
});
