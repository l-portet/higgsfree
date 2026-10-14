import { memo, useEffect, useState, type DragEvent } from "react";
import { Folder as FolderIcon, Pencil, Trash2 } from "lucide-react";
import type { Folder, FolderSummary, Generation } from "@shared/types";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { useMediaUrl } from "@/lib/media-urls";
import { IconButton } from "@/components/ui/IconButton";
import { dragHasGeneration, droppedGenerationId } from "./dnd";

export interface FolderTileProps {
  folder: Folder;
  summary: FolderSummary | undefined;
  /** A kept card is being dragged somewhere on the page: show that this tile takes it. */
  dropHint?: boolean;
  onOpen: (folder: Folder) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  /** A card landed on the tile. */
  onDrop: (folder: Folder, generationId: string) => void;
}

/** One cell of the cover; a quiet box until the object url is there (or when the file is gone). */
function CoverCell({ g }: { g: Generation }) {
  const src = useMediaUrl(g.output?.id);
  if (!src) return <div className="size-full bg-surface-3" />;
  if (g.type === "video") return <video src={src} muted playsInline preload="metadata" className="size-full object-cover" />;
  return <img src={src} alt="" className="size-full object-cover" draggable={false} />;
}

/** The newest one, two, three or four records: a single cover, a split, one big and two small, or a 2 × 2. */
const CELLS: Record<number, string[]> = {
  1: ["col-span-2 row-span-2"],
  2: ["row-span-2", "row-span-2"],
  3: ["row-span-2", "", ""],
  4: ["", "", "", ""],
};

/**
 * A folder on the Favorites grid: a square tile with a cover made of its newest records, its name and count,
 * Rename / Delete on hover, and a drop target for the cards (the ring lights up while one is over it).
 */
export const FolderTile = memo(function FolderTile({ folder, summary, dropHint, onOpen, onRename, onDelete, onDrop }: FolderTileProps) {
  // dragenter / dragleave fire for every child too; the depth says whether the pointer is still over the tile.
  const [depth, setDepth] = useState(0);
  const over = depth > 0;
  const count = summary?.count ?? 0;
  const newest = (summary?.newest ?? []).slice(0, 4);
  const cells = CELLS[newest.length] ?? [];
  const countLabel = count === 0 ? "Empty" : pluralize(count, "item");

  // A cancelled drag (Esc) may end without a leave.
  useEffect(() => {
    if (!dropHint) setDepth(0);
  }, [dropHint]);

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!dragHasGeneration(e.dataTransfer)) return;
    e.preventDefault();
    setDepth((n) => n + 1);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragHasGeneration(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!dragHasGeneration(e.dataTransfer)) return;
    setDepth((n) => Math.max(0, n - 1));
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    const id = droppedGenerationId(e.dataTransfer);
    setDepth(0);
    if (!id) return;
    e.preventDefault();
    onDrop(folder, id);
  };

  return (
    <div
      className={cn(
        "group relative min-w-0 self-start overflow-hidden rounded-card border bg-surface-2",
        "transition-[border-color,box-shadow,transform] duration-150",
        over
          ? "scale-[1.02] border-accent ring-2 ring-accent/50"
          : dropHint
            ? "border-dashed border-accent/50"
            : "border-border hover:border-border-strong",
      )}
      data-drop-target={over || undefined}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
    >
      <div aria-hidden="true" className="w-full" style={{ aspectRatio: "1 / 1" }} />

      <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5" aria-hidden="true">
        {newest.length > 0 ? (
          newest.map((g, i) => (
            <div key={g.id} className={cn("overflow-hidden", cells[i])}>
              <CoverCell g={g} />
            </div>
          ))
        ) : (
          <div className="col-span-2 row-span-2 flex items-center justify-center text-fg-faint">
            <FolderIcon size={40} strokeWidth={1.25} />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onOpen(folder)}
        aria-label={`Open folder ${folder.name} (${countLabel.toLowerCase()})`}
        className="absolute inset-0 size-full rounded-card"
      />

      {/* Name and count over a bottom gradient, always there: a folder is named, not previewed. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-2.5 pt-8">
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-5 text-white">
          <FolderIcon size={14} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{folder.name}</span>
        </div>
        <div className="text-[11px] leading-4 text-white/70 tabular-nums">{countLabel}</div>
      </div>

      <div
        className={cn(
          "absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
        )}
      >
        <IconButton label="Rename folder" size="sm" variant="overlay" onClick={() => onRename(folder)}>
          <Pencil />
        </IconButton>
        <IconButton label="Delete folder" size="sm" variant="overlay" onClick={() => onDelete(folder)}>
          <Trash2 />
        </IconButton>
      </div>
    </div>
  );
});
