import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Search, Sparkles, Volume2 } from "lucide-react";
import type { ImageModel, VideoModel } from "@shared/types";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { durationRange, maxResolution, providerLabel } from "@/lib/models";
import { useModels } from "@/store/models";
import { Badge } from "@/components/ui/Badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import { ProviderTile } from "@/components/ProviderTile";

type CatalogModel = ImageModel | VideoModel;

interface CommonProps {
  value: string;
  /** The trigger element (rendered `asChild`). */
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Discriminated on `kind` so `onChange` / `disabledReason` receive the right model type without casts. */
export type ModelPickerProps =
  | (CommonProps & {
      kind: "image";
      onChange: (model: ImageModel) => void;
      /** Return a reason to dim a row (e.g. "doesn't support reference images"). */
      disabledReason?: (model: ImageModel) => string | null | undefined;
    })
  | (CommonProps & {
      kind: "video";
      onChange: (model: VideoModel) => void;
      disabledReason?: (model: VideoModel) => string | null | undefined;
    });

function matches(m: CatalogModel, terms: string[]): boolean {
  const hay = `${m.name} ${m.id} ${providerLabel(m.provider)} ${m.description}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

const UNAVAILABLE_REASON = "Not listed by OpenRouter right now";

function MiniChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded-[5px] border border-border bg-surface-3 px-1.5 text-[10.5px] font-medium tabular-nums text-fg-muted">
      {children}
    </span>
  );
}

interface RowProps {
  id: string;
  model: CatalogModel;
  selected: boolean;
  highlighted: boolean;
  disabledReason: string | null;
  unavailable: boolean;
  onHover: () => void;
  onSelect: () => void;
}

function ModelRow({ id, model, selected, highlighted, disabledReason, unavailable, onHover, onSelect }: RowProps) {
  const disabled = Boolean(disabledReason);
  const tooltip = disabledReason ?? (unavailable ? UNAVAILABLE_REASON : null);
  const badge = model.badges[0];
  const reasonId = `${id}-reason`;
  const row = (
    <button
      type="button"
      role="option"
      id={id}
      // Disabled rows stay reachable with Tab so keyboard users can read why they're dimmed.
      tabIndex={disabled ? 0 : -1}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      aria-describedby={disabled ? reasonId : undefined}
      data-highlighted={highlighted || undefined}
      onMouseMove={onHover}
      onFocus={disabled ? onHover : undefined}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-[8px] px-2 py-2 text-left transition-colors duration-100",
        "data-[highlighted]:bg-surface-3",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <ProviderTile provider={model.provider} size={40} className="rounded-[10px]" tooltip={!tooltip && !disabled} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-[13px] font-medium", unavailable ? "text-fg-muted" : "text-fg")}>
            {model.name}
          </span>
          {badge ? <Badge variant={badge} /> : null}
          {unavailable ? (
            <span className="size-1.5 shrink-0 rounded-full border border-fg-faint" aria-hidden="true" />
          ) : null}
        </div>
        {model.kind === "image" ? (
          <p className="truncate text-meta" title={model.description}>
            {model.description}
          </p>
        ) : (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-muted">
            {maxResolution(model) ? <MiniChip>{maxResolution(model)}</MiniChip> : null}
            <MiniChip>{durationRange(model)}</MiniChip>
            {model.caps.audio ? (
              <Volume2 size={12} className="ml-0.5 text-fg-muted" aria-label="Native audio" role="img" />
            ) : null}
            {model.discovered ? <span className="ml-0.5 text-fg-faint">Unverified</span> : null}
          </div>
        )}
      </div>
      {selected ? <Check size={16} className="shrink-0 text-accent" aria-hidden="true" /> : null}
    </button>
  );
  return (
    <>
      {tooltip ? (
        <Tooltip content={tooltip} side="right" align="center">
          {row}
        </Tooltip>
      ) : (
        row
      )}
      {disabled ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}

export function ModelPicker(props: ModelPickerProps) {
  const { kind, value, children, align = "start", side = "top", open: controlledOpen, onOpenChange } = props;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const imageModels = useModels((s) => s.image);
  const videoModels = useModels((s) => s.video);
  const models: CatalogModel[] = kind === "image" ? imageModels : videoModels;
  const live = useModels((s) => s.live);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);

  const groups = useMemo(() => {
    if (terms.length) return [{ label: "Results", items: models.filter((m) => matches(m, terms)) }];
    const featured = models.filter((m) => m.featured);
    const rest = models.filter((m) => !m.featured);
    const out: { label: string; items: CatalogModel[] }[] = [];
    if (featured.length) out.push({ label: "Featured", items: featured });
    if (rest.length) out.push({ label: "All models", items: rest });
    return out;
  }, [models, terms]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const indexOf = (m: CatalogModel) => flat.indexOf(m);

  // Reset search + highlight the selected model on open.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setAnnouncement("");
    const idx = models.findIndex((m) => m.id === value);
    setHighlighted(idx >= 0 ? flat.findIndex((m) => m.id === value) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Highlight the first result while searching.
  useEffect(() => {
    if (terms.length) setHighlighted(flat.length ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms]);

  useEffect(() => {
    if (!open || highlighted < 0) return;
    document.getElementById(`${listId}-${highlighted}`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted, listId]);

  const reasonFor = (m: CatalogModel): string | null => {
    if (props.kind === "image") return m.kind === "image" ? (props.disabledReason?.(m) ?? null) : null;
    return m.kind === "video" ? (props.disabledReason?.(m) ?? null) : null;
  };

  const select = (m: CatalogModel) => {
    const reason = reasonFor(m);
    if (reason) {
      // Explicit no-op: tell AT users why nothing happened.
      setAnnouncement(reason);
      return;
    }
    if (props.kind === "image" && m.kind === "image") props.onChange(m);
    else if (props.kind === "video" && m.kind === "video") props.onChange(m);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Never let Enter reach an enclosing form / ⌘Enter shortcut: the picker owns it.
      e.preventDefault();
      e.stopPropagation();
      if (e.metaKey || e.ctrlKey) return;
      const m = flat[highlighted];
      if (m) select(m);
      return;
    }
    if (!flat.length) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlighted((i) => (i + 1) % flat.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlighted((i) => (i - 1 + flat.length) % flat.length);
        break;
      case "Home":
        e.preventDefault();
        setHighlighted(0);
        break;
      case "End":
        e.preventDefault();
        setHighlighted(flat.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        flush
        align={align}
        side={side}
        className="flex w-[400px] max-w-[calc(100vw-24px)] flex-col overflow-hidden"
        style={{ maxHeight: "min(600px, var(--radix-popover-content-available-height))" }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {/* Borderless search: the divider under it is the only chrome. */}
        <div className="relative border-b border-border">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
            aria-label={`Search ${kind} models`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search models"
            spellCheck={false}
            autoComplete="off"
            className="h-10 w-full bg-transparent pl-9 pr-3 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:ring-0"
          />
        </div>

        <div id={listId} role="listbox" aria-label={`${kind} models`} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {flat.length === 0 ? (
            <p className="px-3 py-8 text-center text-body text-fg-muted">No models match “{query.trim()}”</p>
          ) : null}
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <div className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-label">
                {group.label === "Featured" ? <Sparkles size={12} aria-hidden="true" /> : null}
                {group.label}
              </div>
              {group.items.map((m) => {
                const idx = indexOf(m);
                return (
                  <ModelRow
                    key={m.id}
                    id={`${listId}-${idx}`}
                    model={m}
                    selected={m.id === value}
                    highlighted={idx === highlighted}
                    disabledReason={reasonFor(m)}
                    unavailable={live ? !live.available.includes(m.id) : false}
                    onHover={() => setHighlighted(idx)}
                    onSelect={() => select(m)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {live ? (
          <div className="border-t border-border px-3 py-1.5 text-caption tabular-nums">
            {models.length} models · checked {formatRelative(live.checkedAt)}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
