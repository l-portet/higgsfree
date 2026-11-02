import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { ASSETS_ICON, HEART_ICON, IMAGE_ICON, KeyIcon, tabIconStyle, VIDEO_ICON } from "@/components/icons/nav";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import type { ProviderId } from "@shared/types";
import { totalBalance } from "@/lib/balances";
import { formatUsd } from "@/lib/format";
import { PROVIDER_IDS, PROVIDER_NAME } from "@/lib/providers";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

/** Each icon sits in a 16 px box; its own size, shape and mask come from `icons/nav` (built once, here). */
const TABS: { href: string; label: string; icon: CSSProperties }[] = [
  { href: "/", label: "Video", icon: tabIconStyle(VIDEO_ICON) },
  { href: "/image", label: "Image", icon: tabIconStyle(IMAGE_ICON) },
  { href: "/assets", label: "Assets", icon: tabIconStyle(ASSETS_ICON) },
  { href: "/favorites", label: "Favorites", icon: tabIconStyle(HEART_ICON) },
];

/** One floating box of the top bar: 46 px tall (1 px border, 4 px padding, 36 px tabs), chrome radius. */
const BOX = "flex h-[46px] items-center rounded-chrome border border-border bg-surface shadow-float";
const LABEL = "text-[13px] font-medium tracking-[-0.01em]";

/** `/video` serves the same view as `/` (which is its canonical); treat the two as one tab. */
function normalize(pathname: string): string {
  return pathname === "/video" ? "/" : pathname;
}

