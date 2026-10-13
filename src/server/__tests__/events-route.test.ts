/**
 * `GET /api/events`: the change feed the browser polls. The first call (no cursor)
 * answers `hello`; later calls return every record whose `updated_at` moved since
 * the cursor, plus a tombstone for each deletion, with a small overlap so nothing
 * is missed between two function instances with slightly different clocks.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EventsResponse, Generation } from "../../shared/types.ts";

let dataDir: string;
let app: Hono;
let repo: typeof import("../repo.ts");
let jobs: typeof import("../jobs.ts");
let dbmod: typeof import("../db.ts");

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "higgsfree-events-"));
  process.env.DATA_DIR = dataDir;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:9"; // never reached
  app = (await import("../app.ts")).createApp();
  repo = await import("../repo.ts");
  jobs = await import("../jobs.ts");
  dbmod = await import("../db.ts");
});

afterAll(() => {
  dbmod.closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const events = async (since?: string): Promise<{ res: Response; body: EventsResponse }> => {
  const res = await app.request(since ? `/api/events?since=${encodeURIComponent(since)}` : "/api/events");
  return { res, body: (await res.json()) as EventsResponse };
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const fakeGeneration = (id: string): Generation => {
  const ts = new Date().toISOString();
  return {
    id, type: "image", status: "completed", prompt: "p", model: "google/gemini-3-pro-image", modelName: "Nano Banana Pro",
    params: { aspectRatio: "1:1", size: "1K" }, createdAt: ts, updatedAt: ts,
  };
};

describe("GET /api/events", () => {
  it("answers JSON with a hello event and a cursor when there is no cursor yet", async () => {
    const { res, body } = await events();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.events).toEqual([{ type: "hello", pendingJobs: 0 }]);
    expect(body.pendingJobs).toBe(0);
    expect(Number.isNaN(Date.parse(body.cursor))).toBe(false);
    // Garbage cursors are treated like none at all rather than 400ing the poller.
    expect((await events("not-a-date")).body.events).toEqual([{ type: "hello", pendingJobs: 0 }]);
  });

  it("returns records changed since the cursor, oldest first, and moves the cursor forward", async () => {
    const { body: start } = await events();
    await sleep(5);
    await repo.insertGeneration(fakeGeneration("gen_ev1"));
    await sleep(5);
    await repo.insertGeneration(fakeGeneration("gen_ev2"));
    const { body } = await events(start.cursor);
    const ids = body.events.map((e) => (e.type === "generation" ? e.generation.id : e.type));
    expect(ids).toEqual(["gen_ev1", "gen_ev2"]);
    expect(Date.parse(body.cursor)).toBeGreaterThanOrEqual(Date.parse(start.cursor));
    // Nothing new since: only what falls inside the overlap window comes back again, never anything older.
    await sleep(5);
    const { body: again } = await events(body.cursor);
    expect(again.events.every((e) => e.type === "generation")).toBe(true);
    // An update bumps updated_at, so the record shows up once more with its new status.
    await sleep(5);
    const { body: before } = await events(again.cursor);
    await sleep(5);
    await repo.updateGeneration("gen_ev1", { status: "failed", error: "boom" });
    const { body: after } = await events(before.cursor);
    const ev1 = after.events.find((e) => e.type === "generation" && e.generation.id === "gen_ev1");
    expect(ev1?.type === "generation" && ev1.generation).toMatchObject({ status: "failed", error: "boom" });
  });

  it("delivers a tombstone for a deleted record and never a stale copy of it", async () => {
    const { body: start } = await events();
    await sleep(5);
    await repo.insertGeneration(fakeGeneration("gen_gone"));
    await sleep(5);
    const res = await app.request("/api/generations/gen_gone", { method: "DELETE" });
    expect(await res.json()).toEqual({ ok: true });
    const { body } = await events(start.cursor);
    expect(body.events).toContainEqual({ type: "generation-deleted", id: "gen_gone" });
    expect(body.events.some((e) => e.type === "generation" && e.generation.id === "gen_gone")).toBe(false);
  });

  it("never leaks server-only fields and counts pending jobs", async () => {
    const { body: start } = await events();
    await sleep(5);
    await repo.insertGeneration({ ...fakeGeneration("gen_secret"), type: "video", status: "running", pollingUrl: "https://openrouter.ai/x", lockUntil: new Date(Date.now() + 60_000).toISOString() });
    const { body } = await events(start.cursor);
    const g = body.events.find((e) => e.type === "generation" && e.generation.id === "gen_secret");
    expect(g).toBeDefined();
    expect(JSON.stringify(g)).not.toContain("pollingUrl");
    expect(JSON.stringify(g)).not.toContain("lockUntil");
    expect(body.pendingJobs).toBe(1);
    expect(await jobs.activeJobCount()).toBe(1);
    await repo.deleteGeneration("gen_secret");
  });

  it("polling also sweeps jobs that can never finish", async () => {
    const stale = fakeGeneration("gen_stale_image");
    const old = new Date(Date.now() - jobs.IMAGE_TIMEOUT_MS - 1000).toISOString();
    await repo.insertGeneration({ ...stale, status: "running", createdAt: old, updatedAt: old });
    const { body } = await events();
    expect(body.pendingJobs).toBe(0);
    const g = await repo.getGeneration("gen_stale_image");
    expect(g).toMatchObject({ status: "failed", error: "Timed out: the image request did not finish" });
    await repo.deleteGeneration("gen_stale_image");
  });
});
