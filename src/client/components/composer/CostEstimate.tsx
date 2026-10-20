import type { ReactNode } from "react";
import type { ProviderId } from "@shared/types";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { PROVIDER_NAME } from "@/lib/providers";
import { SAME_PRICE_USD, type ProviderQuote, type VideoQuote } from "@/lib/video-cost";
import { hasProviderLogo } from "@/components/icons/marks";
import { ProviderLogo } from "@/components/icons/providers";
import { ProviderTile } from "@/components/ProviderTile";
import { Tooltip } from "@/components/ui/Tooltip";

/** A provider's mark, or its letter in a small tile when it has none (kie.ai). */
function Mark({ provider, size, className }: { provider: ProviderId; size: number; className?: string }) {
  return hasProviderLogo(provider) ? (
    <ProviderLogo provider={provider} size={size} className={className} />
  ) : (
    <ProviderTile provider={provider} size={size + 2} className={cn("rounded-[4px] !text-[9px]", className)} />
  );
}

/**
 * The price just before Generate: the mark of the provider that runs it, then "~$1.16". With a
 * `breakdown`, hovering or focusing it shows that in a tooltip.
 */
export function CostEstimate({ usd, provider, breakdown }: { usd: number; provider?: ProviderId; breakdown?: ReactNode }) {
  const label = formatUsd(usd, { approx: true });
  const body = (
    <span
      tabIndex={breakdown ? 0 : undefined}
      aria-label={`Estimated cost ${label}${provider ? ` on ${PROVIDER_NAME[provider]}` : ""}`}
      className={cn("hidden items-center gap-1.5 rounded-button text-[13px] tabular-nums tracking-[-0.01em] text-fg-subtle sm:inline-flex", breakdown && "cursor-default")}
    >
      {provider ? <Mark provider={provider} size={13} className="shrink-0" /> : null}
      {label}
    </span>
  );
  return breakdown ? (
    <Tooltip content={breakdown} side="top" align="end">
      {body}
    </Tooltip>
  ) : (
    body
  );
}

/** Whole cents, as the prices are shown, so a difference adds up with them. */
const cents = (usd: number): number => Math.round(usd * 100) / 100;

/** One line under a provider's name: why it runs the video, or why not, against the one that does. */
function rowNote(q: ProviderQuote, quote: VideoQuote, count: number): string | undefined {
  if (q.refusal) return q.refusal;
  if (q.noKey) return "No key yet";
  if (q.provider === quote.provider) return count > 1 ? "Runs these videos" : "Runs this video";
  if (q.usd === undefined) return "Price not known yet";
  const runner = quote.quotes.find((x) => x.provider === quote.provider)?.usd;
  if (runner === undefined) return undefined;
  if (Math.abs(q.usd - runner) < SAME_PRICE_USD) return "Same price";
  return q.usd > runner ? `${formatUsd(cents(q.usd * count) - cents(runner * count), { approx: true })} more` : undefined;
}

function footer(quote: VideoQuote, preferred: ProviderId | undefined): string | undefined {
  const runner = quote.provider ? PROVIDER_NAME[quote.provider] : undefined;
  if (!runner) return undefined;
  const picked = quote.provider === preferred ? ", as set in Settings › Keys" : "";
  switch (quote.reason) {
    case "only":
      return `Only ${runner} offers this model.`;
    case "cheaper":
      return "The cheapest one runs it.";
    case "tie":
      return `Same price: ${runner} runs it${picked}.`;
    case "unpriced":
      return `Not priced yet: ${runner} runs it${picked}.`;
    default:
      return undefined;
  }
}

/** The tooltip: each provider that offers the model, its total for `count` clips, and which one runs them. */
export function VideoCostBreakdown({ quote, count, preferred }: { quote: VideoQuote; count: number; preferred?: ProviderId }) {
  const note = footer(quote, preferred);
  return (
    <div className="flex w-[236px] flex-col gap-2 py-1">
      <div className="text-label">Cost by provider{count > 1 ? ` · ${count} videos` : ""}</div>
      <ul className="flex flex-col gap-2">
        {quote.quotes.map((q) => {
          const runs = q.provider === quote.provider;
          const sub = rowNote(q, quote, count);
          return (
            <li key={q.provider} className="flex items-start gap-2">
              <Mark provider={q.provider} size={14} className={cn("mt-[3px] shrink-0", runs ? "text-fg" : "text-fg-subtle")} />
              <div className="min-w-0 flex-1">
                <div className={cn("flex items-baseline justify-between gap-3", runs ? "font-medium text-fg" : "text-fg-muted")}>
                  <span>{PROVIDER_NAME[q.provider]}</span>
                  <span className="tabular-nums">{q.usd !== undefined ? formatUsd(q.usd * count, { approx: true }) : "–"}</span>
                </div>
                {sub ? <div className={cn("text-caption", runs && "text-accent")}>{sub}</div> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {note ? <p className="border-t border-border pt-1.5 text-caption">{note}</p> : null}
    </div>
  );
}