function isActive(pathname: string, href: string): boolean {
  // `href` of "/" would make every path a prefix match, so the exact test is the only one that applies.
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function IconBox({ children }: { children: ReactNode }) {
  return <span className="inline-flex size-4 shrink-0 items-center justify-center">{children}</span>;
}

type Balances = ReturnType<typeof useSettings.getState>["balances"];

/** One line per stored key: the provider, what is left (or why it could not be read), and the total under them. */
function BalanceList({ balances, providers }: { balances: Balances; providers: ProviderId[] }) {
  const total = totalBalance(balances);
  return (
    <div className="flex min-w-[208px] flex-col gap-1 py-0.5">
      <span className="text-label">Balance</span>
      {providers.map((p) => {
        const entry = balances[p];
        return (
          <div key={p} className="flex items-baseline justify-between gap-4">
            <span className="text-fg-muted">{PROVIDER_NAME[p]}</span>
            {!entry ? (
              <span className="text-fg-subtle">Checking…</span>
            ) : entry.ok ? (
              <span className="tabular-nums text-fg">
                {entry.balance.usd === null ? "Unlimited" : formatUsd(entry.balance.usd)}
                {entry.balance.credits !== undefined ? <span className="text-fg-subtle"> · {Math.floor(entry.balance.credits).toLocaleString("en-US")} cr</span> : null}
              </span>
            ) : (
              <span className="max-w-[150px] truncate text-right text-fg-subtle" title={entry.error}>
                {entry.error.includes("billing access") ? "Key can't read it" : "Couldn't read"}
              </span>
            )}
          </div>
        );
      })}
      {providers.length > 1 && total.read > 0 ? (
        <div className="mt-0.5 flex items-baseline justify-between gap-4 border-t border-border pt-1.5">
          <span className="text-fg-muted">Total</span>
          <span className="font-medium tabular-nums text-fg">
            {formatUsd(total.usd)}
            {total.unlimited ? " + unlimited" : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Add key" with a grey dot until a key is set; then what is left on every key together, with an accent dot. Hovering
 * lists each provider's balance (read again when older than 30 s). Either way it opens the keys in Settings.
 */
function KeyBox() {
  const settings = useSettings((s) => s.settings);
  const balances = useSettings((s) => s.balances);
  const refreshBalances = useSettings((s) => s.refreshBalances);
  const openSettings = useUi((s) => s.openSettings);
  const providers = PROVIDER_IDS.filter((p) => settings?.keys[p]);
  const hasKey = providers.length > 0;
  const total = totalBalance(balances);
  const label = !hasKey ? "Add key" : total.read > 0 ? formatUsd(total.usd) : "Key";
  const summary = hasKey
    ? providers
        .map((p) => {
          const e = balances[p];
          return `${PROVIDER_NAME[p]} ${e?.ok ? (e.balance.usd === null ? "unlimited" : formatUsd(e.balance.usd)) : "unknown"}`;
        })
        .join(", ")
    : "";
  const ariaLabel = hasKey ? `Balance${total.read > 0 ? ` ${formatUsd(total.usd)} in all` : ""}: ${summary}. Open keys` : "Add an API key";
  return (
    <Tooltip content={hasKey ? <BalanceList balances={balances} providers={providers} /> : "Add an API key"} side="bottom" align="end">
      <button
        type="button"
        onClick={() => openSettings("keys")}
        onPointerEnter={() => void refreshBalances()}
        onFocus={() => void refreshBalances()}
        aria-label={ariaLabel}
        className={cn(BOX, "group gap-2 px-[17px] text-fg-muted transition-colors duration-150 hover:text-fg")}
      >
        <IconBox>
          <KeyIcon className="text-fg-subtle transition-colors duration-150 group-hover:text-fg-muted" />
        </IconBox>
        <span className={cn(LABEL, "hidden tabular-nums sm:inline")}>{label}</span>
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", hasKey ? "bg-accent" : "bg-fg-disabled")} />
      </button>
    </Tooltip>
  );
}

interface Indicator {
  x: number;
  width: number;
  /** False until the first measure, so the indicator appears in place instead of sliding in from the edge. */
  animate: boolean;
}

/**
 * One raised box behind the active tab, measured from the tab itself so it slides (position and width)
 * to the next tab on navigation. Hidden on views without a tab (Settings).
 */
function useIndicator(activeIndex: number) {
  const tabs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  useLayoutEffect(() => {
    const el = activeIndex >= 0 ? tabs.current[activeIndex] : null;
    if (!el) {
      setIndicator(null);
      return;
    }
    const measure = () =>
      setIndicator((prev) => ({ x: el.offsetLeft, width: el.offsetWidth, animate: prev !== null }));
    measure();
    // Labels change width when the web font lands or collapse below `sm`: follow the tab.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeIndex]);

  return { tabs, indicator };
}

/**
 * The top bar: three floating boxes, centred. The logo (home, the Video view), the four views (the active one raised,
 * its icon in the accent), and the key. Tab labels collapse to icons on phones.
 */
export function Nav() {
  const pathname = normalize(usePathname() ?? "/");
  const activeIndex = TABS.findIndex((t) => isActive(pathname, t.href));
  const { tabs, indicator } = useIndicator(activeIndex);
  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-2">
        {/*
          A 30 px tile in a 46 px box: its 7 px corners stay concentric with the box's 15 px at the 8 px inset. The
          wordmark is always there from `md`; below it the box is the tile alone (there is not room for the whole word
          beside the tab labels between 640 and ~680 px, and phones need the space).
        */}
        <Link
          href="/"
          aria-label="higgsfree home"
          className={cn(BOX, "px-[7px] transition-colors duration-150 hover:border-border-strong focus-visible:border-border-strong")}
        >
          <Logo variant="mark" size={30} intro />
          <span aria-hidden="true" className="hidden whitespace-nowrap pl-2.5 pr-2 font-display text-[15px] font-bold leading-normal tracking-[-0.01em] text-fg md:block">
            higgsfree
          </span>
        </Link>

        <nav aria-label="Primary" className={cn(BOX, "relative gap-0.5 p-1")}>
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-0 top-1 h-9 rounded-control border border-border-strong bg-surface-2 shadow-raised",
              indicator?.animate && "transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
              indicator ? "opacity-100" : "opacity-0",
            )}
            style={indicator ? { width: indicator.width, transform: `translateX(${indicator.x}px)` } : undefined}
          />
          {TABS.map(({ href, label, icon }, i) => {
            const active = i === activeIndex;
            return (
              <Link
                key={href}
                href={href}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  LABEL,
                  "group relative flex h-9 items-center gap-2 rounded-control border border-transparent px-3 transition-colors duration-200",
                  active ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                <IconBox>
                  {/* The colour is the box's background, cut to the icon by its mask (`icons/nav` says why). */}
                  <span
                    aria-hidden="true"
                    style={icon}
                    className={cn(
                      "block shrink-0 transition-colors duration-200 forced-colors:bg-[CanvasText] forced-colors:forced-color-adjust-none",
                      active ? "bg-accent" : "bg-fg-subtle group-hover:bg-fg-muted",
                    )}
                  />
                </IconBox>
                <span className="sr-only sm:not-sr-only">{label}</span>
              </Link>
            );
          })}
        </nav>

        <KeyBox />
      </div>
    </header>
  );
}
