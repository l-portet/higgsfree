/**
 * libSQL database: a local `file:` SQLite database under DATA_DIR by default, or a
 * remote Turso database when `TURSO_DATABASE_URL` is set. Opened lazily on first use
 * (nothing touches the database at import or build time) and migrated in place.
 */
import { createClient, type Client, type InStatement } from "@libsql/client";
import { config, ensureDataDirs } from "./config.ts";
import { log } from "./log.ts";

interface Migration {
  version: number;
  name: string;
  statements: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "init",
    statements: [
      `CREATE TABLE IF NOT EXISTS generations (
        id              TEXT PRIMARY KEY,
        type            TEXT NOT NULL,
        status          TEXT NOT NULL,
        prompt          TEXT NOT NULL,
        model           TEXT NOT NULL,
        model_name      TEXT NOT NULL,
        params          TEXT NOT NULL,
        inputs          TEXT,
        output          TEXT,
        error           TEXT,
        cost_usd        REAL,
        provider_job_id TEXT,
        polling_url     TEXT,
        batch_id        TEXT,
        batch_index     INTEGER,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        completed_at    TEXT,
        elapsed_ms      INTEGER
      )`,
      "CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_generations_type ON generations(type)",
      "CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status)",
      `CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    // Serverless: no in-process poller owns a job, so a row carries its own lease (`lock_until`),
    // clients poll `updated_at` for changes, and deletions leave a tombstone for other tabs.
    version: 2,
    name: "leases-and-tombstones",
    statements: [
      "ALTER TABLE generations ADD COLUMN lock_until TEXT",
      "CREATE INDEX IF NOT EXISTS idx_generations_updated_at ON generations(updated_at)",
      `CREATE TABLE IF NOT EXISTS deletions (
        id         TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_deletions_deleted_at ON deletions(deleted_at)",
    ],
  },
];

export async function runMigrations(database: Client): Promise<void> {
  await database.execute(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const row = (await database.execute("SELECT COALESCE(MAX(version), 0) AS v FROM schema_version")).rows[0];
  const current = Number(row?.v ?? 0);
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    const stmts: InStatement[] = [
      ...m.statements,
      { sql: "INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)", args: [m.version, m.name, new Date().toISOString()] },
    ];
    await database.batch(stmts, "write"); // one transaction: all or nothing
    log.info(`db migrated to v${m.version} (${m.name})`);
  }
}

export async function openDatabase(url: string, authToken?: string): Promise<Client> {
  const isFile = url.startsWith("file:");
  if (isFile) await ensureDataDirs();
  const database = createClient(authToken ? { url, authToken } : { url });
  if (isFile) {
    await database.execute("PRAGMA journal_mode = WAL");
    await database.execute("PRAGMA synchronous = NORMAL");
    await database.execute("PRAGMA busy_timeout = 5000");
  }
  await runMigrations(database);
  return database;
}

interface DbState {
  opening?: Promise<Client>;
  client?: Client;
}

// `next dev` re-evaluates modules on every edit; keep one connection per process in development.
const state: DbState = config.nodeEnv === "development" ? ((globalThis as { __higgsfreeDb?: DbState }).__higgsfreeDb ??= {}) : {};

/** The migrated database; the same promise for every caller. */
export function getDb(): Promise<Client> {
  if (!state.opening) {
    if (config.onVercel && config.dbUrl.startsWith("file:")) {
      return Promise.reject(
        new Error("No database configured: set TURSO_DATABASE_URL (vercel integration add tursocloud/database); a file: database cannot live on Vercel"),
      );
    }
    state.opening = openDatabase(config.dbUrl, config.dbAuthToken)
      .then((client) => {
        state.client = client;
        return client;
      })
      .catch((err: unknown) => {
        state.opening = undefined;
        throw err;
      });
  }
  return state.opening;
}

export function closeDatabase(): void {
  try {
    state.client?.close();
  } catch {
    /* already closed */
  }
  state.client = undefined;
  state.opening = undefined;
}
