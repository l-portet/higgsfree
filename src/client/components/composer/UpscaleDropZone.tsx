import { ImageUpscale, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMediaUrl } from "@/lib/media-urls";

export interface UpscaleSource {
  mediaId: string;
  name: string;
  /** One line under the name: the size in and out ("1024 × 1536 → 4096 × 6144"), the length. */
  meta?: string;
}

/**
 * Where the prompt goes when an upscaler is picked: it takes no prompt, only the image or video to upscale. Empty, the
 * whole box picks a file (a drop anywhere on the bar works too); filled, it shows the input with Replace and Remove.
 */
export function UpscaleDropZone({
  kind,
  source,
  dragging,
  onPick,
  onRemove,
}: {
  kind: "image" | "video";
  source: UpscaleSource | null;
  dragging?: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  const src = useMediaUrl(source?.mediaId);
  const noun = kind === "video" ? "video" : "image";

  if (!source) {
    return (
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "flex min-h-[56px] w-full items-center gap-3 rounded-control border border-dashed px-3 py-2 text-left",
          "transition-colors duration-150 hover:border-fg-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          dragging ? "border-accent bg-accent/5" : "border-border-strong",
        )}
      >
        <ImageUpscale size={18} strokeWidth={1.5} className={cn("shrink-0", dragging ? "text-accent" : "text-fg-subtle")} aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[15px] leading-6 text-fg-muted">{dragging ? `Drop to upscale this ${noun}` : `Drop ${kind === "video" ? "a video" : "an image"} to upscale`}</span>
          <span className="block text-caption">{kind === "video" ? "Or click to choose an MP4, MOV or WebM" : "Or click to choose, or paste one. PNG, JPEG or WebP"}</span>
        </span>
      </button>
    );
  }

  return (
    <div className={cn("flex min-h-[56px] w-full items-center gap-3 rounded-control border px-2 py-2 transition-colors duration-150", dragging ? "border-accent bg-accent/5" : "border-border")}>
      <div className={cn("shrink-0 overflow-hidden rounded-thumb border border-border-strong bg-surface-2", kind === "video" ? "h-10 w-[71px]" : "size-10")}>
        {src ? (
          kind === "video" ? (
            // `#t=0.1` makes Safari paint a frame without playing.
            <video src={`${src}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" className="size-full object-cover" />
          ) : (
            <img src={src} alt="" className="size-full object-cover" draggable={false} />
          )
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-fg">{source.name}</p>
        {source.meta ? <p className="truncate text-caption tabular-nums">{source.meta}</p> : null}
      </div>
      <button
        type="button"
        onClick={onPick}
        className="shrink-0 rounded-button px-2 py-1 text-[13px] font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
      >
        Replace
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove the ${noun}`}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-button text-fg-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/** "1024 × 1536 → 4096 × 6144" for a scale, "1024 × 1536" without one (or "" when the size is not known). */
export function sizeChange(width: number | undefined, height: number | undefined, factor: number | undefined): string {
  if (!width || !height) return "";
  const from = `${width} × ${height}`;
  return factor ? `${from} → ${Math.round(width * factor)} × ${Math.round(height * factor)}` : from;
}
