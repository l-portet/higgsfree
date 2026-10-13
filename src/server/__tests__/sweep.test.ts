/**
 * Boot sweep: a crash mid-download leaves `.gen_<id>.<pid>.part` (and an atomic
 * write leaves `<file>.<pid>.tmp`) in the media dir forever. `resumePendingJobs`
 * (what index.ts calls once the server listens) removes the stale ones first.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dataDir: string;
let jobs: typeof import("../jobs.ts");
let media: typeof import("../media.ts");
let dbmod: typeof import("../db.ts");

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openhiggsfield-sweep-"));
  process.env.DATA_DIR = dataDir;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:9";
  process.env.NODE_ENV = "test";
  media = await import("../media.ts");
  jobs = await import("../jobs.ts");
  dbmod = await import("../db.ts");
});

afterAll(() => {
  jobs.stopPoller();
  dbmod.closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Create `file` with an mtime `ageMs` in the past. */
function touch(file: string, ageMs: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x");
  const t = (Date.now() - ageMs) / 1000;
  fs.utimesSync(file, t, t);
}

describe("boot sweep of orphaned temp files", () => {
  it("removes stale .part / .tmp files under media/ and media/uploads/, keeps everything else", () => {
    const mediaDir = path.join(dataDir, "media");
    const stalePart = path.join(mediaDir, ".gen_x.123.part");
    const staleTmp = path.join(mediaDir, "gen_y.png.123.tmp");
    const staleUploadTmp = path.join(mediaDir, "uploads", "up_z.png.123.tmp");
    const freshPart = path.join(mediaDir, ".gen_new.456.part"); // another process may still be streaming into it
    const output = path.join(mediaDir, "gen_keep.mp4");
    const upload = path.join(mediaDir, "uploads", "up_keep.png");
    const unrelated = path.join(mediaDir, ".DS_Store");
    for (const f of [stalePart, staleTmp, staleUploadTmp, output, upload, unrelated]) touch(f, 60_000);
    touch(freshPart, 0);

    jobs.resumePendingJobs();

    expect(fs.existsSync(stalePart)).toBe(false);
    expect(fs.existsSync(staleTmp)).toBe(false);
    expect(fs.existsSync(staleUploadTmp)).toBe(false);
    expect(fs.existsSync(freshPart)).toBe(true);
    expect(fs.existsSync(output)).toBe(true);
    expect(fs.existsSync(upload)).toBe(true);
    expect(fs.existsSync(unrelated)).toBe(true);
    expect(jobs.pollerRunning()).toBe(false); // nothing to resume
    expect(media.sweepTempFiles()).toBe(0); // idempotent; the fresh .part is still too young
  });

  it("copes with a media dir that does not exist yet", () => {
    fs.rmSync(path.join(dataDir, "media"), { recursive: true, force: true });
    expect(media.sweepTempFiles()).toBe(0);
  });
});
