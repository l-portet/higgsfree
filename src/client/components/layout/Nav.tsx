import { Link, NavLink } from "react-router-dom";
import { Clapperboard, House, Image, LayoutGrid, Settings, Wallet, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { iconButtonClasses } from "@/components/ui/iconButtonClasses";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { useSettings } from "@/store/settings";

const LINKS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/image", label: "Image", icon: Image },
  { to: "/video", label: "Video", icon: Clapperboard },
  { to: "/assets", label: "Assets", icon: LayoutGrid },
];

function CreditsPill() {
  const credits = useSettings((s) => s.credits);
  const hasKey = useSettings((s) => s.settings?.hasKey);
  if (!hasKey || !credits) return null;
  const low = credits.remaining < 1;
  return (
    <Tooltip content={`${formatUsd(credits.used)} used of ${formatUsd(credits.total)} purchased`}>
      <Link
        to="/settings"
        className={cn(
          "mr-1 hidden h-8 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-[13px] tabular-nums",
          "text-fg-muted transition-colors duration-150 hover:border-border-strong hover:bg-surface-3 hover:text-fg min-[420px]:inline-flex",
        )}
        aria-label={`${formatUsd(credits.remaining)} credits left`}
      >
        <Wallet size={14} className="shrink-0 text-fg-muted" aria-hidden="true" />
        <span className={cn("font-medium", low ? "text-danger" : "text-fg")}>{formatUsd(credits.remaining)}</span>
        <span>left</span>
      </Link>
    </Tooltip>
  );
}

/** Full-bleed app bar: the logo hugs the left edge and the controls the right edge; only content pages are capped at 1400px. */
export function Nav() {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="flex h-full items-center px-3 sm:px-5">
        <Link
          to="/"
          className="mr-2 flex shrink-0 items-center rounded-sm px-1 sm:mr-6"
          aria-label="Open Higgsfield home"
        >
          <Logo variant="lockup" size={24} wordmarkClassName="hidden sm:block" />
        </Link>

        <nav aria-label="Primary" className="flex h-full items-center gap-0.5">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "relative flex h-full items-center gap-1.5 px-2.5 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:text-fg sm:px-3",
                  isActive &&
                    "text-fg after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent sm:after:inset-x-3",
                )
              }
            >
              <Icon size={17} className="sm:hidden" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Product surfaces only: the GitHub link lives in Settings > About. */}
        <div className="ml-auto flex items-center gap-1">
          <CreditsPill />
          <Tooltip content="Settings" side="bottom">
            <NavLink
              to="/settings"
              aria-label="Settings"
              className={({ isActive }) => iconButtonClasses("ghost", "md", false, isActive ? "bg-surface-2 text-fg" : undefined)}
            >
              <Settings size={17} aria-hidden="true" />
            </NavLink>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
