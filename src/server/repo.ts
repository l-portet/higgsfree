/** Typed CRUD over the libSQL tables. Rows in, `Generation` objects out. */
import type { InValue } from "@libsql/client";
import type { Generation, GenerationStatus, GenerationType, ListGenerationsQuery } from "../shared/types.ts";
import { getDb } from "./db.ts";

/** Internal shape: a `Generation` plus server-only fields (never sent to clients). */
export interface StoredGeneration extends Generation {
  /** Provider polling url (video jobs). */
  pollingUrl?: string;
  /** Lease held by whoever is polling / downloading this job right now (ISO time it expires). */
  lockUntil?: string;
}

type Row = Record<string, unknown>;

function parseJson<T>(v: unknown): T | undefined {
  if (typeof v !== "string" || v === "") return undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    return undefined;
  }
}

function rowToGeneration(r: Row): StoredGeneration {
  const g: StoredGeneration = {
    id: String(r.id),
    type: r.type as GenerationType,
    status: r.status as GenerationStatus,
    prompt: String(r.prompt),
    model: String(r.model),
    modelName: String(r.model_name),
    params: parseJson<Generation["params"]>(r.params) ?? ({} as Generation["params"]),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
  const inputs = parseJson<Generation["inputs"]>(r.inputs);
  if (inputs) g.inputs = inputs;
  const output = parseJson<Generation["output"]>(r.output);
  if (output) g.output = output;
  if (typeof r.error === "string") g.error = r.error;
  if (typeof r.cost_usd === "number") g.costUsd = r.cost_usd;
  if (typeof r.provider_job_id === "string") g.providerJobId = r.provider_job_id;
  if (typeof r.polling_url === "string") g.pollingUrl = r.polling_url;
  if (typeof r.batch_id === "string") g.batchId = r.batch_id;
  if (typeof r.batch_index === "number") g.batchIndex = r.batch_index;
  if (typeof r.completed_at === "string") g.completedAt = r.completed_at;
  if (typeof r.elapsed_ms === "number") g.elapsedMs = r.elapsed_ms;
  if (typeof r.lock_until === "string") g.lockUntil = r.lock_until;
  return g;
}

/** Strip server-only fields before sending to clients. */
export function toPublic(g: StoredGeneration): Generation {
  const { pollingUrl: _omit, lockUntil: _omit2, ...pub } = g;
  return pub;
}

const COLUMN: Record<keyof StoredGeneration, string> = {
  id: "id",
  type: "type",
  status: "status",
  prompt: "prompt",
  model: "model",
  modelName: "model_name",
  params: "params",
  inputs: "inputs",
  output: "output",
  error: "error",
  costUsd: "cost_usd",
  providerJobId: "provider_job_id",
  pollingUrl: "polling_url",
  batchId: "batch_id",
  batchIndex: "batch_index",
  createdAt: "created_at",
  updatedAt: "updated_at",
  completedAt: "completed_at",
  elapsedMs: "elapsed_ms",
  lockUntil: "lock_until",
};
const JSON_FIELDS = new Set<keyof StoredGeneration>(["params", "inputs", "output"]);

function toSql(field: keyof StoredGeneration, value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (JSON_FIELDS.has(field)) return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

const now = (): string => new Date().toISOString();

async function run(sql: string, args: InValue[] = []): Promise<{ rows: Row[]; changes: number }> {
  const db = await getDb();
  const rs = await db.execute({ sql, args });
  return { rows: rs.rows as unknown as Row[], changes: rs.rowsAffected };
}

export async function insertGeneration(g: StoredGeneration): Promise<StoredGeneration> {
  await run(
    `INSERT INTO generations (
      id, type, status, prompt, model, model_name, params, inputs, output, error, cost_usd,
      provider_job_id, polling_url, batch_id, batch_index, created_at, updated_at, completed_at, elapsed_ms, lock_until
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      g.id, g.type, g.status, g.prompt, g.model, g.modelName,
      toSql("params", g.params), toSql("inputs", g.inputs), toSql("output", g.output),
      toSql("error", g.error), toSql("costUsd", g.costUsd), toSql("providerJobId", g.providerJobId),
      toSql("pollingUrl", g.pollingUrl), toSql("batchId", g.batchId), toSql("batchIndex", g.batchIndex),
      g.createdAt, g.updatedAt, toSql("completedAt", g.completedAt), toSql("elapsedMs", g.elapsedMs), toSql("lockUntil", g.lockUntil),
    ],
  );
  return g;
}

export async function getGeneration(id: string): Promise<StoredGeneration | undefined> {
  const { rows } = await run("SELECT * FROM generations WHERE id = ?", [id]);
  const row = rows[0];
  return row ? rowToGeneration(row) : undefined;
}

/** Partial update; bumps `updatedAt` (which is what clients poll for). Returns the fresh row (undefined if it vanished). */
export async function updateGeneration(id: string, patch: Partial<Omit<StoredGeneration, "id">>): Promise<StoredGeneration | undefined> {
  const fields = Object.keys(patch) as (keyof StoredGeneration)[];
  const sets: string[] = ["updated_at = ?"];
  const values: InValue[] = [now()];
  for (const f of fields) {
    if (f === "id" || f === "updatedAt") continue;
    sets.push(`${COLUMN[f]} = ?`);
    values.push(toSql(f, patch[f]));
  }
  values.push(id);
  await run(`UPDATE generations SET ${sets.join(", ")} WHERE id = ?`, values);
  return getGeneration(id);
}

export async function deleteGeneration(id: string): Promise<boolean> {
  const { changes } = await run("DELETE FROM generations WHERE id = ?", [id]);
  return changes > 0;
}

export async function countActiveGenerations(): Promise<number> {
  const { rows } = await run("SELECT COUNT(*) AS n FROM generations WHERE status IN ('pending','running')");
  return Number(rows[0]?.n ?? 0);
}

export async function listActiveGenerations(): Promise<StoredGeneration[]> {
  const { rows } = await run("SELECT * FROM generations WHERE status IN ('pending','running') ORDER BY created_at ASC");
  return rows.map(rowToGeneration);
}

/**
 * How many *other* generations reference a media url in their `inputs`
 * (`inputs` is stored as JSON, so an exact quoted-string match is enough).
 */
export async function countGenerationsReferencingMedia(url: string, excludeId = ""): Promise<number> {
  const { rows } = await run("SELECT COUNT(*) AS n FROM generations WHERE id != ? AND instr(COALESCE(inputs, ''), ?) > 0", [excludeId, JSON.stringify(url)]);
  return Number(rows[0]?.n ?? 0);
}

export const LIST_DEFAULT_LIMIT = 60;
export const LIST_MAX_LIMIT = 200;

export async function listGenerations(q: ListGenerationsQuery): Promise<{ items: StoredGeneration[]; nextCursor?: string }> {
  const limit = Math.min(LIST_MAX_LIMIT, Math.max(1, q.limit ?? LIST_DEFAULT_LIMIT));
  const where: string[] = [];
  const values: InValue[] = [];
  if (q.type) {
    where.push("type = ?");
    values.push(q.type);
  }
  if (q.status) {
    where.push("status = ?");
    values.push(q.status);
  }
  if (q.cursor) {
    // Opaque cursor: `${createdAt}|${id}` (tuple); a bare createdAt is also accepted.
    const bar = q.cursor.lastIndexOf("|");
    if (bar > 0) {
      where.push("(created_at < ? OR (created_at = ? AND id < ?))");
      values.push(q.cursor.slice(0, bar), q.cursor.slice(0, bar), q.cursor.slice(bar + 1));
    } else {
      where.push("created_at < ?");
      values.push(q.cursor);
    }
  }
  const sql = `SELECT * FROM generations ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC LIMIT ?`;
  const { rows } = await run(sql, [...values, limit + 1]);
  const items = rows.slice(0, limit).map(rowToGeneration);
  const last = items[items.length - 1];
  const nextCursor = rows.length > limit && last ? `${last.createdAt}|${last.id}` : undefined;
  return nextCursor ? { items, nextCursor } : { items };
}

// ---------- change feed (what `GET /api/events` serves) ----------

/** Rows touched after `since` (ISO), oldest first. */
export async function listGenerationsUpdatedSince(since: string, limit = 200): Promise<StoredGeneration[]> {
  const { rows } = await run("SELECT * FROM generations WHERE updated_at > ? ORDER BY updated_at ASC, id ASC LIMIT ?", [since, limit]);
  return rows.map(rowToGeneration);
}

export async function recordDeletion(id: string): Promise<void> {
  await run("INSERT INTO deletions (id, deleted_at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at", [id, now()]);
}

export async function listDeletionsSince(since: string, limit = 500): Promise<{ id: string; deletedAt: string }[]> {
  const { rows } = await run("SELECT id, deleted_at FROM deletions WHERE deleted_at > ? ORDER BY deleted_at ASC LIMIT ?", [since, limit]);
  return rows.map((r) => ({ id: String(r.id), deletedAt: String(r.deleted_at) }));
}

/** Tombstones only matter to tabs that were open at the time; a day is plenty. */
export async function pruneDeletions(olderThan: string): Promise<void> {
  await run("DELETE FROM deletions WHERE deleted_at < ?", [olderThan]);
}

// ---------- job leases ----------

/**
 * Take the lease on an active job until `until` if nobody holds a live one. True when this
 * caller now owns the job (exactly one of several concurrent callers wins).
 */
export async function claimGeneration(id: string, until: string, at: string): Promise<boolean> {
  const { changes } = await run(
    "UPDATE generations SET lock_until = ? WHERE id = ? AND status IN ('pending','running') AND (lock_until IS NULL OR lock_until <= ?)",
    [until, id, at],
  );
  return changes === 1;
}

/** Set (or clear, with `null`) a job's lease without touching `updated_at`: a poll that changed nothing is not a client event. */
export async function setLease(id: string, until: string | null): Promise<void> {
  await run("UPDATE generations SET lock_until = ? WHERE id = ?", [until, id]);
}

// ---------- settings ----------

export async function getSetting(key: string): Promise<string | undefined> {
  const { rows } = await run("SELECT value FROM settings WHERE key = ?", [key]);
  const v = rows[0]?.value;
  return typeof v === "string" ? v : undefined;
}
export async function setSetting(key: string, value: string): Promise<void> {
  await run("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [key, value, now()]);
}
export async function deleteSetting(key: string): Promise<void> {
  await run("DELETE FROM settings WHERE key = ?", [key]);
}
