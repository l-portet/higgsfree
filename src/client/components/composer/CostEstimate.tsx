import type { ReactNode } from "react";
import type { ProviderId } from "@shared/types";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { PROVIDER_NAME } from "@/lib/providers";
import type { ProviderQuote, VideoQuote } from "@/lib/video-cost";
import { ProviderLogo } from "@/components/icons/providers";
import { Tooltip } from "@/components/ui/Tooltip";

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
      {provider ? <ProviderLogo provider={provider} size={13} className="shrink-0" /> : null}
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

/** One line under a provider's name: why it runs the video, or why not. */
function rowNote(q: ProviderQuote, quote: VideoQuote, count: number): string | undefined {
  if (q.refusal) return q.refusal;
  if (q.noKey) return "No key yet";
  if (q.provider === quote.provider) return count > 1 ? "Runs these videos" : "Runs this video";
  if (q.usd === undefined) return "Price not known yet";
  if (quote.reason === "tie") return "Same price";
  const runner = quote.quotes.find((x) => x.provider === quote.provider);
  if (quote.reason === "cheaper" && runner?.usd !== undefined) return `${formatUsd(cents(q.usd * count) - cents(runner.usd * count), { approx: true })} more`;
  return undefined;
}

function footer(quote: VideoQuote): string | undefined {
  const runner = quote.provider ? PROVIDER_NAME[quote.provider] : undefined;
  switch (quote.reason) {
    case "only":
      return runner ? `Only ${runner} offers this model.` : undefined;
    case "cheaper":
      return "The cheaper one runs it.";
    case "tie":
      return runner ? `Same price: ${runner} runs it, as set in Settings › Keys.` : undefined;
    case "unpriced":
      return runner ? `Not priced yet: ${runner} runs it, as set in Settings › Keys.` : undefined;
    default:
      return undefined;
  }
}

/** The tooltip: each provider that offers the model, its total for `count` clips, and which one runs them. */
export function VideoCostBreakdown({ quote, count }: { quote: VideoQuote; count: number }) {
  const note = footer(quote);
  return (
    <div className="flex w-[236px] flex-col gap-2 py-1">
      <div className="text-label">Cost by provider{count > 1 ? ` · ${count} videos` : ""}</div>
      <ul className="flex flex-col gap-2">
        {quote.quotes.map((q) => {
          const runs = q.provider === quote.provider;
          const sub = rowNote(q, quote, count);
          return (
            <li key={q.provider} className="flex items-start gap-2">
              <ProviderLogo provider={q.provider} size={14} className={cn("mt-[3px] shrink-0", runs ? "text-fg" : "text-fg-subtle")} />
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
