/** Typed CRUD over the SQLite tables. Rows in, `Generation` objects out. */
import type { Generation, GenerationStatus, GenerationType, ListGenerationsQuery } from "../shared/types.ts";
import { db } from "./db.ts";

/** Internal shape: a `Generation` plus the provider polling url (never sent to clients). */
export interface StoredGeneration extends Generation {
  pollingUrl?: string;
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
  return g;
}

/** Strip server-only fields before sending to clients. */
export function toPublic(g: StoredGeneration): Generation {
  const { pollingUrl: _omit, ...pub } = g;
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
};
const JSON_FIELDS = new Set<keyof StoredGeneration>(["params", "inputs", "output"]);

function toSql(field: keyof StoredGeneration, value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (JSON_FIELDS.has(field)) return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

const insertStmt = db.prepare(`INSERT INTO generations (
  id, type, status, prompt, model, model_name, params, inputs, output, error, cost_usd,
  provider_job_id, polling_url, batch_id, batch_index, created_at, updated_at, completed_at, elapsed_ms
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const getStmt = db.prepare("SELECT * FROM generations WHERE id = ?");
const deleteStmt = db.prepare("DELETE FROM generations WHERE id = ?");
const countActiveStmt = db.prepare("SELECT COUNT(*) AS n FROM generations WHERE status IN ('pending','running')");
const listActiveStmt = db.prepare("SELECT * FROM generations WHERE status IN ('pending','running') ORDER BY created_at ASC");
const countReferencingStmt = db.prepare("SELECT COUNT(*) AS n FROM generations WHERE id != ? AND instr(COALESCE(inputs, ''), ?) > 0");

export function insertGeneration(g: StoredGeneration): StoredGeneration {
  insertStmt.run(
    g.id, g.type, g.status, g.prompt, g.model, g.modelName,
    toSql("params", g.params), toSql("inputs", g.inputs), toSql("output", g.output),
    toSql("error", g.error), toSql("costUsd", g.costUsd), toSql("providerJobId", g.providerJobId),
    toSql("pollingUrl", g.pollingUrl), toSql("batchId", g.batchId), toSql("batchIndex", g.batchIndex),
    g.createdAt, g.updatedAt, toSql("completedAt", g.completedAt), toSql("elapsedMs", g.elapsedMs),
  );
  return g;
}

export function getGeneration(id: string): StoredGeneration | undefined {
  const row = getStmt.get(id) as Row | undefined;
  return row ? rowToGeneration(row) : undefined;
}

/** Partial update; bumps `updatedAt`. Returns the fresh row (undefined if it vanished). */
export function updateGeneration(id: string, patch: Partial<Omit<StoredGeneration, "id">>): StoredGeneration | undefined {
  const fields = Object.keys(patch) as (keyof StoredGeneration)[];
  const sets: string[] = ["updated_at = ?"];
  const values: (string | number | null)[] = [new Date().toISOString()];
  for (const f of fields) {
    if (f === "id" || f === "updatedAt") continue;
    sets.push(`${COLUMN[f]} = ?`);
    values.push(toSql(f, patch[f]));
  }
  values.push(id);
  db.prepare(`UPDATE generations SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getGeneration(id);
}

export function deleteGeneration(id: string): boolean {
  const res = deleteStmt.run(id);
  return Number(res.changes) > 0;
}

export function countActiveGenerations(): number {
  const row = countActiveStmt.get() as { n: number };
  return Number(row.n);
}

export function listActiveGenerations(): StoredGeneration[] {
  return (listActiveStmt.all() as Row[]).map(rowToGeneration);
}

/**
 * How many *other* generations reference a media url in their `inputs`
 * (`inputs` is stored as JSON, so an exact quoted-string match is enough).
 */
export function countGenerationsReferencingMedia(url: string, excludeId = ""): number {
  const row = countReferencingStmt.get(excludeId, JSON.stringify(url)) as { n: number };
  return Number(row.n);
}

export const LIST_DEFAULT_LIMIT = 60;
export const LIST_MAX_LIMIT = 200;

export function listGenerations(q: ListGenerationsQuery): { items: StoredGeneration[]; nextCursor?: string } {
  const limit = Math.min(LIST_MAX_LIMIT, Math.max(1, q.limit ?? LIST_DEFAULT_LIMIT));
  const where: string[] = [];
  const values: (string | number)[] = [];
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
  const rows = db.prepare(sql).all(...values, limit + 1) as Row[];
  const items = rows.slice(0, limit).map(rowToGeneration);
  const last = items[items.length - 1];
  const nextCursor = rows.length > limit && last ? `${last.createdAt}|${last.id}` : undefined;
  return nextCursor ? { items, nextCursor } : { items };
}

// ---------- settings ----------

const getSettingStmt = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSettingStmt = db.prepare(
  "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
);
const deleteSettingStmt = db.prepare("DELETE FROM settings WHERE key = ?");

export function getSetting(key: string): string | undefined {
  const row = getSettingStmt.get(key) as { value: string } | undefined;
  return row?.value;
}
export function setSetting(key: string, value: string): void {
  setSettingStmt.run(key, value, new Date().toISOString());
}
export function deleteSetting(key: string): void {
  deleteSettingStmt.run(key);
}
