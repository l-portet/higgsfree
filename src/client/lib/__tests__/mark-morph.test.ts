/** The logo's load morph: the player reads the Lottie as exported, starts on the swirl, rests on today's F. */
import { describe, expect, it } from "vitest";
import morphJson from "../../../../docs/brand/mark-morph.json";
import { cubicBezier, MARK_MORPH, morphEnd, morphFrame, MORPH_TO_TILE, parseMorph, scaleAt, shapeToPath } from "../mark-morph";

type Shape = Parameters<typeof shapeToPath>[0];
const paths = MARK_MORPH.paths;
const startShapes = paths.map((k) => k[0]!.s[0] as Shape);
const endShapes = paths.map((k) => k[k.length - 1]!.s[0] as Shape);

describe("mark morph", () => {
  it("reads the export: 60 fps, one layer, outline and counter morphing, an animated scale", () => {
    expect(MARK_MORPH).toMatchObject({ fr: 60, ip: 0, op: 112, w: 512, h: 512 });
    expect(paths).toHaveLength(2);
    expect(paths.every((k) => k.length === 25)).toBe(true);
    expect(morphEnd(MARK_MORPH)).toBe(84);
    expect(() => parseMorph({ ...morphJson, layers: [...morphJson.layers, ...morphJson.layers] })).toThrow(/one layer/);
  });

  it("starts on the first keyframes, rests on the last, and blends in between", () => {
    const start = morphFrame(MARK_MORPH, 0);
    expect(start.d).toBe(startShapes.map(shapeToPath).join(" "));
    expect(start.transform).toContain("scale(1)");
    const end = morphFrame(MARK_MORPH, morphEnd(MARK_MORPH));
    expect(end.d).toBe(endShapes.map(shapeToPath).join(" "));
    expect(morphFrame(MARK_MORPH, 112).d).toBe(end.d);
    const mid = morphFrame(MARK_MORPH, 40).d;
    expect(mid).not.toBe(start.d);
    expect(mid).not.toBe(end.d);
    // The scale dips, overshoots and settles, as keyed.
    expect(scaleAt(MARK_MORPH, 14)).toBeCloseTo(0.975, 4);
    expect(scaleAt(MARK_MORPH, 52)).toBeCloseTo(1.018, 4);
    expect(scaleAt(MARK_MORPH, 100)).toBe(1);
  });

  it("eases like CSS cubic-bezier", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 4);
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 3);
    let prev = 0;
    for (let t = 0.05; t < 1; t += 0.05) {
      const y = ease(t);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it("lands the final F where the static mark draws it in the 64-unit tile", () => {
    const [, tx, ty, k] = MORPH_TO_TILE.match(/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/)!.map(Number);
    const v = endShapes[0]!.v;
    const xs = v.map((p) => tx! + p[0] * k!);
    const ys = v.map((p) => ty! + p[1] * k!);
    // MARK_PATH spans x 12.61-51.8, y 12.36-50.96.
    expect(Math.min(...xs)).toBeCloseTo(12.61, 0);
    expect(Math.max(...xs)).toBeCloseTo(51.8, 0);
    expect(Math.min(...ys)).toBeCloseTo(12.36, 0);
    expect(Math.max(...ys)).toBeCloseTo(50.96, 0);
    for (const [lo, hi, vs] of [[12.61, 51.8, xs], [12.36, 50.96, ys]] as const) {
      expect(Math.abs(Math.min(...vs) - lo)).toBeLessThan(0.3);
      expect(Math.abs(Math.max(...vs) - hi)).toBeLessThan(0.3);
    }
  });
});
