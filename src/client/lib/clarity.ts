/** Microsoft Clarity, loaded once by `components/Clarity.tsx`. SECURITY.md covers what it can see; the CSP in `app/layout.tsx` allows its hosts. */

export const CLARITY_ID = (process.env.NEXT_PUBLIC_CLARITY_ID ?? "").trim() || "z9kdvhwh47";

const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];

/** What the install snippet leaves on `window`: calls queue on `q` until the tag has loaded. */
interface ClarityQueue {
  (...args: unknown[]): void;
  q?: unknown[][];
}

declare global {
  interface Window {
    clarity?: ClarityQueue;
    /** `true` before the app hydrates keeps Clarity off for this page load. */
    CLARITY_DISABLED_ENV?: boolean;
  }
}

/** Production builds only, never on a local hostname, and never when the page opts out. */
export function shouldLoadClarity(): boolean {
  return process.env.NODE_ENV === "production" && !LOCAL_HOSTNAMES.includes(window.location.hostname) && window.CLARITY_DISABLED_ENV !== true;
}

/** Microsoft's install snippet, spelled out: queue calls on `window.clarity`, then load the tag ahead of the first script. */
export function loadClarity(): void {
  if (!shouldLoadClarity()) return;
  const clarity: ClarityQueue =
    window.clarity ??
    ((...args) => {
      (clarity.q ??= []).push(args);
    });
  window.clarity = clarity;
  const tag = document.createElement("script");
  tag.async = true;
  tag.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
  const first = document.getElementsByTagName("script")[0];
  first?.parentNode?.insertBefore(tag, first);
}
