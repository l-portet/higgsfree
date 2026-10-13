/**
 * Tiny `.env` loader, no dotenv dependency. Never overrides variables that are
 * already present in the process environment.
 */
import fs from "node:fs";

export function parseDotenv(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1] ?? "";
    let value = m[2] ?? "";
    const quote = value[0];
    const closing = quote === '"' || quote === "'" ? value.indexOf(quote, 1) : -1;
    if (closing > 0) {
      value = value.slice(1, closing);
      if (quote === '"') value = value.replace(/\\n/g, "\n");
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash);
      value = value.trim();
    }
    out[key] = value;
  }
  return out;
}

export const DEFAULT_HOST = "127.0.0.1";

/**
 * Interface the HTTP server binds to (`HOST`). Defaults to loopback: the app has no login, so
 * it is only reachable from this machine unless the operator opts in with `0.0.0.0` (or an
 * interface address). Trims whitespace and accepts a bracketed IPv6 literal (`[::1]`).
 */
export function parseHost(raw: string | undefined, fallback: string = DEFAULT_HOST): string {
  let value = raw?.trim() ?? "";
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1).trim();
  return value || fallback;
}

/** Loads `file` into `env` (defaults to `process.env`). Returns the number of keys applied. */
export function loadDotenv(file: string, env: NodeJS.ProcessEnv = process.env): number {
  let src: string;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    return 0;
  }
  let applied = 0;
  for (const [k, v] of Object.entries(parseDotenv(src))) {
    if (env[k] === undefined) {
      env[k] = v;
      applied++;
    }
  }
  return applied;
}
