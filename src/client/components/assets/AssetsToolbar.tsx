import { useState, type RefObject } from "react";
import { Check, Clapperboard, Image as ImageIcon, LayoutGrid, ListFilter, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Kbd } from "@/components/ui/Kbd";
import { Popover, PopoverContent, PopoverItem, PopoverTrigger } from "@/components/ui/Popover";
import {
  STATUS_FILTERS,
  STATUS_LABEL,
  TYPE_FILTERS,
  TYPE_LABEL,
  type StatusFilter,
  type TypeFilter,
} from "./filters";

const TYPE_ICON = { all: LayoutGrid, image: ImageIcon, video: Clapperboard } as const;

export interface AssetsToolbarProps {
  type: TypeFilter;
  onTypeChange: (type: TypeFilter) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  className?: string;
}

/** Filter row: type chips · status dropdown · search. */
export function AssetsToolbar({
  type,
  onTypeChange,
  status,
  onStatusChange,
  query,
  onQueryChange,
  searchRef,
  className,
}: AssetsToolbarProps) {
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div role="group" aria-label="Type" className="flex items-center gap-1.5">
        {TYPE_FILTERS.map((t) => {
          const Icon = TYPE_ICON[t];
          const active = t === type;
          return (
            <Chip
              key={t}
              icon={<Icon />}
              label={TYPE_LABEL[t]}
              active={active}
              aria-pressed={active}
              onClick={() => onTypeChange(t)}
              className={cn(active ? "text-fg" : "text-fg-muted")}
            />
          );
        })}
      </div>

      <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <Chip
            icon={<ListFilter />}
            label={STATUS_LABEL[status]}
            chevron
            active={status !== "any"}
            aria-label={`Status filter: ${STATUS_LABEL[status]}`}
            className={cn(status === "any" ? "text-fg-muted" : "text-fg")}
          />
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-[200px]">
          <div role="listbox" aria-label="Status">
            {STATUS_FILTERS.map((s) => (
              <PopoverItem
                key={s}
                selected={s === status}
                onClick={() => {
                  onStatusChange(s);
                  setStatusOpen(false);
                }}
              >
                <span className="flex-1">{STATUS_LABEL[s]}</span>
                {s === status ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
              </PopoverItem>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Input
        ref={searchRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        role="searchbox"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (query) onQueryChange("");
            else e.currentTarget.blur();
          }
        }}
        placeholder="Search prompts and models"
        aria-label="Search assets"
        autoComplete="off"
        spellCheck={false}
        leftIcon={<Search />}
        rightSlot={
          query ? (
            <IconButton label="Clear search" size="sm" onClick={() => onQueryChange("")} tooltip={false}>
              <X />
            </IconButton>
          ) : (
            <Kbd aria-hidden="true" className="mr-1">
              /
            </Kbd>
          )
        }
        className="w-full sm:ml-auto sm:w-[260px] [&_input]:h-9 [&_input]:rounded-control"
      />
    </div>
  );
}
