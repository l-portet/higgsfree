/** Boot failures must be one readable line and exit code 1 (not 0, not a stack trace). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const entry = path.join(root, "src", "server", "index.ts");

function boot(env: Record<string, string>): { status: number | null; out: string } {
  const r = spawnSync(tsx, [entry], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "test", OPENROUTER_API_KEY: "test-key", OPENROUTER_BASE_URL: "http://127.0.0.1:9", ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

describe("server boot", () => {
  it("exits 1 with a clear message when DATA_DIR is not writable", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openhiggsfield-boot-"));
    const file = path.join(tmp, "not-a-dir");
    fs.writeFileSync(file, "x");
    try {
      const { status, out } = boot({ DATA_DIR: path.join(file, "data"), PORT: "0" });
      expect(status).toBe(1);
      expect(out).toContain(`DATA_DIR ${path.join(file, "data")} is not writable (ENOTDIR)`);
      expect(out).not.toContain("    at "); // no stack trace
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 40_000);

  it("exits 1 when the port is already in use", async () => {
    // Bind the same loopback address the server uses by default (HOST=127.0.0.1); a
    // wildcard listener would not conflict with it on BSD/macOS, so the server would start.
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const addr = blocker.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openhiggsfield-boot-"));
    try {
      const { status, out } = boot({ DATA_DIR: tmp, PORT: String(port) });
      expect(status).toBe(1);
      expect(out).toContain(`port ${port} is already in use`);
    } finally {
      blocker.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 40_000);
});
