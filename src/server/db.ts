import { DatabaseSync } from "node:sqlite";
import { config, ensureDataDirs } from "./config.ts";
import { log } from "./log.ts";

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "init",
    sql: `
      CREATE TABLE IF NOT EXISTS generations (
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
      );
      CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_generations_type ON generations(type);
      CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

export function runMigrations(database: DatabaseSync): void {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const row = database.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_version").get() as { v: number };
  const current = Number(row.v);
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    database.exec("BEGIN");
    try {
      database.exec(m.sql);
      database
        .prepare("INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)")
        .run(m.version, m.name, new Date().toISOString());
      database.exec("COMMIT");
      log.info(`db migrated to v${m.version} (${m.name})`);
    } catch (err) {
      database.exec("ROLLBACK");
      throw err;
    }
  }
}

export function openDatabase(file: string): DatabaseSync {
  const database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA busy_timeout = 5000");
  runMigrations(database);
  return database;
}

// Guarded at import time so a bad DATA_DIR surfaces as one readable line, not a stack trace.
// `index.ts` runs the same check before importing this module; tests import it directly.
ensureDataDirs();
export const db: DatabaseSync = openDatabase(config.dbFile);

export function closeDatabase(): void {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}
