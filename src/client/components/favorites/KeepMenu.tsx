import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Folder as FolderIcon, FolderPlus, Heart, HeartOff } from "lucide-react";
import type { Generation } from "@shared/types";
import type { GenerationActions } from "@/lib/actions";
import { useFolderList, useFolders } from "@/store/folders";
import { Popover, PopoverContent, PopoverItem, PopoverTrigger } from "@/components/ui/Popover";
import { FolderNameForm } from "./FolderNameForm";

export interface KeepMenuProps {
  generation: Generation;
  actions: GenerationActions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger (the heart), rendered `asChild`. */
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

const ROW_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

/**
 * The heart's menu: where the record is kept (All, or one folder) with the other folders to move it to,
 * a new folder, and Remove. Opening it on a record that is not kept keeps it first, in the last destination
 * picked, so one click on the heart is enough; the menu then shows where it went and lets you change that.
 */
export function KeepMenu({ generation: g, actions, open, onOpenChange, children, side = "bottom", align = "end" }: KeepMenuProps) {
  const folders = useFolderList();
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // A folder id the store no longer knows (deleted elsewhere) reads as All.
  const current = g.favorite ? (g.folder && folders.some((f) => f.id === g.folder) ? g.folder : null) : undefined;
  const currentName = current ? folders.find((f) => f.id === current)?.name : undefined;

  const handleOpenChange = (next: boolean) => {
    if (next && !g.favorite) void actions.keepDefault();
    if (!next) setCreating(false);
    onOpenChange(next);
  };
  const pick = (folder: string | null) => {
    setCreating(false);
    onOpenChange(false);
    void actions.keep(folder);
  };
  const remove = () => {
    onOpenChange(false);
    void actions.unkeep();
  };
  const create = async (name: string) => {
    const folder = await useFolders.getState().create(name);
    pick(folder.id);
  };

  /** ↑ ↓ Home End move between the rows (Tab leaves the list for New folder / Remove). */
  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!ROW_KEYS.has(e.key)) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? []);
    if (rows.length === 0) return;
    const i = rows.findIndex((r) => r === document.activeElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : e.key === "ArrowDown" ? (i + 1) % rows.length : (i - 1 + rows.length) % rows.length;
    e.preventDefault();
    e.stopPropagation();
    rows[next]?.focus();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-[248px]"
        // Land on the current row, so Enter confirms it and ↓ moves on from there.
        onOpenAutoFocus={(e) => {
          const list = listRef.current;
          const row = list?.querySelector<HTMLButtonElement>("[aria-selected=true]") ?? list?.querySelector<HTMLButtonElement>("[role=option]");
          if (!row) return;
          e.preventDefault();
          row.focus();
        }}
      >
        <div className="px-2 pb-1 pt-1.5 text-meta">
          {g.favorite ? (
            <>
              Kept in <span className="font-medium text-fg">{currentName ?? "Favorites"}</span>
            </>
          ) : (
            "Keep in"
          )}
        </div>

        {creating ? (
          <FolderNameForm layout="stack" size="sm" submitLabel="Create" onSubmit={create} onCancel={() => setCreating(false)} autoFocus className="p-1" />
        ) : (
          <>
            <div ref={listRef} role="listbox" aria-label="Keep in" onKeyDown={onListKeyDown} className="max-h-[264px] overflow-y-auto">
              <PopoverItem selected={current === null} onClick={() => pick(null)}>
                <Heart size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">All</span>
                {current === null ? <Check size={14} className="shrink-0 text-accent" aria-hidden="true" /> : null}
              </PopoverItem>
              {folders.map((f) => (
                <PopoverItem key={f.id} selected={current === f.id} onClick={() => pick(f.id)}>
                  <FolderIcon size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  {current === f.id ? <Check size={14} className="shrink-0 text-accent" aria-hidden="true" /> : null}
                </PopoverItem>
              ))}
            </div>
            <div className="mt-1 border-t border-border pt-1">
              <PopoverItem role={undefined} onClick={() => setCreating(true)}>
                <FolderPlus size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">New folder…</span>
              </PopoverItem>
              {g.favorite ? (
                <PopoverItem role={undefined} onClick={remove} className="text-fg-muted hover:text-danger focus-visible:text-danger">
                  <HeartOff size={14} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">Remove from Favorites</span>
                </PopoverItem>
              ) : null}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
