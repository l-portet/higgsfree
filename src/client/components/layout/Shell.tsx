import { useEffect, type CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { CircleAlert } from "lucide-react";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { Lightbox } from "@/components/Lightbox";
import { Nav } from "./Nav";
import { connectEvents, subscribeEventStatus } from "@/lib/sse";
import { useModels } from "@/store/models";
import { useSettings } from "@/store/settings";

const OFFLINE_TOAST = "server-offline";

/** One-time boot: settings, catalog, live events, and reachability toasts. */
function useBoot() {
  useEffect(() => {
    void useSettings.getState().refresh();
    void useModels.getState().fetch();
    connectEvents();

    let wasOffline = false;
    const unsubStatus = subscribeEventStatus((status) => {
      if (status !== "open") return;
      const settings = useSettings.getState();
      if (wasOffline || settings.server === "offline") {
        wasOffline = false;
        toast.dismiss(OFFLINE_TOAST);
        toast.success("Server connected");
        void useModels.getState().fetch(true);
        settings.setServer("online");
        void settings.refresh();
      } else {
        settings.setServer("online");
      }
    });

    const unsubServer = useSettings.subscribe((s, prev) => {
      if (s.server === "offline" && prev.server !== "offline") {
        wasOffline = true;
        toast("Server unreachable", {
          id: OFFLINE_TOAST,
          description: "Reconnects on its own once the API is running (pnpm dev:server).",
          icon: <CircleAlert size={16} className="text-fg-muted" aria-hidden="true" />,
          duration: 8000,
        });
      }
    });

    return () => {
      unsubStatus();
      unsubServer();
    };
  }, []);
}

const toasterStyle = {
  "--normal-bg": "var(--color-surface-2)",
  "--normal-border": "var(--color-border-strong)",
  "--normal-text": "var(--color-fg)",
  "--border-radius": "12px",
  "--width": "356px",
} as CSSProperties;

export default function Shell() {
  useBoot();
  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={400}>
      <div className="flex min-h-dvh flex-col">
        <Nav />
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <Lightbox />
      {/* Top-right (not bottom-right as in DESIGN.md): the fixed prompt bar owns the bottom edge and toasts would cover Generate. */}
      <Toaster
        theme="dark"
        position="top-right"
        offset={{ top: 68, right: 16 }}
        mobileOffset={{ top: 64, right: 12, left: 12 }}
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
