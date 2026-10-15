"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import { cn } from "@/lib/cn";
import { MARK_PATH } from "@/lib/mark";
import { CRAWL_TILE_VIEWBOX, CRAWL_TO_TILE, crawlSegment, hexToLottie, LOTTIE_INK, recolor, replayData, START_D } from "@/lib/mark-crawl";

const PLAYER_CLASS = "block size-full";

type Lottie = (typeof import("lottie-web/build/player/lottie_light"))["default"];
type Crawl = typeof import("../../../docs/brand/mark-crawl.json");

/** lottie-web's light SVG build and the file, loaded once per page; a failed load is tried again next time. */
let player: Promise<[Lottie, Crawl]> | undefined;
const loadPlayer = (): Promise<[Lottie, Crawl]> =>
  (player ??= Promise.all([import("lottie-web/build/player/lottie_light"), import("../../../docs/brand/mark-crawl.json")]).then(
    ([{ default: lottie }, { default: raw }]): [Lottie, Crawl] => [lottie, raw],
    (err: unknown) => {
      player = undefined;
      throw err;
    },
  ));

/**
 * The nav logo with its load animation: the tile fades from the old lime to the green (`logo-intro`, globals.css)
 * while a scribble crawls into the F (docs/brand/mark-crawl.json). The static HTML draws the scribble; while the
 * intro is pending, lottie-web and the file load in the background and take over that path from the same frame,
 * then play once the fade starts. At the end the static path comes back as the mark and the player is destroyed.
 * Already past the intro, or with reduced motion, it draws the F and never loads the player.
 *
 * Hovering the link around it (the nav's home link) replays the crawl with the F instead of the scribble: the
 * ribbon slides out to the right and comes back in from the left (`replayData`). Once per hover, not while
 * something plays, not for touch (a tap is a navigation), nor with reduced motion.
 */
export function MarkCrawl({ size, tile, lime, ink, className }: { size: number; tile: string; lime: string; ink: string; className?: string }) {
  const pathRef = useRef<SVGPathElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const path = pathRef.current;
    const box = boxRef.current;
    if (!path || !box) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    /** The intro or a replay is on screen or loading; a hover waits for the static mark. */
    let busy = false;
    let anim: AnimationItem | null = null;

    const rest = () => {
      // The crawl's last frame is the mark itself, already in tile units.
      path.removeAttribute("transform");
      path.setAttribute("d", MARK_PATH);
      path.style.visibility = "";
    };
    const stop = () => {
      rest();
      anim?.destroy();
      anim = null;
      busy = false;
    };
    /** A player over the tile, paused on its first frame; `onReady` runs once it has drawn it. */
    const mount = (lottie: Lottie, data: unknown, onReady: (a: AnimationItem) => void) => {
      const a = lottie.loadAnimation({
        container: box,
        renderer: "svg",
        loop: false,
        autoplay: false,
        animationData: data,
        // Sized by the class alone, in the tile's box (no width/height, no composited layer of its own).
        rendererSettings: { viewBoxOnly: true, viewBoxSize: CRAWL_TILE_VIEWBOX, className: PLAYER_CLASS, focusable: false },
      });
      anim = a;
      a.addEventListener("DOMLoaded", () => onReady(a));
      a.addEventListener("complete", stop);
    };

    // ---------- The intro ----------
    let segment: [number, number] = [0, 0];
    let ready = false;
    let startedAt: number | null = null;
    const playIntro = () => {
      if (!anim || !ready || startedAt === null) return;
      // The fade may have started while the player was still loading: join it where it is rather than late.
      const behind = ((performance.now() - startedAt) / 1000) * anim.frameRate;
      const from = Math.min(segment[0] + behind, segment[1] - 1);
      anim.playSegments([from, segment[1]], true);
      path.style.visibility = "hidden";
    };
    const onAnimationStart = (e: AnimationEvent) => {
      if (e.animationName !== "logo-intro" || startedAt !== null) return;
      startedAt = performance.now();
      playIntro();
    };
    // The intro ended without the player ever taking over (no CSS animations, no chunk): rest on the F.
    const observer = new MutationObserver(() => {
      if (root.hasAttribute("data-accent-intro")) return;
      observer.disconnect();
      if (!ready || startedAt === null) stop();
    });
    if (root.hasAttribute("data-accent-intro") && !reduced.matches) {
      busy = true;
      void loadPlayer().then(
        ([lottie, raw]) => {
          if (disposed || !busy) return;
          const data = recolor(raw, LOTTIE_INK, hexToLottie(ink));
          segment = crawlSegment(data);
          mount(lottie, data, () => {
            ready = true;
            playIntro();
          });
        },
        // No player (offline, blocked chunk): the static path simply rests on the F once the intro ends.
        () => undefined,
      );
      document.addEventListener("animationstart", onAnimationStart);
      observer.observe(root, { attributes: true, attributeFilter: ["data-accent-intro"] });
    } else {
      rest();
    }

    // ---------- The replay ----------
    const replay = (e: PointerEvent) => {
      if (e.pointerType === "touch" || busy || disposed || reduced.matches) return;
      busy = true;
      void loadPlayer().then(
        ([lottie, raw]) => {
          if (disposed || !busy) return;
          const data = replayData(recolor(raw, LOTTIE_INK, hexToLottie(ink)));
          mount(lottie, data, (a) => {
            // Its first frame is the mark at rest, so the swap does not show.
            a.playSegments(crawlSegment(data), true);
            path.style.visibility = "hidden";
          });
        },
        () => {
          busy = false;
        },
      );
    };
    const trigger = box.closest("a") ?? box.parentElement;
    trigger?.addEventListener("pointerenter", replay);

    return () => {
      disposed = true;
      trigger?.removeEventListener("pointerenter", replay);
      document.removeEventListener("animationstart", onAnimationStart);
      observer.disconnect();
      anim?.destroy();
    };
  }, [ink]);

  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" className="block" aria-hidden="true" focusable="false">
        <rect width="64" height="64" rx="15" fill={tile} />
        <rect width="64" height="64" rx="15" fill={lime} className="logo-intro" />
        <path ref={pathRef} transform={CRAWL_TO_TILE} fill={ink} d={START_D} />
      </svg>
      <span ref={boxRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />
    </span>
  );
}
