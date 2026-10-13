import { useId } from "react";
import { CheckCheck, Download, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Kbd } from "@/components/ui/Kbd";
import { Tooltip } from "@/components/ui/Tooltip";

export interface SelectionBarProps {
  /** Selected count. */
  count: number;
  /** Number of loaded (visible) items. */
  total: number;
  /** Selected items that have a downloadable file. */
  downloadable: number;
  downloading: boolean;
  deleting: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onExit: () => void;
  className?: string;
}

/** Floating action bar shown while selection mode is active (same footprint as the prompt bar). */
export function SelectionBar({
  count,
  total,
  downloadable,
  downloading,
  deleting,
  onSelectAll,
  onClear,
  onDownload,
  onDelete,
  onExit,
  className,
}: SelectionBarProps) {
  const allSelected = total > 0 && count >= total;
  const busy = downloading || deleting;
  const downloadHintId = useId();
  const downloadReason =
    count === 0
      ? "Nothing selected"
      : downloadable === 0
        ? "Only completed items can be downloaded"
        : downloadable < count
          ? `${count - downloadable} selected items have no file yet`
          : null;
  const downloadBlocked = downloadable === 0;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4",
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label="Selection actions"
        className={cn(
          "pointer-events-auto flex w-full max-w-[960px] flex-wrap items-center gap-2 rounded-2xl border border-border-strong",
          "bg-surface/90 px-3 py-2.5 shadow-bar backdrop-blur-xl animate-slide-up",
        )}
      >
        <span className="min-w-[88px] text-body font-medium tabular-nums text-fg" aria-live="polite">
          {count} selected
        </span>

        <Button
          size="sm"
          variant="ghost"
          leftIcon={<CheckCheck />}
          onClick={allSelected ? onClear : onSelectAll}
          disabled={busy || total === 0}
          aria-pressed={allSelected}
        >
          {allSelected ? "Clear" : "Select all"}
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          {/* `aria-disabled` (not `disabled`) keeps the button focusable so keyboard / AT users get the reason. */}
          <Tooltip content={downloadReason} side="top">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Download />}
              loading={downloading}
              disabled={busy}
              aria-disabled={downloadBlocked || undefined}
              aria-describedby={downloadReason ? downloadHintId : undefined}
              onClick={downloadBlocked ? undefined : onDownload}
            >
              Download{downloadable ? ` ${downloadable}` : ""}
            </Button>
          </Tooltip>
          {downloadReason ? (
            <span id={downloadHintId} className="sr-only">
              {downloadReason}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="danger"
            leftIcon={<Trash2 />}
            loading={deleting}
            disabled={busy || count === 0}
            onClick={onDelete}
          >
            Delete{count ? ` ${count}` : ""}
          </Button>
          <Tooltip
            content={
              <span className="inline-flex items-center gap-1.5">
                Done <Kbd>Esc</Kbd>
              </span>
            }
            side="top"
          >
            <IconButton label="Done" size="md" onClick={onExit} disabled={busy} tooltip={false}>
              <X />
            </IconButton>
          </Tooltip>
        </div>
        <span className="sr-only">{pluralize(total, "item")} loaded</span>
      </div>
    </div>
  );
}
