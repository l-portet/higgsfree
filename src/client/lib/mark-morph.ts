/**
 * The logo's load morph (docs/brand/mark-morph.json, a Lottie export): a swirl that becomes the F. A tiny player
 * for exactly what that file uses, so the first frame can be in the static HTML and nothing heavy ships: one
 * shape layer whose paths morph (vertex by vertex, each keyframe eased by its own cubic bezier) and whose scale
 * is animated around a fixed anchor. Anything else in a replacement file is refused at load (`parseMorph`).
 */
import morphJson from "../../../docs/brand/mark-morph.json";

type Vec = [number, number];

interface Shape {
  i: Vec[];
  o: Vec[];
  v: Vec[];
  c: boolean;
}

interface Ease {
  x: number | number[];
  y: number | number[];
}

interface Keyframe<T> {
  t: number;
  s: T;
  o?: Ease;
  i?: Ease;
}

export interface Morph {
  /** Frames per second, first and last frame (the animation holds its last keyframes until `op`). */
  fr: number;
  ip: number;
  op: number;
  /** The artboard (px); the glyph lives inside it. */
  w: number;
  h: number;
  anchor: Vec;
  position: Vec;
  scale: Keyframe<number[]>[];
  paths: Keyframe<Shape[]>[][];
}

const fail = (why: string): never => {
  throw new Error(`mark-morph.json: ${why}`);
};

/** The subset this player renders; a file using more is a bug to fix here, not something to draw wrong. */
export function parseMorph(raw: unknown): Morph {
  const d = raw as Record<string, unknown> & { layers?: Record<string, unknown>[] };
  if (!Array.isArray(d.layers) || d.layers.length !== 1) fail("expected one layer");
  const layer = d.layers![0] as { ty: number; ks: Record<string, { a: number; k: unknown }>; shapes: { ty: string; it: { ty: string; ks?: { a: number; k: unknown } }[] }[] };
  if (layer.ty !== 4) fail("expected a shape layer");
  for (const key of ["o", "r", "p", "a"] as const) if (layer.ks[key]?.a !== 0) fail(`layer ${key} must not be animated`);
  if ((layer.ks.o?.k as number) !== 100 || (layer.ks.r?.k as number) !== 0) fail("layer opacity 100 and rotation 0 expected");
  const group = layer.shapes[0];
  if (!group || group.ty !== "gr" || layer.shapes.length !== 1) fail("expected one shape group");
  const shapes = group!.it.filter((it) => it.ty === "sh");
  if (shapes.length === 0 || shapes.some((s) => s.ks?.a !== 1)) fail("expected animated paths");
  return {
    fr: d.fr as number,
    ip: d.ip as number,
    op: d.op as number,
    w: d.w as number,
    h: d.h as number,
    anchor: (layer.ks.a!.k as number[]).slice(0, 2) as Vec,
    position: (layer.ks.p!.k as number[]).slice(0, 2) as Vec,
    scale: layer.ks.s!.a === 1 ? (layer.ks.s!.k as Keyframe<number[]>[]) : [{ t: 0, s: layer.ks.s!.k as number[] }],
    paths: shapes.map((s) => s.ks!.k as Keyframe<Shape[]>[]),
  };
}

export const MARK_MORPH: Morph = parseMorph(morphJson);

