"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { Lightbox } from "@/components/Lightbox";
import { Nav } from "./Nav";
import { STORAGE_PREFIX } from "@/lib/constants";
import { drivingImageCount, startEngine } from "@/lib/engine";
import { connectEvents, subscribeEventStatus, type EventStatus } from "@/lib/live";
import { persistenceAsked, requestPersistence } from "@/lib/storage-health";
import { useComposer } from "@/store/composer";
import { useModels } from "@/store/models";
import { useSettings } from "@/store/settings";

// Client-only: both read localStorage / stores on first render, so they are not server-rendered.
const Composer = dynamic(() => import("@/components/composer/Composer").then((m) => m.Composer), { ssr: false });
const KeyDialog = dynamic(() => import("@/components/KeyDialog").then((m) => m.KeyDialog), { ssr: false });
const SettingsDialog = dynamic(() => import("@/components/settings/SettingsDialog").then((m) => m.SettingsDialog), { ssr: false });

const STORAGE_TOAST = "storage-unavailable";

/** After the first completed generation in this profile, ask the browser to keep the library out of eviction. */
function onCompleted(): void {
  if (!persistenceAsked()) void requestPersistence();
}

/**
 * One-time boot: the live feed and the job engine (they only need IndexedDB), OpenRouter's public
 * model catalog, and settings. Everything that touches `window` or storage stays inside the effect.
 */
function useBoot() {
  useEffect(() => {
    connectEvents();
    startEngine({ onCompleted });
    void useModels.getState().fetch();
    void useSettings.getState().refresh();

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
