/** The logo's load animation: it opens on the inlined scribble and rests on the logo, both the file's own frames. */
import { describe, expect, it } from "vitest";
import crawlJson from "../../../../docs/brand/mark-crawl.json";
import { readFileSync } from "node:fs";
import { MARK_PATH } from "../mark";
import { CRAWL_TILE_VIEWBOX, CRAWL_TO_TILE, crawlSegment, hexToLottie, LOTTIE_INK, recolor, replayData, START_D } from "../mark-crawl";

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
  w?: { k: number };
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

describe("the hover replay", () => {
  const replay = replayData(crawlJson);
  const replayed = replay.layers as unknown as Layer[];
  const named = (ls: Layer[], nm: string) => ls.find((l) => l.nm === nm)!;
  const group = (l: Layer, nm: string) => items(l.shapes).find((x) => x.ty === "gr" && x.nm === nm)!;
  const of = (g: Item, ty: string) => g.it!.find((x) => x.ty === ty)!;
  /** A keyed value at `t` (linear, or held). */
  const at = (p: unknown, t: number): number => {
    const { a, k } = p as { a: number; k: number | number[] | { t: number; s: number[]; h?: number }[] };
    if (!a) return Array.isArray(k) ? (k[0] as number) : (k as number);
    const keys = k as { t: number; s: number[]; h?: number }[];
    const j = Math.max(0, keys.findLastIndex((x) => x.t <= t));
    const [x, y] = [keys[j]!, keys[j + 1]];
    if (!y || x.h || t <= x.t) return x.s[0]!;
    return x.s[0]! + ((y.s[0]! - x.s[0]!) * (t - x.t)) / (y.t - x.t);
  };

  it("swaps the scribble for the F and body A for an exit through the crossbar; the rest is the file's own", () => {
    expect(replayed.map((l) => l.nm)).toEqual(["F", "crawl", "F exit"]);
    expect(named(replayed, "F")).toEqual(layer("F"));
    const crawl = named(replayed, "crawl");
    expect(crawl.shapes[0]!.it!.map((x) => x.nm)).toEqual(["exit", "body F", "tail cut", "Transform"]);
    expect(group(crawl, "body F")).toEqual(group(layer("crawl"), "body F"));
    expect(crawlSegment(replay)).toEqual([30, 246]);
    expect(layers.map((l) => l.nm)).toEqual(["F", "crawl", "scribble"]);
  });

  it("starts on the whole F, eats it from its start, and has eaten it when the exit takes the tail over", () => {
    const exit = named(replayed, "F exit");
    const g = group(exit, "F exit");
    const path = of(g, "sh").ks!.k as Shape;
    expect(path.c).toBe(true);
    expect(path.v).toEqual(shape("F").v);
    const tm = of(g, "tm") as unknown as { s: unknown; e: unknown; o: unknown };
    expect(at(tm.s, 30)).toBe(0);
    expect(at(tm.e, 30)).toBeCloseTo(100, 6);
    let left = Infinity;
    for (let t = 30; t <= 123; t++) {
      expect(at(tm.e, t)).toBeLessThanOrEqual(left + 1e-9);
      left = at(tm.e, t);
    }
    // At the hand-off only the closing segment, the crossbar's square end, is left: no area.
    expect(left).toBeLessThan(2);
    expect(exit.op).toBe(layer("scribble").op + 1);
  });

  it("leaves through the crossbar's end, as thick as it is, and joins body F's track outside the box", () => {
    const exit = group(named(replayed, "crawl"), "exit");
    const track = of(exit, "sh").ks!.k as Shape;
    const f = shape("F");
    const [c0, c1] = [f.v[0]!, f.v[f.v.length - 1]!];
    expect(track.v[0]![0]).toBeLessThan(c0[0]);
    expect(track.v[0]![1]).toBeCloseTo((c0[1] + c1[1]) / 2, 6);
    expect(of(exit, "st").w!.k).toBeCloseTo(Math.hypot(c0[0] - c1[0], c0[1] - c1[1]), 6);
    for (const [x, y] of track.v.slice(1)) expect(x > 512 || y < 0).toBe(true);
    const bodyF = of(group(layer("crawl"), "body F"), "sh").ks!.k as Shape;
    expect(track.v.at(-1)).toEqual(bodyF.v[0]);
    const tm = of(exit, "tm");
    expect(at(tm.e, 30)).toBeLessThan(5);
    expect(at(tm.e, 96)).toBe(100);
    expect(at(tm.s, 122)).toBe(0);
    expect(at(tm.s, 123)).toBeGreaterThan(0);
  });

  it("shares no object between its parts (lottie-web rewrites paths in place as it loads them)", () => {
    const seen = new Set<object>();
    const shared: string[] = [];
    const walk = (x: unknown, at: string) => {
      if (x === null || typeof x !== "object") return;
      if (seen.has(x)) shared.push(at);
      seen.add(x);
      for (const [k, v] of Object.entries(x)) walk(v, `${at}.${k}`);
    };
    walk(replay, "replay");
    expect(shared).toEqual([]);
    // Nor with the file it was built from.
    const original = new Set<object>();
    const collect = (x: unknown) => {
      if (x === null || typeof x !== "object") return;
      original.add(x);
      Object.values(x).forEach(collect);
    };
    collect(crawlJson);
    expect([...seen].filter((x) => original.has(x))).toEqual([]);
  });

  it("drops the tail-cut wedge's stretch on the scribble's exit, where nothing follows it", () => {
    const times = (l: Layer) => (of(group(l, "tail cut"), "sh").ks!.k as { t: number }[]).map((k) => k.t);
    const before = times(layer("crawl"));
    expect(before).toEqual(expect.arrayContaining([123, 124]));
    expect(times(named(replayed, "crawl"))).toEqual(before.filter((t) => t !== 123 && t !== 124));
  });
});
