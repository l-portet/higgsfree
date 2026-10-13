import { useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Check, Timer } from "lucide-react";
import type { VideoModel } from "@shared/types";
import { allowedDurations } from "@shared/models";
import { cn } from "@/lib/cn";
import { formatSeconds, formatUsd } from "@/lib/format";
import { Chip } from "@/components/ui/Chip";
import { Popover, PopoverContent, PopoverItem, PopoverLabel, PopoverTrigger } from "@/components/ui/Popover";
import { Stepper } from "@/components/ui/Stepper";

export interface DurationControlProps {
  model: VideoModel;
  value: number;
  onChange: (duration: number) => void;
  /** Cost estimate for a given duration at the current resolution. */
  estimateFor: (duration: number) => number | undefined;
  /** Chevron on the trigger chip (default true; off in the fixed three-cell row). */
  chevron?: boolean;
  className?: string;
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
export function DurationControl({ model, value, onChange, estimateFor, chevron = true, className }: DurationControlProps) {
  const [open, setOpen] = useState(false);
  const list = allowedDurations(model);
  const isRange = !("options" in model.durations);
  const min = list[0] ?? value;
  const max = list[list.length - 1] ?? value;
  const step = "options" in model.durations ? 1 : (model.durations.step ?? 1);
  const estimate = estimateFor(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip
          icon={<Timer size={15} />}
          label={formatSeconds(value)}
          chevron={chevron}
          aria-label={`Duration: ${formatSeconds(value)}`}
          className={cn("tabular-nums", className)}
        />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className={cn(isRange ? "w-[264px]" : "w-[220px]")}>
        {isRange ? (
          <div className="flex flex-col gap-3 p-2">
            <div className="flex items-center justify-between">
              <PopoverLabel className="p-0">Duration</PopoverLabel>
              <span className="text-caption tabular-nums">
                {min}s–{max}s
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Stepper
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={onChange}
                label="Duration"
                format={(v) => `${v}s`}
              />
              <span className="text-meta tabular-nums">{estimate !== undefined ? formatUsd(estimate, { approx: true }) : null}</span>
            </div>
            <SliderPrimitive.Root
              className="relative flex h-5 w-full touch-none select-none items-center"
              min={min}
              max={max}
              step={step}
              value={[value]}
              onValueChange={([v]) => {
                if (v !== undefined) onChange(v);
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
                  onClick={() => onChange(d)}
                  aria-pressed={d === value}
                  className={cn(
                    "h-6 rounded-full border px-2 text-[11px] font-medium tabular-nums transition-colors duration-150",
                    d === value
                      ? "border-accent/60 bg-accent/10 text-fg"
                      : "border-border bg-surface-3 text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>
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
                    onChange(d);
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
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
