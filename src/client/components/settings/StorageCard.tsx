import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Clapperboard, Download, HardDrive, Image as ImageIcon, ShieldCheck, Trash2, Upload, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import type { StorageStats, TypeStats } from "@shared/types";
import * as api from "@/lib/api";
import { ApiClientError, describeApiError } from "@/lib/api";
import { exportLibrary, importLibrary, type ArchiveProgress } from "@/lib/archive";
import { formatBytes, pluralize } from "@/lib/format";
import { estimateStorage, isSafari, requestPersistence, type StorageEstimate } from "@/lib/storage-health";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { FieldLabel, SettingsCard } from "./SettingsCard";

/** An export or an import in flight; `progress` is null until the archive reports its first step. */
interface Task {
  kind: "export" | "import";
  progress: ArchiveProgress | null;
}

function taskLabel({ kind, progress }: Task): string {
  if (!progress) return kind === "export" ? "Preparing the export…" : "Reading the archive…";
  const counter = `${progress.done} / ${progress.total}`;
  if (progress.phase === "listing") return "Listing files…";
  if (progress.phase === "media") return `Packing ${counter}…`;
  if (progress.phase === "records") return `Importing ${counter}…`;
  return kind === "export" ? "Saving…" : "Finishing…";
}

const percent = (part: number, whole: number): number => (whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0);

