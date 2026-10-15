"use client";

import { useEffect, useRef } from "react";
import { MARK_MORPH, MORPH_TO_TILE, morphEnd, morphFrame } from "@/lib/mark-morph";

/** The first frame, computed once: it is what the static HTML draws, so the page opens on the swirl. */
const START = morphFrame(MARK_MORPH, MARK_MORPH.ip);

/**
 * The nav logo's glyph, morphing from a swirl into the F (docs/brand/mark-morph.json) as the accent sweeps on load.
 * It starts with the tile's lime-to-green fade (the `logo-intro` animation's start, after the hold) and plays
 * once at the file's frame rate, writing the path straight to the DOM each frame (no React render per frame).
 * Already past the intro, or with reduced motion, it rests on the F.
 */
export function MarkMorphGlyph({ fill }: { fill: string }) {
  const groupRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const m = MARK_MORPH;
    const end = morphEnd(m);
    const root = document.documentElement;
    let raf = 0;
    let started = false;
    const show = (frame: number) => {
      const f = morphFrame(m, frame);
      pathRef.current?.setAttribute("d", f.d);
      groupRef.current?.setAttribute("transform", f.transform);
    };
    const rest = () => {
      started = true;
      cancelAnimationFrame(raf);
      show(end);
    };
    if (!root.hasAttribute("data-accent-intro")) {
      rest();
      return;
    }
    const play = () => {
      if (started) return;
      started = true;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return show(end);
      const t0 = performance.now();
      const tick = (now: number) => {
        const frame = m.ip + ((now - t0) / 1000) * m.fr;
        show(Math.min(frame, end));
        if (frame < end) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const onAnimationStart = (e: AnimationEvent) => {
      if (e.animationName === "logo-intro") play();
    };
    // The intro ended without the fade ever starting (no CSS animations): rest on the F rather than on the swirl.
    const observer = new MutationObserver(() => {
      if (!root.hasAttribute("data-accent-intro") && !started) rest();
    });
    document.addEventListener("animationstart", onAnimationStart);
    observer.observe(root, { attributes: true, attributeFilter: ["data-accent-intro"] });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("animationstart", onAnimationStart);
      observer.disconnect();
    };
  }, []);

  return (
    <g transform={MORPH_TO_TILE}>
      <g ref={groupRef} transform={START.transform}>
        <path ref={pathRef} fill={fill} fillRule="evenodd" d={START.d} />
      </g>
    </g>
  );
}
