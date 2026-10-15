/** The logo's load animation: it opens on the inlined scribble and rests on the logo, both the file's own frames. */
import { describe, expect, it } from "vitest";
import crawlJson from "../../../../docs/brand/mark-crawl.json";
import { readFileSync } from "node:fs";
import { MARK_PATH } from "../mark";
import { CRAWL_TILE_VIEWBOX, CRAWL_TO_TILE, crawlSegment, hexToLottie, LOTTIE_INK, recolor, START_D } from "../mark-crawl";

type Vec = [number, number];
interface Shape {
  v: Vec[];
  i: Vec[];
  o: Vec[];
  c: boolean;
}
interface Item {
  ty: string;
  nm?: string;
  it?: Item[];
  ks?: { a: number; k: unknown };
  c?: { a: number; k: unknown };
  r?: number;
  s?: { k: { t: number; s: number[] }[] };
  e?: { k: { t: number; s: number[] }[] };
}
interface Layer {
  nm: string;
  ip: number;
  op: number;
  shapes: Item[];
}

const layers = crawlJson.layers as unknown as Layer[];
const layer = (nm: string) => layers.find((l) => l.nm === nm)!;
const items = (xs: Item[]): Item[] => xs.flatMap((x) => (x.ty === "gr" ? [x, ...items(x.it ?? [])] : [x]));
const n = (x: number) => String(Math.round(x * 100) / 100);
const [TX, TY, K] = CRAWL_TO_TILE.match(/[\d.]+/g)!.map(Number) as [number, number, number];
/** SVG path data for a Lottie path, in artboard units (`sep` "," and open) or mapped onto the tile (" " and closed). */
const toPath = ({ v, i, o }: Shape, tile = false) => {
  const pt = (x: number, y: number) => (tile ? `${n(TX + x * K)} ${n(TY + y * K)}` : `${n(x)},${n(y)}`);
  const body = v
    .slice(1)
    .map((b, k) => {
      const a = v[k]!;
      return `C${pt(a[0] + o[k]![0], a[1] + o[k]![1])} ${pt(b[0] + i[k + 1]![0], b[1] + i[k + 1]![1])} ${pt(b[0], b[1])}`;
    })
    .join("");
  return `M${pt(v[0]![0], v[0]![1])}${body}${tile ? "Z" : ""}`;
};
const shape = (nm: string) => items(layer(nm).shapes).find((x) => x.ty === "sh")!.ks!.k as Shape;
const outline = (nm: string) => toPath(shape(nm));
const trimAt = (nm: string, t: number) => {
  const tm = items(layer(nm).shapes).find((x) => x.ty === "tm")!;
  const at = (kfs: { t: number; s: number[] }[]) => [...kfs].reverse().find((k) => k.t <= t)?.s[0] ?? kfs[0]!.s[0];
  return [at(tm.s!.k), at(tm.e!.k)];
};

describe("mark crawl", () => {
  it("plays the crawl marker: 60 fps, frames 30 to 246", () => {
    expect(crawlJson).toMatchObject({ fr: 60, w: 512, h: 512 });
    expect(crawlSegment(crawlJson)).toEqual([30, 246]);
    expect(() => crawlSegment({ markers: [] })).toThrow(/crawl marker/);
  });

  it("opens on the whole scribble and rests on the whole F, the logo, both filled nonzero", () => {
    expect(outline("scribble")).toBe(START_D);
    expect(trimAt("scribble", 0)).toEqual([0, 100]);
    expect(trimAt("F", 0)).toEqual([0, 0]);
    expect(layer("crawl").ip).toBeGreaterThan(30);

    expect(toPath(shape("F"), true)).toBe(MARK_PATH);
    expect(trimAt("F", 246)).toEqual([0, 100]);
    expect(layer("scribble").op).toBeLessThan(246);
    expect(layer("crawl").op).toBeLessThanOrEqual(246);

    const fills = items(layers.flatMap((l) => l.shapes)).filter((x) => x.ty === "fl");
    expect(fills.every((f) => f.r === 1)).toBe(true);
  });

  it("places the player's viewBox exactly where the static path's transform puts the artboard", () => {
    const [x, y, w, h] = CRAWL_TILE_VIEWBOX.split(" ").map(Number) as [number, number, number, number];
    // Artboard point (0, 0) and (512, 512) land on the same tile coordinates both ways.
    for (const p of [0, 512]) {
      expect(((p - x) / w) * 64).toBeCloseTo(TX + p * K, 2);
      expect(((p - y) / h) * 64).toBeCloseTo(TY + p * K, 2);
    }
  });

  it("repaints the file's ink in the brand ink, everywhere and without touching the import", () => {
    const ink = hexToLottie("#171717");
    expect(ink).toEqual([23 / 255, 23 / 255, 23 / 255, 1]);
    const painted = recolor(crawlJson, LOTTIE_INK, ink);
    const colors = (d: typeof crawlJson) =>
      items((d.layers as unknown as Layer[]).flatMap((l) => l.shapes))
        .filter((x) => x.ty === "fl" || x.ty === "st")
        .map((x) => x.c!.k);
    expect(colors(crawlJson).every((c) => JSON.stringify(c) === JSON.stringify(LOTTIE_INK))).toBe(true);
    expect(colors(painted).length).toBe(colors(crawlJson).length);
    expect(colors(painted).every((c) => JSON.stringify(c) === JSON.stringify(ink))).toBe(true);
  });

  it("is the one mark path every brand SVG and the favicon draw, filled nonzero", () => {
    const files = ["mark", "mark-square", "mark-mono", "lockup", "lockup-dark", "lockup-mono", "icon-maskable", "og-image"]
      .map((f) => `docs/brand/${f}.svg`)
      .concat("public/favicon.svg");
    for (const f of files) {
      const svg = readFileSync(f, "utf8");
      expect(svg, f).toContain(`d="${MARK_PATH}"`);
      expect(svg, f).not.toContain("evenodd");
    }
  });
});
