import { memo, type MouseEvent } from "react";
import { Check } from "lucide-react";
import type { Generation } from "@shared/types";
import { cn } from "@/lib/cn";
import { GenerationCard } from "@/components/GenerationCard";

export interface SelectableCardProps {
  generation: Generation;
  selected: boolean;
  /** `shiftKey` lets the page extend a range from the last toggled card. */
  onToggle: (g: Generation, shiftKey: boolean) => void;
  showType?: boolean;
}

/**
 * Selection-mode wrapper: the card underneath is made `inert` (out of the tab order, no pointer
 * events, hidden from AT) and a full-size checkbox button captures clicks, so nothing opens the
 * lightbox or triggers card actions while selecting.
 */
export const SelectableCard = memo(function SelectableCard({ generation: g, selected, onToggle, showType }: SelectableCardProps) {
  const kind = g.type === "image" ? "image" : "video";
  const onClick = (e: MouseEvent<HTMLButtonElement>) => onToggle(g, e.shiftKey);

  return (
    <div
      className={cn(
        "relative min-w-0 self-start rounded-lg transition-shadow duration-150",
        selected && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
      )}
      data-selected={selected || undefined}
    >
      <div inert>
        <GenerationCard generation={g} showType={showType} className="w-full" />
      </div>
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${kind}: ${g.prompt.slice(0, 80) || g.modelName}`}
        onClick={onClick}
        className={cn(
          "absolute inset-0 z-10 flex items-start justify-start rounded-lg p-2 text-left outline-none",
          "transition-colors duration-150",
          selected ? "bg-black/30" : "bg-black/0 hover:bg-black/20",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full border-2 shadow-[0_1px_4px_rgba(0,0,0,0.5)]",
            "transition-[background-color,border-color,transform] duration-150",
            selected
              ? "scale-100 border-accent bg-accent text-on-accent"
              : "border-white/80 bg-black/45 text-transparent backdrop-blur-sm",
          )}
        >
          <Check size={14} strokeWidth={3} />
        </span>
      </button>
    </div>
  );
});
