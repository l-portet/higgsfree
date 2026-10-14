import type { ReactNode } from "react";
import { Bell, HardDrive, Info, KeyRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSettings } from "@/store/settings";
import { useUi, type SettingsSection } from "@/store/ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { AboutCard } from "./AboutCard";
import { ApiKeyCard } from "./ApiKeyCard";
import { NotificationsCard } from "./NotificationsCard";
import { ProvidersCard } from "./ProvidersCard";
import { StorageCard } from "./StorageCard";

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: "keys", label: "Keys", icon: <KeyRound size={15} aria-hidden="true" /> },
  { id: "library", label: "Library", icon: <HardDrive size={15} aria-hidden="true" /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={15} aria-hidden="true" /> },
  { id: "about", label: "About", icon: <Info size={15} aria-hidden="true" /> },
];

function SectionBody({ section }: { section: SettingsSection }) {
  const settings = useSettings((s) => s.settings);
  switch (section) {
    case "keys":
      return (
        <>
          <ApiKeyCard settings={settings} />
          <ProvidersCard settings={settings} />
        </>
      );
    case "library":
      return <StorageCard />;
    case "notifications":
      return <NotificationsCard />;
    case "about":
      return <AboutCard />;
  }
}

/**
 * Every setting in one dialog: sections on the left (a scrolling row on phones), the open section's
 * cards on the right, shown flat. Opened from the key pill, the key dialog and `/settings` links.
 */
export function SettingsDialog() {
  const section = useUi((s) => s.settings);
  const openSettings = useUi((s) => s.openSettings);
  const close = useUi((s) => s.closeSettings);
  const current = section ?? "keys";
  return (
    <Dialog open={section !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent
        size="xl"
        aria-describedby={undefined}
        className="flex h-[min(640px,calc(100dvh-32px))] flex-col overflow-hidden p-0 sm:flex-row"
      >
        <aside className="flex shrink-0 flex-col border-b border-border sm:w-[208px] sm:border-b-0 sm:border-r sm:bg-inset/40">
          <DialogTitle className="px-5 pb-1 pt-4 sm:px-4 sm:pb-3 sm:pt-5">Settings</DialogTitle>
          <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto px-3 pb-2 sm:flex-col sm:overflow-visible sm:px-2 sm:pb-3">
            {SECTIONS.map((s) => {
              const active = s.id === current;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSettings(s.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] font-medium transition-colors duration-150",
                    active ? "bg-surface-2 text-fg shadow-raised" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg",
                  )}
                >
                  <span className={cn("inline-flex size-[18px] shrink-0 items-center justify-center", active ? "text-fg" : "text-fg-subtle")}>{s.icon}</span>
                  <span className="whitespace-nowrap">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
        {/* The cards keep their headers and bodies; inside the dialog they lose the card chrome. */}
        <div
          key={current}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 sm:px-7 sm:pt-6",
            "flex flex-col gap-7 [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0",
            "[&>section+section]:border-t [&>section+section]:border-border [&>section+section]:pt-7",
            "[&>section:first-child>header]:pr-12",
          )}
        >
          <SectionBody section={current} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
