import { useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { ImagePlus, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { dragHasFiles, imageFilesFromClipboard, imageFilesFromDataTransfer, pickImageFiles } from "@/lib/files";
import { formatDims } from "@/lib/format";
import { OverlayBadge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import type { Frame } from "@/lib/frames";

/** Drag / drop / paste plumbing shared by the slot variants. */
function useDropzone(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    onFiles(imageFilesFromDataTransfer(e.dataTransfer));
  };
  const onPaste = (e: ClipboardEvent<HTMLElement>) => {
    const files = imageFilesFromClipboard(e);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    onFiles(files);
  };
  return { dragging, handlers: { onDragOver, onDragEnter: onDragOver, onDragLeave, onDrop, onPaste } };
}

export interface FrameSlotProps {
  /** "First frame" / "Last frame", used for labels and accessible names. */
  label: string;
  /** Helper shown while the slot is empty. */
  hint?: string;
  frame: Frame | null;
  onFiles: (files: File[]) => void;
  onRemove: () => void;
  /** Extra overlay actions rendered next to the remove button (large variant). */
  actions?: ReactNode;
  variant?: "large" | "compact";
  className?: string;
}

/** Dropzone + thumbnail for one anchor frame. Drag, paste (when focused) or click to pick a file. */
export function FrameSlot({ label, hint, frame, onFiles, onRemove, actions, variant = "large", className }: FrameSlotProps) {
  const { dragging, handlers } = useDropzone(onFiles);
  const pick = async () => onFiles(await pickImageFiles({ multiple: false }));
  const dims = frame ? formatDims(frame.width, frame.height) : undefined;
  const lower = label.toLowerCase();

  if (variant === "compact") {
    return (
      <div
        {...handlers}
        className={cn(
          "relative flex items-center gap-2.5 rounded-md border p-1.5 pr-2 transition-colors duration-150",
          frame ? "border-border bg-surface-2" : "border-dashed border-border-strong bg-surface-2/50 hover:bg-surface-2",
          dragging && "border-accent bg-accent/5",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => void pick()}
          aria-label={frame ? `Replace ${lower}` : `Add ${lower}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[7px] text-left"
        >
          <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-border bg-surface-3 text-fg-faint">
            {frame ? (
              <img src={frame.src} alt="" className="size-full object-cover" draggable={false} />
            ) : (
              <Plus size={14} aria-hidden="true" />
            )}
            {frame?.uploading ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Spinner size={12} className="text-white" />
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium text-fg">{label}</span>
            <span className="block truncate text-caption">{frame ? (dims ?? frame.name) : hint}</span>
          </span>
        </button>
        {frame ? (
          <IconButton label={`Remove ${lower}`} size="sm" onClick={onRemove}>
            <X />
          </IconButton>
        ) : null}
      </div>
    );
  }

  return (
    <div {...handlers} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => void pick()}
        aria-label={frame ? `Replace ${lower}` : `Add ${lower}`}
        className={cn(
          "group/slot relative flex aspect-[16/9] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-md border px-3 text-center",
          // Stacked (below md) the panel is full width: cap the 16:9 zone so the canvas stays near.
          "max-h-[220px] md:max-h-none",
          "transition-colors duration-150",
          frame
            ? "border-border bg-surface-2 hover:border-border-strong"
            : "border-dashed border-border-strong bg-surface-2/50 hover:border-fg-faint hover:bg-surface-2",
          dragging && "border-accent bg-accent/5",
        )}
      >
        {frame ? (
          <>
            <img src={frame.src} alt={label} className="absolute inset-0 size-full object-cover" draggable={false} />
            <span
              className="absolute inset-0 bg-black/0 transition-colors duration-150 group-hover/slot:bg-black/20"
              aria-hidden="true"
            />
            {frame.uploading ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Spinner size={16} className="text-white" />
              </span>
            ) : null}
          </>
        ) : (
          <>
            <ImagePlus size={18} className={cn("mb-1 text-fg-faint transition-colors", dragging && "text-accent")} aria-hidden="true" />
            <span className="text-body font-medium text-fg">{dragging ? "Drop to add" : `Add ${lower}`}</span>
            {hint ? <span className="text-caption">{hint}</span> : null}
          </>
        )}
      </button>

      {frame ? (
        <>
          <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1">
            <OverlayBadge>{label}</OverlayBadge>
            {dims ? <OverlayBadge className="tabular-nums">{dims}</OverlayBadge> : null}
          </div>
          <div className="absolute right-2 top-2 flex items-center gap-1">
            {actions}
            <IconButton label={`Remove ${lower}`} size="sm" variant="overlay" onClick={onRemove}>
              <X />
            </IconButton>
          </div>
        </>
      ) : null}
    </div>
  );
}

export interface ReferenceStripProps {
  refs: Frame[];
  max: number;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
}

/** Up to `max` small style-reference thumbnails plus an add tile. */
export function ReferenceStrip({ refs, max, onFiles, onRemove }: ReferenceStripProps) {
  const { dragging, handlers } = useDropzone(onFiles);
  const full = refs.length >= max;
  return (
    <div
      {...handlers}
      className={cn("rounded-md border border-transparent p-0.5 transition-colors duration-150", dragging && "border-accent bg-accent/5")}
    >
      <ul className="flex flex-wrap items-center gap-2" aria-label="Style references">
        {refs.map((r, i) => (
          <li key={r.id} className="relative">
            <div className="size-12 overflow-hidden rounded-[8px] border border-border bg-surface-2">
              <img src={r.src} alt={`Reference ${i + 1}`} className="size-full object-cover" draggable={false} />
              {r.uploading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Spinner size={12} className="text-white" />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onRemove(r.id)}
              aria-label={`Remove reference ${i + 1}`}
              className="absolute -right-1.5 -top-1.5 inline-flex size-4 items-center justify-center rounded-full bg-fg text-bg shadow transition-transform duration-150 hover:scale-110"
            >
              <X size={10} strokeWidth={3} aria-hidden="true" />
            </button>
          </li>
        ))}
        {!full ? (
          <li>
            <button
              type="button"
              onClick={() => void pickImageFiles({ multiple: true }).then(onFiles)}
              aria-label="Add style reference"
              className={cn(
                "flex size-12 items-center justify-center rounded-[8px] border border-dashed border-border-strong bg-surface-2/50 text-fg-faint",
                "transition-colors duration-150 hover:border-fg-faint hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
