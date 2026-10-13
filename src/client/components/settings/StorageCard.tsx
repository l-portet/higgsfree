import { useEffect, useState } from "react";
import { Clapperboard, Copy, HardDrive, Image as ImageIcon, type LucideIcon } from "lucide-react";
import type { Generation, GenerationType, SettingsResponse } from "@shared/types";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { formatBytes, pluralize } from "@/lib/format";
import { copyText } from "@/lib/hooks";
import { useSettings } from "@/store/settings";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { FieldLabel, SettingsCard } from "./SettingsCard";

const SAMPLE_LIMIT = 200;

interface TypeStats {
  count: number;
  bytes: number;
  completed: number;
  /** More rows exist beyond the sampled window. */
  truncated: boolean;
}

type Stats = Partial<Record<GenerationType, TypeStats>>;

function summarize(items: Generation[], truncated: boolean): TypeStats {
  let bytes = 0;
  let completed = 0;
  for (const g of items) {
    if (g.output) {
      bytes += g.output.bytes;
      completed++;
    }
  }
  return { count: items.length, bytes, completed, truncated };
}

function StatTile({ icon: Icon, label, stats }: { icon: LucideIcon; label: string; stats: TypeStats | undefined }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-label">
        <Icon size={13} aria-hidden="true" />
        {label}
      </div>
      {stats ? (
        <>
          <div className="mt-1.5 text-[15px] font-medium tabular-nums text-fg">
            {stats.count}
            {stats.truncated ? "+" : ""}
            <span className="text-fg-muted"> · {formatBytes(stats.bytes)}</span>
          </div>
          <div className="mt-0.5 text-meta">
            {stats.truncated ? `of the latest ${SAMPLE_LIMIT}` : pluralize(stats.completed, "file")}
          </div>
        </>
      ) : (
        <Skeleton className="mt-2 h-9 w-24" />
      )}
    </div>
  );
}

export function StorageCard({ settings }: { settings: SettingsResponse | null }) {
  const server = useSettings((s) => s.server);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | undefined>();

  // Once, when the server is known to be up ("unknown" flips to "online" as soon as settings load).
  useEffect(() => {
    if (server !== "online") return;
    let cancelled = false;
    (async () => {
      try {
        const [image, video] = await Promise.all([
          api.listGenerations({ type: "image", limit: SAMPLE_LIMIT }),
          api.listGenerations({ type: "video", limit: SAMPLE_LIMIT }),
        ]);
        if (cancelled) return;
        setStats({
          image: summarize(image.items, Boolean(image.nextCursor)),
          video: summarize(video.items, Boolean(video.nextCursor)),
        });
        setError(undefined);
      } catch (err) {
        if (!cancelled) setError(describeApiError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [server]);

  const truncated = Boolean(stats?.image?.truncated || stats?.video?.truncated);
  const totalBytes = (stats?.image?.bytes ?? 0) + (stats?.video?.bytes ?? 0);
  const blob = settings?.storage === "blob";

  return (
    <SettingsCard
      icon={<HardDrive />}
      title="Storage"
      description={blob ? "Media live in a Vercel Blob store; records and settings in the database." : "Media and the database live in the data directory on this machine."}
    >
      <FieldLabel>{blob ? "Blob store" : "Data directory"}</FieldLabel>
      {settings ? (
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-surface-2 px-3 py-2 text-mono text-fg" title={settings.dataDir}>
            {settings.dataDir}
          </code>
          <IconButton label="Copy" variant="secondary" onClick={() => void copyText(settings.dataDir, "Copied")}>
            <Copy />
          </IconButton>
        </div>
      ) : (
        <Skeleton className="h-9 w-full" />
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile icon={ImageIcon} label="Images" stats={stats?.image} />
        <StatTile icon={Clapperboard} label="Videos" stats={stats?.video} />
      </div>

      {error ? (
        <p className="mt-2 text-meta text-danger" role="alert">
          Couldn't count generations: {error}
        </p>
      ) : stats ? (
        <p className="mt-2 text-meta tabular-nums">
          {formatBytes(totalBytes)} of media{truncated ? ` across the latest ${SAMPLE_LIMIT} of each type` : ""}.
        </p>
      ) : null}

      <p className="mt-3 text-meta">
        {blob
          ? "Deleting a generation removes its record and its file from the store."
          : "Deleting a generation removes its record and file from disk. Back up the data directory to keep everything."}
      </p>
    </SettingsCard>
  );
}
