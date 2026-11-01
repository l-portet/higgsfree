import { useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import type { ProviderId } from "@shared/types";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { PROVIDER_NAME } from "@/lib/providers";
import { pinQuote, SAME_PRICE_USD, shownQuote, type ProviderQuote, type QuoteReason } from "@/lib/video-cost";
import { useUi } from "@/store/ui";
import { Popover, PopoverContent, PopoverItem, PopoverLabel, PopoverTrigger } from "@/components/ui/Popover";
import { hasProviderLogo } from "@/components/icons/marks";
import { ProviderLogo } from "@/components/icons/providers";
import { ProviderTile } from "@/components/ProviderTile";

/** A provider's mark, or its letter in a small tile when it has none (kie.ai). */
function Mark({ provider, size, className }: { provider: ProviderId; size: number; className?: string }) {
  return hasProviderLogo(provider) ? (
    <ProviderLogo provider={provider} size={size} className={className} />
  ) : (
    <ProviderTile provider={provider} size={size + 2} className={cn("rounded-[4px] !text-[9px]", className)} />
  );
}

/** The price just before Generate, with the mark of the provider that runs it ("~$1.16"), for a model only one provider offers. */
export function CostEstimate({ usd, provider }: { usd: number; provider?: ProviderId }) {
  const label = formatUsd(usd, { approx: true });
  return (
    <span
      aria-label={`Estimated cost ${label}${provider ? ` on ${PROVIDER_NAME[provider]}` : ""}`}
      className="hidden items-center gap-1.5 rounded-button text-[13px] tabular-nums tracking-[-0.01em] text-fg-subtle sm:inline-flex"
    >
      {provider ? <Mark provider={provider} size={13} className="shrink-0" /> : null}
      {label}
    </span>
  );
}

/** Whole cents, as the prices are shown, so a difference adds up with them. */
const cents = (usd: number): number => Math.round(usd * 100) / 100;

/** What `ProviderPicker` needs of an image or a video quote (`pinQuote` applied or not). */
interface PickerQuote {
  quotes: ProviderQuote[];
  provider?: ProviderId;
  reason?: QuoteReason;
  picked?: boolean;
}

/** One line under a provider's name: why it cannot run, or its price against the one Auto picks. */
function rowNote(q: ProviderQuote, auto: PickerQuote, count: number): string | undefined {
  if (q.refusal) return q.refusal;
  if (q.noKey) return "No key yet. Add one";
  if (q.provider === auto.provider) return "Auto pick";
  if (q.usd === undefined) return "Price not known yet";
  const runner = auto.quotes.find((x) => x.provider === auto.provider)?.usd;
  if (runner === undefined) return undefined;
  if (Math.abs(q.usd - runner) < SAME_PRICE_USD) return "Same price";
  const diff = cents(q.usd * count) - cents(runner * count);
  return `${formatUsd(Math.abs(diff), { approx: true })} ${diff > 0 ? "more" : "less"}`;
}

/**
 * The price just before Generate, as a menu: Auto (the cheapest provider with a key that takes the request) or any
 * provider that offers the model, by hand. `auto` is the quote without the pick; `pinned` the pick, which
 * applies only while that provider has a key and takes the request. `count` multiplies a per-clip price.
 */
export function ProviderPicker({
  auto,
  pinned,
  onPin,
  count = 1,
}: {
  auto: PickerQuote;
  pinned: ProviderId | undefined;
  onPin: (provider: ProviderId | undefined) => void;
  count?: number;
}) {
  const [open, setOpen] = useState(false);
  const effective = pinQuote(auto, pinned);
  const shown = shownQuote(effective);
  const usd = shown?.usd !== undefined ? shown.usd * count : undefined;
  const label = usd !== undefined ? formatUsd(usd, { approx: true }) : shown ? PROVIDER_NAME[shown.provider] : "–";
  const choose = (p: ProviderId | undefined) => {
    onPin(p);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${usd !== undefined ? `Estimated cost ${label}` : "Provider"}${shown ? ` on ${PROVIDER_NAME[shown.provider]}` : ""}${effective.picked ? ", picked" : ""}. Change provider`}
          className={cn(
            "hidden h-8 items-center gap-1.5 rounded-button px-1.5 text-[13px] tabular-nums tracking-[-0.01em] text-fg-subtle sm:inline-flex",
            "transition-colors duration-150 hover:bg-surface-3 hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "data-[state=open]:bg-surface-3 data-[state=open]:text-fg-muted",
          )}
        >
          {shown ? <Mark provider={shown.provider} size={13} className="shrink-0" /> : null}
          {label}
          <ChevronDown size={12} aria-hidden="true" className="-ml-0.5 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[260px]">
        <div role="listbox" aria-label="Provider">
          <PopoverLabel>Run on{count > 1 ? ` · ${count} videos` : ""}</PopoverLabel>
          <PopoverItem selected={!effective.picked} onClick={() => choose(undefined)} className="items-start">
            <Sparkles size={14} aria-hidden="true" className="mt-[3px] shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Auto</div>
              <div className="text-caption">{autoNote(auto)}</div>
            </div>
            {!effective.picked ? <Check size={14} className="mt-[3px] shrink-0 text-accent" aria-hidden="true" /> : null}
          </PopoverItem>
          {auto.quotes.map((q) => {
            const selected = effective.picked === true && effective.provider === q.provider;
            const note = rowNote(q, auto, count);
            return (
              <PopoverItem
                key={q.provider}
                selected={selected}
                disabled={Boolean(q.refusal) && !q.noKey}
                onClick={() => {
                  if (q.noKey) {
                    setOpen(false);
                    useUi.getState().openKeyDialog({ provider: q.provider });
                  } else choose(q.provider);
                }}
                className="items-start"
              >
                <Mark provider={q.provider} size={14} className="mt-[3px] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{PROVIDER_NAME[q.provider]}</span>
                    <span className="tabular-nums text-fg-muted">{q.usd !== undefined ? formatUsd(q.usd * count, { approx: true }) : "–"}</span>
                  </div>
                  {note ? <div className={cn("text-caption", q.noKey && "text-accent")}>{note}</div> : null}
                </div>
                {selected ? <Check size={14} className="mt-[3px] shrink-0 text-accent" aria-hidden="true" /> : <span className="w-[14px] shrink-0" />}
              </PopoverItem>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Under the Auto row: who it picks and why ("Cheapest: kie.ai"), from `routeQuotes`' reason. */
function autoNote(quote: PickerQuote): string {
  const runner = quote.provider ? PROVIDER_NAME[quote.provider] : undefined;
  if (!runner) return "The cheapest provider you have a key for";
  switch (quote.reason) {
    case "cheaper":
      return `Cheapest: ${runner}`;
    case "tie":
      return `Same price: ${runner}`;
    case "unpriced":
      return `Not priced yet: ${runner}`;
    default:
      return runner;
  }
}
