import { useEffect, useState, type KeyboardEvent } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { AudioLines, Check, Clock, Film, Link2, Minus, Plus } from "lucide-react";
import type { VideoModel } from "@shared/types";
import { allowedDurations, snapDuration } from "@shared/models";
import { cn } from "@/lib/cn";
import { formatSeconds, formatUsd } from "@/lib/format";
import { Chip } from "@/components/ui/Chip";
import { Popover, PopoverContent, PopoverItem, PopoverLabel, PopoverTrigger } from "@/components/ui/Popover";

export interface DurationControlProps {
  model: VideoModel;
  value: number;
  onChange: (duration: number) => void;
  /** Cost estimate for a given duration at the current resolution. */
  estimateFor: (duration: number) => number | undefined;
  /** Chevron on the trigger chip (default true). */
  chevron?: boolean;
  /** Where the popover opens (default `top`: the control lives in the bottom dock). */
  side?: "top" | "bottom";
  className?: string;
  /** Attached clips whose length the duration can follow (reference videos and audio). */
  matches?: DurationMatch[];
  /** The clip the duration follows, if any. */
  matchedId?: string | null;
  /** Follow a clip's length (`null`: stop following; a manual change also stops it). */
  onMatch?: (id: string | null) => void;
}

/** A clip the duration can match: its length, rounded and snapped to the model's durations when picked. */
export interface DurationMatch {
  id: string;
  /** "Video 1", "Audio 2". */
  label: string;
  kind: "video" | "audio";
  /** Undefined while the length is not known. */
  sec?: number;
}

/** The duration that matches a clip of `sec` seconds: its nearest whole second, then the model's nearest duration. */
export function matchedDuration(model: VideoModel, sec: number): number {
  return snapDuration(model, Math.max(1, Math.round(sec)));
}

