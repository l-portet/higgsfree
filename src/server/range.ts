/**
 * Parse a single HTTP `Range` header against a known size (RFC 9110 section 14).
 * A header that is not a single `bytes=` range (other unit, multi-range, garbage)
 * is ignored and the caller serves the whole file (`undefined`); only a
 * well-formed range nothing can satisfy yields `"invalid"` (416).
 */
export type RangeResult = { start: number; end: number } | "invalid" | undefined;

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return undefined;
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return undefined;
  let start: number;
  let end: number;
  if (a === "") {
    // suffix range: last N bytes; a zero-length suffix is unsatisfiable
    const n = Number.parseInt(b, 10);
    if (!Number.isFinite(n) || n <= 0) return "invalid";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number.parseInt(a, 10);
    end = b === "" ? size - 1 : Math.min(size - 1, Number.parseInt(b, 10));
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || start > end) return "invalid";
  return { start, end };
}
