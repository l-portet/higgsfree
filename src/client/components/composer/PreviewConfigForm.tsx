import { useId, useState } from "react";
import { Check, Cpu, Gauge, RotateCcw } from "lucide-react";
import { DEFAULT_PREVIEW_CONFIG, DEFAULT_STORYBOARD_INSTRUCTIONS, PREVIEW_MODELS, previewModel, STORYBOARD_FRAMES, withPreviewModel, type PreviewConfig, type StoryboardLayout } from "@/lib/prompt-editor";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Popover, PopoverContent, PopoverItem, PopoverLabel, PopoverTrigger } from "@/components/ui/Popover";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";

const QUALITY_LABEL: Record<string, string> = { auto: "Auto", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-label">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-caption">{hint}</p> : null}
    </div>
  );
}

export interface PreviewConfigFormProps {
  config: PreviewConfig;
  onChange: (config: PreviewConfig) => void;
  onDone: () => void;
  layout: StoryboardLayout;
  /** A first frame (or character image) is attached, so the reference switch has something to send. */
  hasFirstFrame: boolean;
  disabled?: boolean;
}

/** "Edit configuration" for the preview: model, its quality or resolution, the reference, and the storyboard instructions. */
export function PreviewConfigForm({ config, onChange, onDone, layout, hasFirstFrame, disabled }: PreviewConfigFormProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const [optionOpen, setOptionOpen] = useState(false);
  const ids = { instructions: useId(), reference: useId(), referenceHint: useId() };
  const model = previewModel(config.model);
  const options = model.qualities ?? model.resolutions ?? [];
  const optionLabel = model.qualities ? "Quality" : "Resolution";
  const current = model.qualities ? config.quality : config.resolution;
  const isDefault = JSON.stringify(config) === JSON.stringify(DEFAULT_PREVIEW_CONFIG);

  const pickOption = (value: string) => {
    onChange(model.qualities ? { ...config, quality: value as PreviewConfig["quality"] } : { ...config, resolution: value as PreviewConfig["resolution"] });
    setOptionOpen(false);
  };

  return (
    <section aria-label="Preview configuration" className="mb-3 flex flex-col gap-3.5 rounded-card border border-border bg-inset p-3">
      <Field label="Model">
        <Popover open={modelOpen} onOpenChange={setModelOpen}>
          <PopoverTrigger asChild>
            <Chip size="sm" icon={<Cpu />} label={model.name} chevron strong disabled={disabled} aria-label={`Preview model: ${model.name}`} className="max-w-full" />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-[264px]">
            <div role="listbox" aria-label="Preview model">
              {PREVIEW_MODELS.map((m) => (
                <PopoverItem
                  key={m.id}
                  selected={m.id === model.id}
                  onClick={() => {
                    onChange(withPreviewModel(config, m.id));
                    setModelOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.name}</span>
                    <span className="block truncate text-caption">{m.note}</span>
                  </span>
                  {m.id === model.id ? <Check size={14} className="shrink-0 text-accent" aria-hidden="true" /> : null}
                </PopoverItem>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </Field>

      {options.length > 0 ? (
        <Field label={optionLabel}>
          <Popover open={optionOpen} onOpenChange={setOptionOpen}>
            <PopoverTrigger asChild>
              <Chip size="sm" icon={<Gauge />} label={QUALITY_LABEL[current ?? ""] ?? current ?? "Default"} chevron disabled={disabled} aria-label={`${optionLabel}: ${current ?? "default"}`} />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-[180px]">
              <div role="listbox" aria-label={optionLabel}>
                <PopoverLabel>{optionLabel}</PopoverLabel>
                {options.map((o) => (
                  <PopoverItem key={o} selected={o === current} onClick={() => pickOption(o)}>
                    <span className="flex-1">{QUALITY_LABEL[o] ?? o}</span>
                    {o === current ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
                  </PopoverItem>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </Field>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div id={ids.reference} className="text-[13px] font-medium text-fg">
            First frame as reference
          </div>
          <p id={ids.referenceHint} className="mt-0.5 text-caption">
            {hasFirstFrame ? "Sent with the request, and drawn as the first panel." : "Attach a first frame in the composer to use it."}
          </p>
        </div>
        <Switch
          checked={config.useReference}
          onCheckedChange={(useReference) => onChange({ ...config, useReference })}
          disabled={disabled}
          aria-labelledby={ids.reference}
          aria-describedby={ids.referenceHint}
          className="mt-0.5"
        />
      </div>

      <Field
        label="Instructions"
        htmlFor={ids.instructions}
        hint={
          <>
            Sent before the prompt. {"{frames}"}, {"{columns}"} and {"{rows}"} become {STORYBOARD_FRAMES}, {layout.cols} and {layout.rows} for this video&apos;s {layout.canvas} picture.
          </>
        }
      >
        <Textarea
          id={ids.instructions}
          value={config.instructions}
          onChange={(e) => onChange({ ...config, instructions: e.target.value })}
          disabled={disabled}
          minRows={5}
          maxRows={10}
          maxLength={4000}
          className="text-[12px] leading-[18px]"
        />
      </Field>

      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<RotateCcw />}
          onClick={() => onChange({ ...DEFAULT_PREVIEW_CONFIG, instructions: DEFAULT_STORYBOARD_INSTRUCTIONS })}
          disabled={disabled || isDefault}
          className="-ml-2"
        >
          Reset
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  );
}
