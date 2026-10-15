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

// ---------- The hover replay ----------

type Vec = [number, number];
interface Path {
  v: Vec[];
  i: Vec[];
  o: Vec[];
  c: boolean;
}
interface Key<T> {
  t: number;
  s?: T;
  h?: number;
  o?: unknown;
  i?: unknown;
}
interface Prop<T> {
  a: number;
  k: T | Key<T>[];
}
interface Item {
  ty: string;
  nm?: string;
  it?: Item[];
  ks?: Prop<Path | Path[]>;
  s?: Prop<number[] | number>;
  e?: Prop<number[] | number>;
  o?: Prop<number[] | number>;
  w?: Prop<number>;
  [key: string]: unknown;
}
interface Layer {
  nm: string;
  ind: number;
  ip: number;
  op: number;
  shapes: Item[];
  [key: string]: unknown;
}
interface Lottie {
  w: number;
  h: number;
  layers: Layer[];
}

const fail = (why: string): never => {
  throw new Error(`mark-crawl.json: ${why}`);
};
const layerNamed = (d: Lottie, nm: string): Layer => d.layers.find((l) => l.nm === nm) ?? fail(`no ${nm} layer`);
const flat = (items: Item[]): Item[] => items.flatMap((x) => (x.ty === "gr" ? [x, ...flat(x.it ?? [])] : [x]));
const groupNamed = (items: Item[], nm: string): Item => flat(items).find((x) => x.ty === "gr" && x.nm === nm) ?? fail(`no ${nm} group`);
const itemOf = (group: Item, ty: string): Item => group.it?.find((x) => x.ty === ty) ?? fail(`${group.nm} has no ${ty}`);
const staticPath = (sh: Item): Path => (sh.ks && !sh.ks.a ? (sh.ks.k as Path) : fail(`${sh.nm} is animated`));

/** A trim value (percent) at `t`: the file keys them linear or held. */
function valueAt(p: Prop<number[] | number>, t: number): number {
  if (!p.a) return Array.isArray(p.k) ? (p.k[0] as number) : (p.k as number);
  const keys = p.k as Key<number[]>[];
  let j = 0;
  while (j < keys.length - 1 && keys[j + 1]!.t <= t) j++;
  const a = keys[j]!;
  const b = keys[j + 1];
  const va = a.s?.[0] ?? 0;
  if (!b || a.h || t <= a.t) return va;
  return va + ((b.s?.[0] ?? va) - va) * ((t - a.t) / (b.t - a.t));
}

/** Each segment's length, sampled at 150 points as lottie-web does, so trim percentages land where it puts them. */
function segmentLengths(p: Path): number[] {
  const seg = (a: number, b: number): number => {
    const [p0, p3] = [p.v[a]!, p.v[b]!];
    const p1 = [p0[0] + p.o[a]![0], p0[1] + p.o[a]![1]];
    const p2 = [p3[0] + p.i[b]![0], p3[1] + p.i[b]![1]];
    let length = 0;
    let [px, py] = p0;
    for (let k = 1; k < 150; k++) {
      const t = k / 149;
      const u = 1 - t;
      const x = u * u * u * p0[0] + 3 * u * u * t * p1[0]! + 3 * u * t * t * p2[0]! + t * t * t * p3[0];
      const y = u * u * u * p0[1] + 3 * u * u * t * p1[1]! + 3 * u * t * t * p2[1]! + t * t * t * p3[1];
      length += Math.hypot(x - px, y - py);
      [px, py] = [x, y];
    }
    return length;
  };
  const out = p.v.slice(1).map((_, k) => seg(k, k + 1));
  if (p.c) out.push(seg(p.v.length - 1, 0));
  return out;
}
const lengthOf = (p: Path): number => segmentLengths(p).reduce((a, b) => a + b, 0);

const keyed = (frames: { t: number; v: number }[]): Prop<number[]> => ({
  a: 1,
  k: frames.map(({ t, v }, n) => (n < frames.length - 1 ? { t, s: [v], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } } : { t, s: [v] })),
});

/** How far into the crossbar the exit track starts, so the stroke and the F's fill overlap instead of meeting at a seam. */
const EXIT_OVERLAP = 10;

