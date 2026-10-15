/**
 * The logo's load animation (docs/brand/mark-crawl.json, a Lottie export): a scribble crawls along and draws
 * the F. lottie-web plays it, loaded on demand. Its first frame is inlined here so the static HTML opens on the
 * scribble; its last frame is the logo itself (`MARK_PATH`, lib/mark.ts), so every later visit draws the F
 * without loading the player.
 */

/** Frame 0 (unchanged up to frame 30): the scribble, filled nonzero, in artboard units (512 x 512). */
export const START_D =
  "M22.66,154.18C78.87,178.64 126.15,131.84 144.02,110.2C157.9,96.09 172.47,87.62 183.29,87.62C183.45,87.62 183.6,87.62 183.76,87.62C188.7,87.62 192.7,89.74 195.76,93.03C200.7,98.67 202.58,105.03 201.64,112.32C199.52,127.37 183.76,145.24 154.6,164.53C120.5,187.11 63.35,225.21 58.88,272.95C55.59,307.29 73.46,341.63 101.45,354.8C166.83,385.37 206.58,332.69 248.68,276.95C280.9,233.91 311.47,193.22 354.04,193.22C392.38,193.22 406.49,224.5 406.49,244.26C406.49,245.51 406.49,246.77 406.49,248.02C405.24,248.26 403.98,248.49 402.73,248.73C403.36,266.53 403.98,284.31 404.61,302.11C404.37,304.31 404.14,306.5 403.9,308.7C396.37,378.32 360.39,410.77 338.52,410.77C328.64,410.77 314.76,402.78 314.76,387.49C314.76,370.56 340.4,319.05 397.79,303.76C400.06,303.21 402.34,302.66 404.61,302.11C421.31,302.27 438,302.42 454.7,302.58C467.56,302.58 480.41,302.58 493.27,302.58C493.27,284.71 493.27,266.83 493.27,248.96C480.33,248.96 467.41,248.96 454.47,248.96C437.22,248.88 419.98,248.81 402.73,248.73C310.07,264.96 259.49,350.8 259.49,390.55C259.49,430.3 293.37,464.16 335.23,464.16C384.15,464.16 444.59,422.77 454.23,306.82C454.39,305.41 454.54,303.99 454.7,302.58C454.62,284.71 454.55,266.83 454.47,248.96C454.31,247.63 454.16,246.29 454,244.96C450.47,206.15 424.83,132.78 354.04,132.78C301.36,132.78 261.61,184.29 226.57,229.68C198.58,265.9 174.35,297.18 147.54,297.18C140.48,296.47 131.31,292.95 125.67,284.95C120.73,277.66 119.32,268.48 121.91,257.43C125.91,240.03 149.43,223.79 174.36,206.39C188,197.22 201.87,187.34 211.75,177.93C239.74,151.12 253.85,131.84 253.85,100.79C253.85,69.74 236.44,54.22 221.86,47.4C192.7,34.23 150.13,41.76 122.85,65.04C118.85,68.8 114.61,72.34 110.85,75.63C83.33,99.85 64.99,116.08 22.66,103.61";

/** The ink the file was drawn in, Lottie RGBA (0 to 1). */
export const LOTTIE_INK = [0.1373, 0.1216, 0.1255, 1] as const;

/**
 * From the artboard to the logo's 64-unit tile: the final F, mapped by this, is `MARK_PATH`.
 */
const TILE = { x: 5.3, y: 5.26, scale: 0.10446 };
export const CRAWL_TO_TILE = `translate(${TILE.x} ${TILE.y}) scale(${TILE.scale})`;

/**
 * The same placement as a viewBox in artboard units, for the player's SVG laid over the whole tile: both SVGs
 * then share one box, so the player draws its first frame exactly over the static one (an overlay sized in
 * percentages lands on a fractional pixel and drifts by half a pixel).
 */
export const CRAWL_TILE_VIEWBOX = [-TILE.x / TILE.scale, -TILE.y / TILE.scale, 64 / TILE.scale, 64 / TILE.scale]
  .map((v) => Math.round(v * 1000) / 1000)
  .join(" ");

interface Marker {
  tm: number;
  dr: number;
  cm?: string;
}

/** The frames to play: the file's `crawl` marker (the scribble holds still before it, the F after it). */
export function crawlSegment(data: { markers?: Marker[] }): [number, number] {
  const m = data.markers?.find((k) => k.cm === "crawl");
  if (!m) throw new Error("mark-crawl.json: no crawl marker");
  return [m.tm, m.tm + m.dr];
}

const sameColor = (a: unknown, b: readonly number[]) =>
  Array.isArray(a) && a.length === b.length && a.every((x, k) => Math.abs((x as number) - b[k]!) < 1e-4);

/** `#rrggbb` as Lottie RGBA. */
export function hexToLottie(hex: string): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

/** A copy of the animation with every fill and stroke in `from` repainted `to` (static colors only). */
export function recolor<T>(data: T, from: readonly number[], to: readonly number[]): T {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x === null || typeof x !== "object") return x;
    const o = x as Record<string, unknown>;
    if ((o.ty === "fl" || o.ty === "st") && o.c && typeof o.c === "object") {
      const c = o.c as { a: number; k: unknown };
      if (c.a === 0 && sameColor(c.k, from)) return { ...o, c: { ...c, k: [...to] } };
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)]));
  };
  return walk(data) as T;
}
