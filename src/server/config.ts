/**
 * Runtime configuration from the environment. Next.js loads `.env` / `.env.local`
 * itself, so there is no dotenv loader here and nothing is read from disk.
 *
 * Storage picks itself from the environment:
 *  - `BLOB_READ_WRITE_TOKEN` set (Vercel Blob)  → media go to the blob store;
 *  - `TURSO_DATABASE_URL` set (Turso / libSQL)   → the database is remote;
 *  - otherwise everything lives under `DATA_DIR`: a SQLite file plus media on disk.
 * Either half can be local or remote independently; on Vercel both must be remote.
 */
import path from "node:path";
import pkg from "../../package.json";
import { parseAllowedHosts } from "./security.ts";

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const projectRoot = process.cwd();
const nodeEnv = process.env.NODE_ENV ?? "development";
const onVercel = process.env.VERCEL === "1";
// Configurable, so not statically scoped: the hint stops Turbopack from tracing the whole project into the function bundle.
const dataDir = path.resolve(/* turbopackIgnore: true */ projectRoot, process.env.DATA_DIR?.trim() || "./data");
const mediaDir = path.join(dataDir, "media");
const uploadsDir = path.join(mediaDir, "uploads");

// Vercel exposes every hostname a deployment answers to; they are always allowed so previews and
// the production domain work without configuration. Custom domains go in ALLOWED_HOSTS / APP_URL.
const vercelHosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL];
const appUrl =
  process.env.APP_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
const dbUrl = process.env.TURSO_DATABASE_URL?.trim() || `file:${path.join(dataDir, "higgsfree.sqlite")}`;

export const DEFAULT_MAX_ACTIVE_JOBS = 8;

export type StorageKind = "local" | "blob";

export const config = {
  projectRoot,
  nodeEnv,
  isProd: nodeEnv === "production",
  /** True inside a Vercel build or function. */
  onVercel,
  dataDir,
  mediaDir,
  uploadsDir,
  /** Where media files live. */
  storage: (blobToken ? "blob" : "local") as StorageKind,
  blobToken,
  /** libSQL url: `file:…` under DATA_DIR by default, `libsql://…` for Turso. */
  dbUrl,
  dbAuthToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
  envApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
  appUrl,
  appName: process.env.APP_NAME?.trim() || "higgsfree",
  /** Hostnames accepted in `Host` / `Origin` (`ALLOWED_HOSTS`, plus loopback, `APP_URL` and the Vercel urls); `"*"` disables the check. */
  allowedHosts: parseAllowedHosts(process.env.ALLOWED_HOSTS, appUrl, vercelHosts),
  /**
   * On Vercel the platform already routes requests by hostname, so a request can only reach this
   * app under one of its own domains: the `Host` allow-list is skipped and the same-origin check
   * compares `Origin` against the request's own `Host` instead (custom domains need no config).
   */
  trustHost: onVercel,
  /** Ceiling on pending + running generations across the whole instance (`MAX_ACTIVE_JOBS`). */
  maxActiveJobs: positiveInt(process.env.MAX_ACTIVE_JOBS, DEFAULT_MAX_ACTIVE_JOBS),
  version: pkg.version,
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
export async function ensureDataDirs(): Promise<void> {
  const fs = await import("node:fs");
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
    fs.accessSync(uploadsDir, fs.constants.W_OK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
    throw new DataDirError(dataDir, code);
  }
}
