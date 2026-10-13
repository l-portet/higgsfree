import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotenv, parseHost } from "./env.ts";
import { parseAllowedHosts } from "./security.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadDotenv(path.join(projectRoot, ".env"));

function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const dataDir = path.resolve(projectRoot, process.env.DATA_DIR?.trim() || "./data");
const mediaDir = path.join(dataDir, "media");
const uploadsDir = path.join(mediaDir, "uploads");
const appUrl = process.env.APP_URL?.trim() || "http://localhost:8787";

export const DEFAULT_MAX_ACTIVE_JOBS = 8;

export const config = {
  projectRoot,
  nodeEnv,
  isProd: nodeEnv === "production",
  /** Interface to bind (`HOST`). Loopback by default; `0.0.0.0` exposes the app to the network. */
  host: parseHost(process.env.HOST),
  port: positiveInt(process.env.PORT, 8787),
  dataDir,
  mediaDir,
  uploadsDir,
  dbFile: path.join(dataDir, "openhiggsfield.sqlite"),
  distDir: path.join(projectRoot, "dist", "client"),
  envApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
  appUrl,
  appName: process.env.APP_NAME?.trim() || "Open Higgsfield",
  /** Hostnames accepted in `Host` / `Origin` (`ALLOWED_HOSTS`, plus loopback + `APP_URL`); `"*"` disables the check. */
  allowedHosts: parseAllowedHosts(process.env.ALLOWED_HOSTS, appUrl),
  /** Ceiling on pending + running generations across the whole instance (`MAX_ACTIVE_JOBS`). */
  maxActiveJobs: positiveInt(process.env.MAX_ACTIVE_JOBS, DEFAULT_MAX_ACTIVE_JOBS),
  version: readVersion(),
} as const;

/** Error raised when `DATA_DIR` cannot be created or written; `message` is user-facing. */
export class DataDirError extends Error {
  readonly code: string;
  constructor(dir: string, code: string) {
    super(`DATA_DIR ${dir} is not writable (${code})`);
    this.name = "DataDirError";
    this.code = code;
  }
}

/** Create `DATA_DIR/media/uploads` and verify the data dir is writable. Throws `DataDirError`. */
export function ensureDataDirs(): void {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
    fs.accessSync(uploadsDir, fs.constants.W_OK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
    throw new DataDirError(dataDir, code);
  }
}
