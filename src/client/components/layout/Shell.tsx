"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { Lightbox } from "@/components/Lightbox";
import { Nav } from "./Nav";
import { STORAGE_PREFIX } from "@/lib/constants";
import { announceVideoReady, primeAudioOnInteraction } from "@/lib/alerts";
import { drivingImageCount, startEngine } from "@/lib/engine";
import { connectEvents, subscribeEventStatus, type EventStatus } from "@/lib/live";
import { persistenceAsked, requestPersistence } from "@/lib/storage-health";
import { useComposer } from "@/store/composer";
import { useFolders } from "@/store/folders";
import { useModels } from "@/store/models";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

// Client-only: both read localStorage / stores on first render, so they are not server-rendered.
const Composer = dynamic(() => import("@/components/composer/Composer").then((m) => m.Composer), { ssr: false });
const KeyDialog = dynamic(() => import("@/components/KeyDialog").then((m) => m.KeyDialog), { ssr: false });
const SettingsDialog = dynamic(() => import("@/components/settings/SettingsDialog").then((m) => m.SettingsDialog), { ssr: false });

const STORAGE_TOAST = "storage-unavailable";

const INTRO = "data-accent-intro";
const SWEEPS = ["accent-shift", "logo-intro"];

/**
 * The accent intro (globals.css): the static HTML opens on the old lime; once the app is up and a frame
 * is painted, play the sweep, then drop the attribute (resting green, transitions back on). Started here
 * rather than by a clock at first style, so a slow first paint can never swallow the lime. Two frames:
 * the first may still be the one that commits hydration. A background tab waits until it is shown.
 */
function playAccentIntro(): () => void {
  const root = document.documentElement;
  if (root.getAttribute(INTRO) !== "") return () => undefined; // already playing or played
  const done = () => root.removeAttribute(INTRO);
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      root.setAttribute(INTRO, "play");
      // The accent (on <html>) and the logo's tile (in the nav) run on two clocks (globals.css): wait for both.
      const sweeps = typeof root.getAnimations === "function" ? root.getAnimations({ subtree: true }).filter((a) => SWEEPS.includes((a as CSSAnimation).animationName)) : [];
      if (sweeps.length) void Promise.allSettled(sweeps.map((a) => a.finished)).then(done);
      else done();
    });
  });
  // StrictMode runs effects twice in dev: the first pass is cancelled before its frames fire.
  return () => cancelAnimationFrame(frame);
}

/** After the first completed generation in this profile, ask the browser to keep the library out of eviction. */
function onCompleted(): void {
  if (!persistenceAsked()) void requestPersistence();
}

/**
 * One-time boot: the live feed and the job engine (they only need IndexedDB), OpenRouter's public
 * model catalog, settings, and the Favorites folders. Everything that touches `window` or storage stays inside the effect.
 */
function useBoot() {
  useEffect(() => {
    const stopIntro = playAccentIntro();
    connectEvents();
    // A finished video: the ding and the notification from Settings › Notifications. Clicking the
    // notification brings this tab forward with the video in the lightbox.
    startEngine({ onCompleted, onVideoCompleted: (g) => announceVideoReady(g, () => useUi.getState().openLightbox([g.id], 0)) });
    const stopPriming = primeAudioOnInteraction();
    void useModels.getState().fetch();
    void useSettings.getState().refresh();
    // Folder names show on kept cards everywhere, not only on Favorites.
    void useFolders.getState().fetch();

    // `closed` after `connecting`: IndexedDB could not be opened (private window, blocked site storage).
    let prevStatus: EventStatus | undefined;
    const unsubStatus = subscribeEventStatus((status) => {
      if (status === "closed" && prevStatus === "connecting") {
        toast.error("Local storage unavailable", {
          id: STORAGE_TOAST,
          description: "This browser blocks site storage here (private window or settings). Generations cannot be saved.",
          duration: Infinity,
        });
      }
      prevStatus = status;
    });

    // Another tab changed the key or the defaults.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith(STORAGE_PREFIX)) void useSettings.getState().refresh();
    };
    // Image calls run in this tab only: closing it loses them, and OpenRouter still charges.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (drivingImageCount() === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      stopIntro();
      stopPriming();
      unsubStatus();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);
}

/** The composer follows the Image / Video view and keeps its last mode on the other views. */
function useComposerMode() {
  const pathname = usePathname();
  const setMode = useComposer((s) => s.setMode);
  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/image")) setMode("image");
    else if (pathname.startsWith("/video")) setMode("video");
  }, [pathname, setMode]);
}

const toasterStyle = {
  "--normal-bg": "var(--color-surface-2)",
  "--normal-border": "var(--color-border-strong)",
  "--normal-text": "var(--color-fg)",
  "--border-radius": "13px",
  "--width": "356px",
} as CSSProperties;

export default function Shell({ children }: { children: ReactNode }) {
  useBoot();
  useComposerMode();
  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={400}>
      <div className="flex min-h-dvh flex-col">
        <Nav />
        {/* Clears the floating nav at the top and the composer at the bottom (its measured height). */}
        <main className="flex flex-1 flex-col pt-[72px] pb-[calc(var(--composer-h,132px)+16px)]">{children}</main>
      </div>
      <Composer />
      <KeyDialog />
      <SettingsDialog />
      <Lightbox />
      {/* Top-right: the floating nav sits in the centre and the composer owns the bottom edge. */}
      <Toaster
        theme="dark"
        position="top-right"
        offset={{ top: 16, right: 16 }}
        mobileOffset={{ top: 68, right: 12, left: 12 }}
        gap={8}
        visibleToasts={4}
        style={toasterStyle}
        toastOptions={{
          duration: 4000,
          classNames: {
            toast: "!font-sans !text-[13px] !leading-[1.5] !shadow-popover",
            title: "!font-medium",
            description: "!text-fg-muted !text-[12px] !leading-[1.4]",
          },
        }}
      />
    </TooltipProvider>
  );
}
