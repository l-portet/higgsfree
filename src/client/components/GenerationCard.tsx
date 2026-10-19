import { memo, useRef, useState, type DragEvent, type FocusEvent, type ReactNode } from "react";
import { CircleAlert, Download, Heart, RefreshCw, RotateCcw, Trash2, Volume2, WandSparkles } from "lucide-react";
import type { Generation } from "@shared/types";
import { cn } from "@/lib/cn";
import { downloadFilename } from "@/lib/files";
import { formatDims, formatElapsed, formatSeconds, formatUsd } from "@/lib/format";
import { useGenerationActions } from "@/lib/actions";
import { useElapsed, useMediaQuery, useNearViewport } from "@/lib/hooks";
import { cardAspect } from "@/lib/masonry";
import { useMediaUrl } from "@/lib/media-urls";
import { isImageParams } from "@/lib/models";
import { useFolderName } from "@/store/folders";
import { isPending } from "@/store/generations";
import { OverlayBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { iconButtonClasses } from "@/components/ui/iconButtonClasses";
import { Spinner } from "@/components/ui/Spinner";
import { Tooltip } from "@/components/ui/Tooltip";
import { endGenerationDrag, startGenerationDrag } from "@/components/favorites/dnd";
import { KeepMenu } from "@/components/favorites/KeepMenu";

/** Short params label: "2K · 1024×1536" for images, "5s · 1080p" for videos. */
function paramsLabel(g: Generation): string {
  if (isImageParams(g.params)) {
    const dims = formatDims(g.output?.width, g.output?.height);
    return [g.params.size, dims].filter(Boolean).join(" · ");
  }
  const p = g.params;
  const seconds = g.output?.durationSec ?? p.duration;
  // Motion control and video editing: the length follows the input video and is known only once the clip is back.
  return [seconds > 0 ? formatSeconds(seconds) : undefined, p.resolution].filter(Boolean).join(" · ");
}

export interface GenerationCardProps {
  generation: Generation;
  onOpen?: (g: Generation) => void;
  onReuse?: (g: Generation) => void;
  /** Show an Image/Video badge (for mixed lists). */
  showType?: boolean;
  /** Can be dragged onto a Favorites folder (the drag carries the record id). */
  draggable?: boolean;
  /**
   * A fixed cell (CSS aspect ratio, e.g. "16 / 9"; the feeds): the card keeps that shape in every state,
   * media cover it, and a failed run's text is clamped to what fits. Without it the card takes its
   * output's ratio and a failed card grows with its text (the masonry grids).
   */
  cell?: string;
  className?: string;
}

/**
 * Grid card. The outer element is `min-w-0` so it can never widen its grid track; the aspect ratio
 * lives on an inner sizer (never combined with `min-height`, which would transfer to a min-width).
 * Failed cards have no aspect ratio; they grow with the error text from a `min-h`.
 *
 * The output's object url resolves in an effect (`useMediaUrl`), so a completed card paints a quiet
 * `bg-surface-2` box until it is there; the Download link appears with it.
 * Media loads only once the card is near the viewport (one shared observer), and the hover action
 * row with its tooltips is mounted only while the card is hovered or focused; on coarse pointers it
 * is always there, matching the always-visible overlay. The heart opens the keep menu (where it is
 * kept, which folder); the overlay stays up while that menu is open.
 */
export const GenerationCard = memo(function GenerationCard({ generation: g, onOpen, onReuse, showType, draggable, cell, className }: GenerationCardProps) {
  const pending = isPending(g);
  const elapsed = useElapsed(g.createdAt, pending, g.completedAt);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const near = useNearViewport(cardRef);
  const coarse = useMediaQuery("(pointer: coarse)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [active, setActive] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const folderName = useFolderName(g.folder);
  const actions = useGenerationActions(g, onReuse);
  const out = g.output;
  // Hooks run on every render; `undefined` until the object url resolves (or when the file is gone).
  const src = useMediaUrl(out?.id);
  const isVideo = g.type === "video";
  const failed = !pending && (g.status === "failed" || !out);
  // Stay mounted while the delete dialog or the keep menu is up so focus has a button to return to on close.
  const showActions = active || coarse || actions.confirmDelete || keepOpen;

  const play = () => {
    const v = videoRef.current;
    if (!v || reduceMotion) return;
    v.play().catch(() => {});
  };
  const pause = () => videoRef.current?.pause();

  const onPointerEnter = () => {
    setActive(true);
    if (isVideo) play();
  };
  const onPointerLeave = () => {
    setActive(false);
    if (isVideo) pause();
  };
  const onFocus = () => setActive(true);
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(false);
  };
  const onConfirmOpenChange = (open: boolean) => {
    actions.setConfirmDelete(open);
    // Keep the row until the next pointer leave / blur so the dialog can hand focus back to Delete.
    if (!open) setActive(true);
  };
  const onKeepOpenChange = (open: boolean) => {
    setKeepOpen(open);
    if (!open) setActive(true);
  };
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    startGenerationDrag(e.dataTransfer, g.id);
    setDragging(true);
  };
  const onDragEnd = () => {
    endGenerationDrag();
    setDragging(false);
  };

  let body: ReactNode;

  if (pending) {
    body = (
      <>
        <div className="skeleton absolute inset-0" />
        <div className={cn("absolute inset-0 flex flex-col items-center justify-center text-center", cell ? "gap-1 p-2" : "gap-1.5 p-4")}>
          <Spinner size={18} className="mb-1 text-fg-muted" />
          <span className="max-w-full truncate text-meta font-medium text-fg">{g.modelName}</span>
          <span className="text-meta tabular-nums" aria-live="off">
            {isVideo ? "Rendering · " : ""}
            {formatElapsed(elapsed)}
          </span>
        </div>
        <div className="absolute right-2 top-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
          <IconButton label="Delete" size="sm" variant="overlay" onClick={() => actions.setConfirmDelete(true)}>
            <Trash2 />
          </IconButton>
        </div>
      </>
    );
  } else if (failed) {
    // In a fixed cell the text has to fit the box, so the `cell-*` variants (globals.css) reveal more of it as the
    // cell gets taller; elsewhere the card grows with it. The full text is in the lightbox (Details) and the tooltips.
    body = (
      <div className={cn("flex min-w-0 flex-col p-3", cell ? "absolute inset-0 gap-1.5 overflow-hidden" : "min-h-[168px] gap-2")}>
        <div className="flex items-center gap-1.5 text-meta font-medium text-danger" title={cell ? g.error : undefined}>
          <CircleAlert size={14} className="shrink-0" aria-hidden="true" />
          Generation failed
        </div>
        {/* Masonry: two lines on phones, four from `sm:`. A fixed cell: as many as its height holds. */}
        <p
          className={cn(
            "break-words text-meta",
            cell ? "hidden cell-h-sm:line-clamp-1 cell-h-md:line-clamp-2 cell-h-xl:line-clamp-3" : "line-clamp-2 sm:line-clamp-4",
          )}
          title={g.error}
        >
          {g.error ?? "Unknown error"}
        </p>
        <p className={cn("break-words text-caption", cell ? "hidden cell-h-lg:line-clamp-1 cell-h-xl:line-clamp-2" : "line-clamp-2")} title={g.prompt}>
          {g.prompt}
        </p>
        <div className={cn("mt-auto flex items-center gap-1.5 pt-1", cell ? "flex-nowrap" : "flex-wrap")}>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<RefreshCw />}
            loading={actions.retrying}
            onClick={() => void actions.retry()}
            aria-label={cell ? "Retry" : undefined}
          >
            {cell ? <span className="hidden cell-w-md:inline">Retry</span> : "Retry"}
          </Button>
          <IconButton label="Delete" size="sm" variant="danger" onClick={() => actions.setConfirmDelete(true)}>
            <Trash2 />
          </IconButton>
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(g)}
              className="ml-auto text-caption transition-colors hover:text-fg"
            >
              Details
            </button>
          ) : null}
        </div>
      </div>
    );
  } else if (out) {
    const filename = downloadFilename(g.id, out.mime);
    // One truncating info badge instead of a wrapping row of tags (the lightbox has the full details).
    const info = [g.modelName, paramsLabel(g), g.costUsd !== undefined ? formatUsd(g.costUsd) : ""].filter(Boolean).join(" · ");
    const audio = isVideo && !isImageParams(g.params) && g.params.audio;
    body = (
      <>
        {isVideo ? (
          // `src` waits for the viewport and the object url; `metadata` then paints the first frame as the poster.
          <video
            ref={videoRef}
            src={near && src ? src : undefined}
            muted
            loop
            playsInline
            preload={near ? "metadata" : "none"}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          // Hidden until the url is there so browsers don't paint the alt text in the box meanwhile.
          <img
            src={src}
            alt={g.prompt}
            width={out.width}
            height={out.height}
            loading="lazy"
            decoding="async"
            className={cn("absolute inset-0 size-full object-cover", !src && "invisible")}
            draggable={false}
          />
        )}

        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(g)}
            aria-label={`Open ${isVideo ? "video" : "image"}: ${g.prompt.slice(0, 80)}`}
            className="absolute inset-0 size-full cursor-zoom-in rounded-card"
          />
        ) : null}

        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex flex-col justify-between opacity-0 transition-opacity duration-150",
            "group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
            keepOpen && "opacity-100",
          )}
        >
          <div className="flex items-start gap-1 bg-gradient-to-b from-black/60 to-transparent p-2 pb-6">
            {showType ? <OverlayBadge className="mr-auto">{isVideo ? "Video" : "Image"}</OverlayBadge> : null}
            {showActions ? (
              <div className="pointer-events-auto ml-auto flex items-center gap-1">
                <KeepMenu generation={g} actions={actions} open={keepOpen} onOpenChange={onKeepOpenChange}>
                  <IconButton
                    label={g.favorite ? (folderName ? `Kept in ${folderName}` : "Kept in Favorites") : "Keep in Favorites"}
                    size="sm"
                    variant="overlay"
                    aria-pressed={Boolean(g.favorite)}
                    disabled={actions.keeping}
                    className={cn(g.favorite && "text-accent")}
                  >
                    <Heart fill={g.favorite ? "currentColor" : "none"} />
                  </IconButton>
                </KeepMenu>
                {src ? (
                  // Object urls are same-origin, so `download` is honoured.
                  <Tooltip content="Download">
                    <a
                      href={src}
                      download={filename}
                      aria-label="Download"
                      className={iconButtonClasses("overlay", "sm")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download aria-hidden="true" />
                    </a>
                  </Tooltip>
                ) : null}
                <IconButton label={isVideo ? "Edit video" : "Animate"} size="sm" variant="overlay" onClick={isVideo ? actions.editVideo : actions.animate}>
                  <WandSparkles />
                </IconButton>
                <IconButton label="Reuse prompt" size="sm" variant="overlay" onClick={actions.reuse}>
                  <RotateCcw />
                </IconButton>
                <IconButton label="Delete" size="sm" variant="overlay" onClick={() => actions.setConfirmDelete(true)}>
                  <Trash2 />
                </IconButton>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
            <OverlayBadge className="min-w-0 max-w-[calc(100%-16px)] tabular-nums">
              <span className="truncate">{info}</span>
            </OverlayBadge>
            {g.favorite ? (
              // The heart, with the folder's name when it is filed in one.
              <OverlayBadge className="min-w-0 max-w-[50%] shrink-0 gap-1 text-accent">
                <Heart size={12} fill="currentColor" aria-hidden="true" className="shrink-0" />
                {folderName ? (
                  <span className="truncate" aria-hidden="true">
                    {folderName}
                  </span>
                ) : null}
                <span className="sr-only">{folderName ? `Kept in ${folderName}` : "Kept"}</span>
              </OverlayBadge>
            ) : null}
            {audio ? (
              <OverlayBadge className="shrink-0">
                <Volume2 size={12} aria-hidden="true" />
                <span className="sr-only">With audio</span>
              </OverlayBadge>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        // `self-start`: an element with `aspect-ratio` never stretched to the grid row; keep that now the ratio is on the sizer.
        // Completed cards are edge-to-edge media with no border; pending and failed cards keep one.
        "group relative min-w-0 self-start overflow-hidden rounded-card bg-surface transition-[border-color] duration-150",
        // A fixed cell is a size container (its ratio sets the height), queried by the failed body.
        cell && "[container:cell/size]",
        pending && "border border-border",
        pending && !cell && "min-h-[168px]",
        failed && "border border-danger/25 hover:border-danger/40",
        // Completed: the media box shows a quiet placeholder until the object url resolves.
        !pending && !failed && "bg-surface-2",
        dragging && "opacity-50",
        className,
      )}
      data-status={g.status}
      style={cell ? { aspectRatio: cell } : undefined}
      draggable={draggable || undefined}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {!failed && !cell ? <div aria-hidden="true" className="w-full" style={{ aspectRatio: cardAspect(g) }} /> : null}
      {body}
      <ConfirmDialog
        open={actions.confirmDelete}
        onOpenChange={onConfirmOpenChange}
        title={`Delete this ${isVideo ? "video" : "image"}?`}
        description="Removes the record and its file from this browser. This can't be undone."
        confirmLabel="Delete"
        danger
        loading={actions.deleting}
        onConfirm={actions.remove}
      />
    </div>
  );
});

/** Placeholder card for initial loading. */
export function GenerationCardSkeleton({ aspect = "3 / 4" }: { aspect?: string }) {
  return <div className="skeleton min-w-0 rounded-card" style={{ aspectRatio: aspect }} aria-hidden="true" />;
}