function Bar({ pct, label, danger }: { pct: number; label: string; danger?: boolean }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className={danger ? "h-full rounded-full bg-danger transition-[width] duration-300" : "h-full rounded-full bg-accent transition-[width] duration-300"}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatTile({ icon: Icon, label, stats }: { icon: LucideIcon; label: string; stats: TypeStats | undefined }) {
  return (
    <div className="rounded-control border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-label">
        <Icon size={13} aria-hidden="true" />
        {label}
      </div>
      {stats ? (
        <>
          <div className="mt-1.5 text-[15px] font-medium tabular-nums text-fg">
            {stats.count}
            <span className="text-fg-muted"> · {formatBytes(stats.bytes)}</span>
          </div>
          <div className="mt-0.5 text-meta">{pluralize(stats.completed, "file")}</div>
        </>
      ) : (
        <Skeleton className="mt-2 h-9 w-24" />
      )}
    </div>
  );
}

/** The "Library" card: what this browser holds, eviction protection, export / import, delete everything. */
export function StorageCard() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [statsError, setStatsError] = useState<string | undefined>();
  const [estimate, setEstimate] = useState<StorageEstimate | undefined>();
  /** Both loads answered at least once (the estimate may still be undefined: no Storage API). */
  const [ready, setReady] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [protecting, setProtecting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const safari = isSafari();

  const load = useCallback(async () => {
    const estimated = estimateStorage();
    try {
      setStats(await api.getStorageStats());
      setStatsError(undefined);
    } catch (err) {
      setStatsError(describeApiError(err));
    }
    setEstimate(await estimated);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onProtect = async () => {
    if (protecting) return;
    setProtecting(true);
    try {
      const granted = await requestPersistence();
      if (granted) toast.success("Protected from eviction");
      else toast("The browser declined; it may still keep the data.");
      await load();
    } finally {
      setProtecting(false);
    }
  };

  const onExport = async () => {
    if (task) return;
    setTask({ kind: "export", progress: null });
    try {
      const { filename } = await exportLibrary({ onProgress: (progress) => setTask({ kind: "export", progress }) });
      toast.success("Library exported", { description: filename });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 499) return; // the save dialog was dismissed
      toast.error("Couldn't export the library", { description: describeApiError(err) });
    } finally {
      setTask(null);
    }
  };

  const onPickArchive = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be picked again
    if (!file || task) return;
    void onImport(file);
  };

  const onImport = async (file: File) => {
    setTask({ kind: "import", progress: null });
    try {
      const r = await importLibrary(file, { onProgress: (progress) => setTask({ kind: "import", progress }) });
      const notes: string[] = [];
      if (r.skipped > 0) notes.push(`${r.skipped} already here`);
      if (r.missingMedia > 0) notes.push(`${r.missingMedia} without their file`);
      toast.success(`Imported ${pluralize(r.imported, "item")}${notes.length ? ` (${notes.join(", ")})` : ""}`);
      await load();
    } catch (err) {
      toast.error("Couldn't import the archive", { description: describeApiError(err) });
    } finally {
      setTask(null);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteLibrary();
      toast.success("Library deleted");
      setConfirmDelete(false);
      await load();
    } catch (err) {
      toast.error("Couldn't delete the library", { description: describeApiError(err) });
    } finally {
      setDeleting(false);
    }
  };

  const busy = task !== null;
  const persisted = Boolean(estimate?.persisted);
  const usagePct = estimate ? percent(estimate.usage, estimate.quota) : 0;
  const taskPct = task?.progress ? percent(task.progress.done, task.progress.total) : 0;

  return (
    <SettingsCard icon={<HardDrive />} title="Library" description="Generations and reference images, kept in this browser.">
      <div className="flex flex-col gap-4">
        {/* Usage against what the browser allows this site; nothing to show without the Storage API. */}
        {!ready ? (
          <Skeleton className="h-9 w-full" />
        ) : estimate ? (
          <div>
            <p className="text-body text-fg tabular-nums">
              Using {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)} the browser allows
            </p>
            <div className="mt-2">
              <Bar pct={usagePct} label="Storage used" danger={usagePct >= 90} />
            </div>
          </div>
        ) : null}

        <div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={ImageIcon} label="Images" stats={stats?.image} />
            <StatTile icon={Clapperboard} label="Videos" stats={stats?.video} />
          </div>
          {stats ? (
            <p className="mt-2 text-meta tabular-nums">
              {pluralize(stats.uploads.count, "reference image")} · {formatBytes(stats.uploads.bytes)}
            </p>
          ) : null}
          {statsError ? (
            <p className="mt-2 text-meta text-danger" role="alert">
              Couldn&apos;t count the library: {statsError}
            </p>
          ) : null}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-body text-fg">
              Protected from eviction
              {ready ? <Badge variant={persisted ? "new" : "neutral"}>{persisted ? "Yes" : "Not yet"}</Badge> : <Skeleton className="h-4 w-10" />}
            </div>
            {ready && estimate && !persisted ? (
              <Button size="sm" variant="secondary" leftIcon={<ShieldCheck />} loading={protecting} onClick={() => void onProtect()}>
                Protect
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-meta">
            {persisted
              ? "The browser keeps this library when it frees space for other sites."
              : "Without protection the browser may evict this library when it runs low on space."}
          </p>
          {safari ? (
            <p className="mt-1.5 text-meta">Safari clears site data after 7 days without a visit unless the app is added to the Home Screen or Dock.</p>
          ) : null}
        </div>

        <div className="border-t border-border pt-4">
          <FieldLabel>Backup</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" leftIcon={<Download />} loading={task?.kind === "export"} disabled={busy} onClick={() => void onExport()}>
              Export library…
            </Button>
            <Button variant="secondary" leftIcon={<Upload />} loading={task?.kind === "import"} disabled={busy} onClick={() => fileInput.current?.click()}>
              Import…
            </Button>
            <input ref={fileInput} type="file" accept=".zip,application/zip" hidden onChange={onPickArchive} />
          </div>
          {task ? (
            <div className="mt-3" role="status" aria-live="polite">
              <p className="text-meta tabular-nums">{taskLabel(task)}</p>
              <div className="mt-1.5">
                <Bar pct={taskPct} label={task.kind === "export" ? "Export progress" : "Import progress"} />
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-meta">A zip with every generation, its file and the reference images. Importing skips records already here.</p>
        </div>

        <div className="border-t border-border pt-4">
          <Button variant="danger" leftIcon={<Trash2 />} disabled={busy} onClick={() => setConfirmDelete(true)}>
            Delete everything
          </Button>
          <p className="mt-3 text-meta">
            Everything lives in this browser. Clearing site data or using another profile means an empty library: export regularly.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !deleting && setConfirmDelete(o)}
        title="Delete the whole library?"
        description="Deletes every generation and file in this browser. Export first if you want to keep them."
        confirmLabel="Delete everything"
        danger
        loading={deleting}
        onConfirm={onDelete}
      />
    </SettingsCard>
  );
}
