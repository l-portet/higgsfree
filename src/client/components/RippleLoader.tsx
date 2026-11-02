import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/** Grid pitch and dot size (CSS px), and the rings: a new one every `PERIOD` s, each crossing the card in `TRAVEL` s. */
const PITCH = 9;
const PERIOD = 1.3;
const TRAVEL = 2.6;
/** A ring's thickness (the gaussian's 2σ², in radius units) and where a dot turns from the quiet grey to the bright one. */
const RING_WIDTH = 0.011;
const LIT = 0.22;
/** The grid fades out over the outer seventh of each side. */
const EDGE = 7;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How lit a dot at radius `d` (0 centre, 1 the farthest corner) is at `t` seconds: the rings passing over it, summed. */
function glow(d: number, t: number): number {
  const phase = t % PERIOD;
  let sum = 0;
  for (let k = 0; k * PERIOD + phase <= TRAVEL; k++) {
    const r = (phase + k * PERIOD) / TRAVEL;
    const off = d - r;
    // Each ring swells in near the centre and dies out before it reaches the corners.
    sum += Math.exp(-(off * off) / RING_WIDTH) * smoothstep(0, 0.1, r) * (1 - smoothstep(0.6, 1, r));
  }
  return Math.min(1, sum);
}

/**
 * The placeholder of a run in progress: a grid of dots with rings of light spreading from the centre. Drawn on a canvas
 * at the device's resolution (2x at most), paused while the card is off screen or the tab hidden; with reduced motion
 * it is one still frame. Colours are the theme's `fg` (lit) and `fg-faint` (quiet).
 */
export function RippleLoader({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const box = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !box || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = getComputedStyle(box);
    const lit = css.getPropertyValue("--color-fg").trim() || "#edefef";
    const quiet = css.getPropertyValue("--color-fg-faint").trim() || "#676c6e";

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = box.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const cols = Math.floor(width / PITCH) + 1;
      const rows = Math.floor(height / PITCH) + 1;
      const x0 = (width - (cols - 1) * PITCH) / 2;
      const y0 = (height - (rows - 1) * PITCH) / 2;
      const cx = width / 2;
      const cy = height / 2;
      const reach = Math.hypot(cx, cy) || 1;
      ctx.clearRect(0, 0, width, height);
      for (let j = 0; j < rows; j++) {
        const y = y0 + j * PITCH;
        const v = y / height;
        for (let i = 0; i < cols; i++) {
          const x = x0 + i * PITCH;
          const u = x / width;
          const o = still ? 0.24 : glow(Math.hypot(x - cx, y - cy) / reach, t);
          const edge = Math.min(1, EDGE * u, EDGE * (1 - u), EDGE * v, EDGE * (1 - v));
          if (edge <= 0) continue;
          ctx.globalAlpha = edge * (0.1 + 0.62 * o);
          ctx.fillStyle = o > LIT ? lit : quiet;
          ctx.beginPath();
          ctx.arc(x, y, 0.75 + 0.5 * o, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    let frame = 0;
    let visible = true;
    const loop = (now: number) => {
      draw(now);
      frame = requestAnimationFrame(loop);
    };
    const run = () => {
      cancelAnimationFrame(frame);
      if (still) draw(start);
      else if (visible && !document.hidden) frame = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw(start);
    });
    ro.observe(box);
    resize();
    const io =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = Boolean(entry?.isIntersecting);
            run();
          });
    io?.observe(box);
    document.addEventListener("visibilitychange", run);
    run();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", run);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}
