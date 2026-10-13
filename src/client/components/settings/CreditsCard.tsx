import { useEffect, useState } from "react";
import { CircleAlert, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { formatRelative, formatUsd } from "@/lib/format";
import { useTick } from "@/lib/hooks";
import { useSettings } from "@/store/settings";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { SettingsCard } from "./SettingsCard";

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-label">{label}</div>
      <div className={accent ? "mt-1 text-[22px] font-semibold leading-tight tabular-nums text-fg" : "mt-1 text-[15px] font-medium leading-tight tabular-nums text-fg"}>
        {value}
      </div>
    </div>
  );
}

export function CreditsCard() {
  const settings = useSettings((s) => s.settings);
  const credits = useSettings((s) => s.credits);
  const creditsError = useSettings((s) => s.creditsError);
  const refreshCredits = useSettings((s) => s.refreshCredits);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const now = useTick(30_000, updatedAt !== null);

  // The store doesn't stamp fetch time; note when the credits object changes.
  useEffect(() => {
    if (credits) setUpdatedAt(Date.now());
  }, [credits]);

  const hasKey = Boolean(settings?.hasKey);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCredits();
      const s = useSettings.getState();
      if (s.creditsError) toast.error("Couldn't refresh credits", { description: s.creditsError });
      else toast.success("Credits refreshed");
    } finally {
      setRefreshing(false);
    }
  };

  const usedPct = credits && credits.total > 0 ? Math.min(100, Math.max(0, (credits.used / credits.total) * 100)) : 0;
  const low = credits ? credits.remaining < 1 : false;

  return (
    <SettingsCard
      icon={<Wallet />}
      title="Credits"
      badge={low && credits ? <Badge variant="danger">Low</Badge> : null}
      description="Balance and usage on the active key, from OpenRouter."
      actions={
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<RefreshCw />}
          loading={refreshing}
          disabled={!hasKey}
          onClick={() => void onRefresh()}
        >
          Refresh
        </Button>
      }
    >
      {!settings ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-4" aria-busy="true">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : !hasKey ? (
        <p className="text-body text-fg-muted">Add an OpenRouter key to see your balance.</p>
      ) : creditsError && !credits ? (
        <div role="alert" className="flex items-start gap-2 rounded-control border border-danger/25 bg-danger/5 p-3 text-meta">
          <CircleAlert size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <span>{creditsError}</span>
        </div>
      ) : credits ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-4">
            <Stat label="Remaining" value={formatUsd(credits.remaining)} accent />
            <Stat label="Used" value={formatUsd(credits.used)} />
            <Stat label="Purchased" value={formatUsd(credits.total)} />
          </div>
          <div
            className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label="Credits used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(usedPct)}
            aria-valuetext={`${formatUsd(credits.used)} used of ${formatUsd(credits.total)}`}
          >
            <div
              className={low ? "h-full rounded-full bg-danger transition-[width] duration-300" : "h-full rounded-full bg-accent transition-[width] duration-300"}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-meta">
            <span className="tabular-nums">
              {usedPct.toFixed(usedPct < 10 && usedPct > 0 ? 1 : 0)}% used
              {credits.key?.limit !== null && credits.key?.limit !== undefined ? ` · limit ${formatUsd(credits.key.limit)}` : ""}
              {credits.key?.isFreeTier ? " · free tier" : ""}
            </span>
            <span>{updatedAt ? `Updated ${formatRelative(new Date(updatedAt), now)}` : ""}</span>
          </div>
          {creditsError ? (
            <p className="mt-2 text-meta text-danger" role="alert">
              Last refresh failed: {creditsError}
            </p>
          ) : null}
        </>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-4" aria-busy="true">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      )}
    </SettingsCard>
  );
}
