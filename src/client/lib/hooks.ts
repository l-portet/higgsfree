import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";

/** Milliseconds elapsed since `startIso`, ticking every second while `active`. */
export function useElapsed(startIso: string | undefined, active: boolean, endIso?: string): number {
  const compute = () => {
    if (!startIso) return 0;
    const start = Date.parse(startIso);
    if (Number.isNaN(start)) return 0;
    const end = endIso ? Date.parse(endIso) : Date.now();
    return Math.max(0, end - start);
  };
  const [elapsed, setElapsed] = useState(compute);

  useEffect(() => {
    setElapsed(compute());
    if (!active || !startIso) return;
    const id = setInterval(() => setElapsed(compute()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startIso, active, endIso]);

  return elapsed;
}

/** Re-render every `ms` (for relative timestamps). */
export function useTick(ms: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

export async function copyText(text: string, label = "Copied"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Couldn't copy");
  }
}

/**
 * Focus restoration for dialogs opened programmatically (no `DialogTrigger`, so Radix has no
 * trigger to return focus to and would leave it on `<body>`). Capture the element that had focus
 * in `onOpenAutoFocus` (fires before focus moves into the dialog) and restore it on close.
 */
export function useReturnFocus() {
  const returnTo = useRef<HTMLElement | null>(null);
  const onOpenAutoFocus = () => {
    const el = document.activeElement;
    returnTo.current = el instanceof HTMLElement && el !== document.body ? el : null;
  };
  const onCloseAutoFocus = (e: Event) => {
    const el = returnTo.current;
    returnTo.current = null;
    if (!el || !el.isConnected) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
  };
  return { onOpenAutoFocus, onCloseAutoFocus };
}

// One observer for every card: a large grid would otherwise create one per card.
const NEAR_ROOT_MARGIN = "300px";
const nearCallbacks = new WeakMap<Element, () => void>();
let nearObserver: IntersectionObserver | null = null;

function observeNear(el: Element, onNear: () => void): () => void {
  nearObserver ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) nearCallbacks.get(e.target)?.();
    },
    { rootMargin: NEAR_ROOT_MARGIN },
  );
  nearCallbacks.set(el, onNear);
  nearObserver.observe(el);
  return () => {
    nearCallbacks.delete(el);
    nearObserver?.unobserve(el);
  };
}

/** True once `ref` has come within 300px of the viewport; stays true after (media is kept loaded). */
export function useNearViewport(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    return observeNear(el, () => setNear(true));
  }, [ref, near]);
  return near;
}

/** `matchMedia` as a hook (SSR-safe default `false`). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return matches;
}