/** CSS-style cubic-bezier(x1, y1, x2, y2) easing: x(u) = t solved by Newton steps, then bisection as a fallback. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a1: number, a2: number, u: number) => 3 * a1 * u * (1 - u) ** 2 + 3 * a2 * u ** 2 * (1 - u) + u ** 3;
  const slope = (a1: number, a2: number, u: number) => 3 * a1 * (1 - u) ** 2 + 6 * (a2 - a1) * u * (1 - u) + 3 * (1 - a2) * u ** 2;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let n = 0; n < 8; n++) {
      const dx = at(x1, x2, u) - t;
      if (Math.abs(dx) < 1e-6) return at(y1, y2, u);
      const s = slope(x1, x2, u);
      if (Math.abs(s) < 1e-6) break;
      u -= dx / s;
    }
    let lo = 0;
    let hi = 1;
    u = t;
    for (let n = 0; n < 40; n++) {
      const x = at(x1, x2, u);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return at(y1, y2, u);
  };
}

const pick = (v: number | number[], dim: number): number => (Array.isArray(v) ? (v[dim] ?? v[0] ?? 0) : v);

/** Where `frame` sits between two keyframes: the segment and its eased progress for dimension `dim`. */
function segment<T>(kfs: Keyframe<T>[], frame: number, dim = 0): { a: Keyframe<T>; b: Keyframe<T>; p: number } {
  const first = kfs[0] as Keyframe<T>;
  const last = kfs[kfs.length - 1] as Keyframe<T>;
  if (frame <= first.t) return { a: first, b: first, p: 0 };
  if (frame >= last.t) return { a: last, b: last, p: 0 };
  let j = 0;
  while (j < kfs.length - 2 && (kfs[j + 1] as Keyframe<T>).t <= frame) j++;
  const a = kfs[j] as Keyframe<T>;
  const b = kfs[j + 1] as Keyframe<T>;
  const linear = (frame - a.t) / (b.t - a.t);
  const ease = a.o && a.i ? cubicBezier(pick(a.o.x, dim), pick(a.o.y, dim), pick(a.i.x, dim), pick(a.i.y, dim)) : (t: number) => t;
  return { a, b, p: ease(linear) };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Uniform scale (as a factor) at `frame`. */
export function scaleAt(m: Morph, frame: number): number {
  const { a, b, p } = segment(m.scale, frame);
  return lerp(a.s[0] ?? 100, b.s[0] ?? 100, p) / 100;
}

function shapeAt(kfs: Keyframe<Shape[]>[], frame: number): Shape {
  const { a, b, p } = segment(kfs, frame);
  const sa = a.s[0] as Shape;
  const sb = b.s[0] as Shape;
  if (p === 0 || sa === sb) return sa;
  const mix = (xs: Vec[], ys: Vec[]): Vec[] => xs.map((x, k) => [lerp(x[0], (ys[k] as Vec)[0], p), lerp(x[1], (ys[k] as Vec)[1], p)]);
  return { v: mix(sa.v, sb.v), i: mix(sa.i, sb.i), o: mix(sa.o, sb.o), c: sa.c };
}

const n = (x: number) => (Math.round(x * 100) / 100).toString();

/** A Lottie path (tangents relative to their vertex) as SVG path data. */
export function shapeToPath(s: Shape): string {
  const { v, i, o } = s;
  const out = [`M${n(v[0]![0])},${n(v[0]![1])}`];
  const curve = (from: number, to: number) => {
    const a = v[from]!;
    const b = v[to]!;
    out.push(`C${n(a[0] + o[from]![0])},${n(a[1] + o[from]![1])} ${n(b[0] + i[to]![0])},${n(b[1] + i[to]![1])} ${n(b[0])},${n(b[1])}`);
  };
  for (let k = 1; k < v.length; k++) curve(k - 1, k);
  if (s.c) {
    curve(v.length - 1, 0);
    out.push("Z");
  }
  return out.join("");
}

/** The glyph at `frame`: one path (outline and counter together, drawn even-odd) and its transform in artboard units. */
export function morphFrame(m: Morph, frame: number): { d: string; transform: string } {
  const d = m.paths.map((kfs) => shapeToPath(shapeAt(kfs, frame))).join(" ");
  const s = scaleAt(m, frame);
  const [px, py] = m.position;
  const [ax, ay] = m.anchor;
  return { d, transform: `translate(${n(px)} ${n(py)}) scale(${Math.round(s * 10000) / 10000}) translate(${n(-ax)} ${n(-ay)})` };
}

/** The last keyframe of every property: where the morph comes to rest. */
export const morphEnd = (m: Morph): number => Math.max(...m.paths.map((k) => k[k.length - 1]!.t), m.scale[m.scale.length - 1]!.t);

/**
 * From the artboard to the logo's 64-unit tile: the morph's final F lands exactly where the static mark draws
 * it (x 12.61–51.8, y 12.36–50.96), so the logo looks the same at rest as everywhere else.
 */
export const MORPH_TO_TILE = "translate(5.3 5.26) scale(0.10446)";