/** The exact-seconds field between − and +: typed values apply on Enter or blur, snapped to what the model takes. */
function SecondsField({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n) || text.trim() === "") return setText(String(value));
    const v = Math.min(max, Math.max(min, Math.round(n / step) * step));
    setText(String(v));
    if (v !== value) onChange(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };
  const btn =
    "inline-flex size-7 items-center justify-center rounded-tag text-fg-muted transition-colors duration-150 " +
    "hover:bg-surface-3 hover:text-fg disabled:text-fg-faint disabled:pointer-events-none";
  return (
    <div role="group" aria-label="Duration" className="inline-flex h-9 select-none items-center gap-0.5 rounded-control border border-border-strong bg-surface-2 px-1">
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label="Decrease Duration">
        <Minus size={14} aria-hidden="true" />
      </button>
      <label className="flex items-center text-[13px] font-medium tabular-nums tracking-[-0.01em] text-fg">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onFocus={(e) => e.target.select()}
          aria-label="Duration in seconds"
          className="w-[26px] bg-transparent text-right outline-none focus-visible:text-accent"
        />
        <span>s</span>
      </label>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label="Increase Duration">
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Quick-pick values for a range model: the ends plus common lengths that fall inside it. */
function presets(list: number[]): number[] {
  const first = list[0];
  const last = list[list.length - 1];
  if (first === undefined || last === undefined) return [];
  const middle = [5, 8, 10, 15, 20, 30].filter((d) => list.includes(d) && d !== first && d !== last);
  // Always keep both ends; trim the middle when there are too many.
  while (middle.length > 4) middle.splice(Math.floor(middle.length / 2), 1);
  return [...new Set([first, ...middle, last])].sort((a, b) => a - b);
}

/** `[⏱ 5s ˅]` chip → popover. Explicit options render as a list; ranges get a stepper + slider. */
export function DurationControl({ model, value, onChange, estimateFor, chevron = true, side = "top", className, matches = [], matchedId, onMatch }: DurationControlProps) {
  const [open, setOpen] = useState(false);
  const list = allowedDurations(model);
  const isRange = !("options" in model.durations);
  const min = list[0] ?? value;
  const max = list[list.length - 1] ?? value;
  const step = "options" in model.durations ? 1 : (model.durations.step ?? 1);
  const estimate = estimateFor(value);
  const matched = matchedId ? matches.find((m) => m.id === matchedId) : undefined;
  // A manual change stops following a clip.
  const pick = (d: number) => {
    if (matched) onMatch?.(null);
    onChange(d);
  };

  const matchSection =
    matches.length > 0 && onMatch ? (
      <div className="flex flex-col border-t border-border pt-1" role="group" aria-label="Match a reference">
        <PopoverLabel>Match reference</PopoverLabel>
        {matches.map((m) => {
          const d = m.sec !== undefined ? matchedDuration(model, m.sec) : undefined;
          const selected = m.id === matchedId;
          const Icon = m.kind === "video" ? Film : AudioLines;
          return (
            <PopoverItem key={m.id} selected={selected} disabled={d === undefined} onClick={() => onMatch(selected ? null : m.id)}>
              <Icon size={15} className="text-fg-muted" aria-hidden="true" />
              <span className="flex-1">{m.label}</span>
              <span className="text-caption tabular-nums">
                {m.sec === undefined ? "length unknown" : Math.abs((d ?? 0) - m.sec) >= 0.5 ? `${formatSeconds(m.sec)} → ${d}s` : formatSeconds(m.sec)}
              </span>
              {selected ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
            </PopoverItem>
          );
        })}
        <p className="px-2 pb-1 pt-1 text-caption">
          {matched ? "Follows the clip until you pick a length." : `Rounded to the second${isRange ? ` and kept within ${min}–${max} s` : ""}.`}
        </p>
      </div>
    ) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          icon={matched ? <Link2 size={15} /> : <Clock size={15} />}
          label={formatSeconds(value)}
          chevron={chevron}
          title={matched ? `Matches ${matched.label.toLowerCase()}` : undefined}
          aria-label={`Duration: ${formatSeconds(value)}${matched ? `, matching ${matched.label.toLowerCase()}` : ""}`}
          className={cn("tabular-nums", className)}
        />
      </PopoverTrigger>
      <PopoverContent side={side} align="start" className={cn(isRange ? "w-[264px]" : "w-[220px]")}>
        {isRange ? (
          <div className="flex flex-col gap-3 p-2">
            <div className="flex items-center justify-between">
              <PopoverLabel className="p-0">Duration</PopoverLabel>
              <span className="text-caption tabular-nums">
                {min}s–{max}s
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <SecondsField value={value} min={min} max={max} step={step} onChange={pick} />
              <span className="text-meta tabular-nums">{estimate !== undefined ? formatUsd(estimate, { approx: true }) : null}</span>
            </div>
            <SliderPrimitive.Root
              className="relative flex h-5 w-full touch-none select-none items-center"
              min={min}
              max={max}
              step={step}
              value={[value]}
              onValueChange={([v]) => {
                if (v !== undefined && v !== value) pick(v);
              }}
            >
              <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-surface-3">
                <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb
                aria-label="Duration in seconds"
                className={cn(
                  "block size-4 rounded-full border border-border-strong bg-fg shadow-[0_2px_6px_rgba(0,0,0,0.5)]",
                  "transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                )}
              />
            </SliderPrimitive.Root>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Quick durations">
              {presets(list).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pick(d)}
                  aria-pressed={d === value}
                  className={cn(
                    "h-6 rounded-tag border px-2 text-[11px] font-medium tabular-nums transition-colors duration-150",
                    d === value
                      ? "border-accent/60 bg-accent/10 text-fg"
                      : "border-border bg-surface-3 text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>
            {matchSection}
          </div>
        ) : (
          <div role="listbox" aria-label="Duration">
            <PopoverLabel>Duration</PopoverLabel>
            {list.map((d) => {
              const est = estimateFor(d);
              return (
                <PopoverItem
                  key={d}
                  selected={d === value}
                  onClick={() => {
                    pick(d);
                    setOpen(false);
                  }}
                >
                  <span className="w-8 font-medium tabular-nums">{d}s</span>
                  <span className="flex-1 text-meta tabular-nums">
                    {est !== undefined ? formatUsd(est, { approx: true }) : ""}
                  </span>
                  {d === value ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
                </PopoverItem>
              );
            })}
            {matchSection}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
