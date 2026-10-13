/** Display formatting helpers: pure, no React. */

export function formatUsd(value: number | undefined | null, opts: { approx?: boolean } = {}): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  let digits = 2;
  if (abs > 0 && abs < 0.01) digits = 3;
  if (abs > 0 && abs < 0.001) digits = 4;
  const s = `$${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  const signed = value < 0 ? `-${s}` : s;
  return opts.approx ? `~${signed}` : signed;
}

/** "0:42", "1:07:03" */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "5s", "1m 10s" */
export function formatSeconds(sec: number | undefined): string {
  if (sec === undefined || Number.isNaN(sec)) return "—";
  const total = Math.round(sec);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Duration in ms → "3.2s" / "1m 12s" (for completed-generation timings). */
export function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return formatSeconds(ms / 1000);
}

export function formatRelative(iso: string | Date, now: number = Date.now()): string {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, now - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i] ?? "TB"}`;
}

export function formatDims(width: number | undefined, height: number | undefined): string | undefined {
  if (!width || !height) return undefined;
  return `${width}×${height}`;
}

/** "3:4" → 0.75; "auto"/invalid → undefined */
export function ratioToNumber(ratio: string | undefined): number | undefined {
  if (!ratio || ratio === "auto") return undefined;
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) return undefined;
  return w / h;
}

/** CSS `aspect-ratio` value for a ratio string, e.g. "3 / 4". */
export function ratioToCss(ratio: string | undefined, fallback = "1 / 1"): string {
  if (!ratio || ratio === "auto") return fallback;
  const [w, h] = ratio.split(":");
  if (!w || !h) return fallback;
  return `${w} / ${h}`;
}

export function ratioLabel(ratio: string): string {
  if (ratio === "auto") return "Auto";
  const n = ratioToNumber(ratio);
  if (n === undefined) return "";
  if (Math.abs(n - 1) < 0.01) return "Square";
  if (n > 2) return "Ultra wide";
  return n > 1 ? "Landscape" : "Portrait";
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform) || /Mac OS/.test(navigator.userAgent);
}
