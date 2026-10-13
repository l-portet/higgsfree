import { useEffect, useRef } from "react";
import { useComposer } from "@/store/composer";
import { ImageComposer } from "./ImageComposer";
import { VideoComposer } from "./VideoComposer";

/**
 * The prompt dock: fixed to the bottom of every view, one mode at a time. It reports its height as
 * `--composer-h` on <html> so the shell can pad pages for it (a long prompt grows the bar).
 */
export function Composer() {
  const mode = useComposer((s) => s.mode);
  const hidden = useComposer((s) => s.hidden);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el || hidden) {
      root.style.setProperty("--composer-h", "0px");
      return;
    }
    const report = () => root.style.setProperty("--composer-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hidden]);

  if (hidden) return null;

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4"
    >
      {mode === "video" ? <VideoComposer /> : <ImageComposer />}
    </div>
  );
}