/**
 * The hover replay: the F crawls once around the box, as the scribble does on load. Its tail eats the F from
 * its start while its head slides out of the crossbar on the right, runs round the outside and comes back in
 * from the left to draw the F again, the file's own second half, untouched. Built from the file itself:
 *
 * - The scribble layer becomes the F, eaten from its start at the scribble's pace. Its outline is closed (the
 *   closing segment is the crossbar's square end), so a trim that wraps past the end stays one shape; each cut
 *   is one of the file's own (where the F's draw-in has its head at that point), so it stays square to the ribbon.
 * - Body A, the stroke that leads the scribble out, runs from the crossbar instead, as thick as the crossbar's
 *   end, out past the right edge, up past the top and along to where body F's track starts, at body A's pace.
 * - The tail-cut wedge skips its stretch on body A (it shapes the scribble's end, which is not there).
 *
 * Played over the same `crawl` marker as the load animation, it starts and ends on the static mark. Every part
 * of it is its own object: lottie-web rewrites what it loads in place (a path's tangents become absolute), so an
 * array two shapes shared would be rewritten twice.
 */
export function replayData<T>(data: T): T {
  const d = structuredClone(data) as unknown as Lottie;
  const fLayer = layerNamed(d, "F");
  const crawl = layerNamed(d, "crawl");
  const scribble = layerNamed(d, "scribble");

  // The F's outline and its draw-in: at each frame the trim (percent of the open outline) runs from the head's
  // cut on one side, through the start, to the cut on the other side.
  const fGroup = groupNamed(fLayer.shapes, "F");
  const outline = staticPath(itemOf(fGroup, "sh"));
  const fTrim = itemOf(fGroup, "tm");
  const openLength = lengthOf(outline);
  const closed: Path = { ...structuredClone(outline), c: true };
  const closedLength = lengthOf(closed);
  const drawKeys = fTrim.s!.k as Key<number[]>[];
  const drawStart = drawKeys.find((k) => (k.s?.[0] ?? 0) > 0)?.t ?? fail("the F is never drawn");
  const drawEnd = drawKeys[drawKeys.length - 1]!.t;
  const cuts: [number, number][] = [];
  for (let t = drawStart; t <= drawEnd; t++) cuts.push([valueAt(fTrim.s!, t), valueAt(fTrim.e!, t)]);
  // Before its first cut the F is whole: a band of no width in the middle of its start.
  const middle = (cuts[0]![0] + cuts[0]![1]) / 2;
  cuts.unshift([middle, middle]);
  /** The cut when `p` of the F (0 to 1, along one side from its start) is gone. */
  const cutAt = (p: number): [number, number] => {
    const s = middle * (1 - p);
    const k = Math.max(1, cuts.findIndex(([cs]) => cs <= s));
    const [a, b] = [cuts[k - 1]!, cuts[k]!];
    const f = a[0] === b[0] ? 1 : (a[0] - s) / (a[0] - b[0]);
    return [s, a[1] + (b[1] - a[1]) * f];
  };

  // The scribble's pace: how much of it is gone, until body A takes its tail over (the scribble's last frame).
  const scribbleTrim = itemOf(groupNamed(scribble.shapes, "scribble"), "tm");
  const handOff = scribble.op;
  const whole = valueAt(scribbleTrim.s!, handOff);
  const [from] = crawlSegment(data as { markers?: Marker[] });
  const eFrames: { t: number; v: number }[] = [];
  const oFrames: { t: number; v: number }[] = [];
  for (let t = from; t <= handOff; t++) {
    const [s, e] = cutAt(Math.min(1, valueAt(scribbleTrim.s!, t) / whole));
    // What is left: from the cut on the far side, round the crossbar's end, to the cut on the near side.
    const [near, far] = [(s / 100) * openLength, (e / 100) * openLength];
    eFrames.push({ t, v: ((closedLength - far + near) / closedLength) * 100 });
    oFrames.push({ t, v: (far / closedLength) * 360 });
  }
  const exitF: Layer = {
    ...structuredClone(fLayer),
    nm: "F exit",
    ind: Math.max(...d.layers.map((l) => l.ind)) + 1,
    ip: 0,
    op: handOff + 1,
    shapes: [
      {
        ...structuredClone(fGroup),
        nm: "F exit",
        it: structuredClone(fGroup.it!).map((x) =>
          x.ty === "sh"
            ? { ...x, ks: { a: 0, k: closed } }
            : x.ty === "tm"
              ? { ...x, nm: "exit", s: { a: 0, k: 0 }, e: keyed(eFrames), o: keyed(oFrames) }
              : x,
        ),
      },
    ],
  };

  // Body A from the crossbar: the F's outline starts and ends on the crossbar's two end corners.
  const bodyA = groupNamed(crawl.shapes, "body A");
  const bodyF = groupNamed(crawl.shapes, "body F");
  const [c0, c1, n1] = [outline.v[0]!, outline.v[outline.v.length - 1]!, outline.v[1]!];
  const width = Math.hypot(c0[0] - c1[0], c0[1] - c1[1]);
  const along = [c0[0] - n1[0], c0[1] - n1[1]];
  const unit = Math.hypot(along[0]!, along[1]!);
  const end: Vec = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];
  const right = Math.max(...staticPath(itemOf(bodyA, "sh")).v.map(([x]) => x));
  const join = staticPath(itemOf(bodyF, "sh")).v[0]!;
  const corners: Vec[] = [[end[0] - (EXIT_OVERLAP * along[0]!) / unit, end[1] - (EXIT_OVERLAP * along[1]!) / unit], [right, end[1]], [right, join[1]], [join[0], join[1]]];
  const track: Path = { v: corners, i: corners.map((): Vec => [0, 0]), o: corners.map((): Vec => [0, 0]), c: false };
  const trackLength = lengthOf(track);
  const lead = (EXIT_OVERLAP / trackLength) * 100;
  const aTrim = itemOf(bodyA, "tm");
  const headKeys = aTrim.e!.k as Key<number[]>[];
  const tailKeys = aTrim.s!.k as Key<number[]>[];
  const head0 = headKeys[0]!.s![0]!;
  const out = headKeys.find((k) => k.s![0]! >= 100)?.t ?? fail("body A never leaves");
  const tail0 = valueAt(aTrim.s!, handOff);
  const tail1 = tailKeys.filter((k) => k.t > handOff && k.s![0]! > 0).at(-1) ?? fail("body A's tail never moves");
  const exit: Item = {
    ...bodyA,
    nm: "exit",
    it: bodyA.it!.map((x) => {
      if (x.ty === "sh") return { ...x, ks: { a: 0, k: track } };
      if (x.ty === "st") return { ...x, w: { a: 0, k: width } };
      if (x.ty !== "tm") return x;
      const head = headKeys.map((k) => (k.t > out ? k : { ...k, s: [lead + ((k.s![0]! - head0) / (100 - head0)) * (100 - lead)] }));
      const tail = tailKeys.map((k) =>
        k.t < handOff
          ? { ...k, s: [0] }
          : k.t > tail1.t
            ? k
            : { ...k, s: [lead + ((k.s![0]! - tail0) / (tail1.s![0]! - tail0)) * (tail1.s![0]! - lead)] },
      );
      return { ...x, e: { a: 1, k: head }, s: { a: 1, k: tail } };
    }),
  };

  // The wedge on the scribble's end: from its hold at the hand-off, skip ahead to where it is outside the box.
  const wedge = groupNamed(crawl.shapes, "tail cut");
  const wedgeShape = itemOf(wedge, "sh");
  const wedgeKeys = [...(wedgeShape.ks!.k as Key<Path[]>[])];
  const hold = wedgeKeys.findIndex((k) => k.h);
  const inside = (k: Key<Path[]>) => (k.s?.[0]?.v ?? []).some(([x, y]) => x > 0 && x < d.w && y > 0 && y < d.h);
  let next = hold + 1;
  while (next < wedgeKeys.length && inside(wedgeKeys[next]!)) next++;
  if (hold >= 0) wedgeKeys.splice(hold + 1, next - hold - 1);
  const cut: Item = { ...wedge, it: wedge.it!.map((x) => (x === wedgeShape ? { ...x, ks: { a: 1, k: wedgeKeys } } : x)) };

  const crawlGroup = crawl.shapes[0]!;
  const replayCrawl: Layer = {
    ...crawl,
    shapes: [{ ...crawlGroup, it: crawlGroup.it!.map((x) => (x === bodyA ? exit : x === wedge ? cut : x)) }],
  };
  return { ...d, layers: d.layers.map((l) => (l === crawl ? replayCrawl : l === scribble ? exitF : l)) } as unknown as T;
}
