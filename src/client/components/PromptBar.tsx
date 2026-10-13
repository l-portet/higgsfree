import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Check, Gem, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { ImageAspectRatio, ImageGenerateRequest, ImageModel, ImageSize } from "@shared/types";
import { DEFAULT_IMAGE_MODEL, estimateImageCost } from "@shared/models";
import { cn } from "@/lib/cn";
import { describeApiError } from "@/lib/api";
import { dragHasFiles, imageFilesFromClipboard, imageFilesFromDataTransfer, pickImageFiles } from "@/lib/files";
import { formatUsd, isMac, ratioLabel } from "@/lib/format";
import { frameFromUrl, loadFrame, type Frame } from "@/lib/frames";
import { isImageAspectRatio, isImageSize } from "@/lib/models";
import { readJson, writeJson } from "@/lib/storage";
import { useModels } from "@/store/models";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip, StaticChip } from "@/components/ui/Chip";
import { Kbd } from "@/components/ui/Kbd";
import { Popover, PopoverContent, PopoverItem, PopoverLabel, PopoverTrigger } from "@/components/ui/Popover";
import { Spinner } from "@/components/ui/Spinner";
import { Stepper } from "@/components/ui/Stepper";
import { Textarea } from "@/components/ui/Textarea";
import { Tooltip } from "@/components/ui/Tooltip";
import { ModelPicker } from "@/components/ModelPicker";
import { ProviderTile } from "@/components/ProviderTile";
import { RatioGlyph } from "@/components/RatioGlyph";

const STORAGE_KEY = "higgsfree.image.prompt-bar";
const MAX_COUNT = 4;

/** Shape written to localStorage; every field is untrusted on the way back in. */
interface Persisted {
  model?: string;
  /** True once the user chose a model here (picker, Reuse prompt); until then Settings › Defaults applies. */
  pickedModel?: boolean;
  aspectRatio?: ImageAspectRatio;
  size?: ImageSize;
  count?: number;
  prompt?: string;
}

const SIZE_META: Record<ImageSize, { hint: string; pro?: boolean }> = {
  "1K": { hint: "Standard" },
  "2K": { hint: "High detail" },
  "4K": { hint: "Ultra", pro: true },
};

function clampCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 1;
  return Math.min(MAX_COUNT, Math.max(1, v));
}

/** Coerce whatever is in localStorage into valid control values. */
function restore(models: ImageModel[]) {
  const p = readJson<Record<string, unknown>>(STORAGE_KEY, {});
  const pickedModel = p.pickedModel === true && typeof p.model === "string" && models.some((m) => m.id === p.model);
  // Seed from Settings › Defaults when they are already loaded; the effect that follows them would
  // otherwise swap the model in one render later, flashing the catalog default first.
  const settingsDefault = useSettings.getState().settings?.defaults.imageModel;
  const fallback = settingsDefault && models.some((m) => m.id === settingsDefault) ? settingsDefault : DEFAULT_IMAGE_MODEL;
  return {
    pickedModel,
    model: pickedModel ? (p.model as string) : fallback,
    aspectRatio: isImageAspectRatio(p.aspectRatio) ? p.aspectRatio : ("3:4" as ImageAspectRatio),
    size: isImageSize(p.size) ? p.size : ("1K" as ImageSize),
    count: clampCount(p.count),
    prompt: typeof p.prompt === "string" ? p.prompt : "",
  };
}

export interface PromptBarProps {
  onSubmit: (req: ImageGenerateRequest) => Promise<void> | void;
  /** Reports the bar's rendered height (including its bottom inset) so the page can pad for it. */
  onHeightChange?: (height: number) => void;
  className?: string;
}

export function PromptBar({ onSubmit, onHeightChange, className }: PromptBarProps) {
  const models = useModels((s) => s.image);
  const defaultModel = useSettings((s) => s.settings?.defaults.imageModel);
  const hasKey = useSettings((s) => s.settings?.hasKey);
  const server = useSettings((s) => s.server);
  const draft = useUi((s) => s.draft);

  const initial = useMemo(() => restore(models), [models]);
  const [pickedModel, setPickedModel] = useState(initial.pickedModel);
  const [modelId, setModelId] = useState<string>(initial.model);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(initial.aspectRatio);
  const [size, setSize] = useState<ImageSize>(initial.size);
  const [count, setCount] = useState<number>(initial.count);
  const [prompt, setPrompt] = useState<string>(initial.prompt);
  const [refs, setRefs] = useState<Frame[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reasonId = useId();

  const model: ImageModel | undefined = useMemo(
    () => models.find((m) => m.id === modelId) ?? models.find((m) => m.id === DEFAULT_IMAGE_MODEL) ?? models[0],
    [models, modelId],
  );

  const pickModel = (id: string) => {
    setPickedModel(true);
    setModelId(id);
  };

  /** Attach limit: the most any catalog model accepts, so you can attach first and switch model after. */
  const maxRefs = useMemo(() => models.reduce((n, m) => Math.max(n, m.caps.maxReferenceImages), 0), [models]);

  // Follow Settings › Defaults (including later changes) until the user picks a model here.
  useEffect(() => {
    if (pickedModel || !defaultModel) return;
    if (models.some((m) => m.id === defaultModel)) setModelId(defaultModel);
  }, [defaultModel, models, pickedModel]);

  // Snap aspect ratio / size to what the selected model supports.
  useEffect(() => {
    if (!model) return;
    setAspectRatio((ar) =>
      model.aspectRatios.includes(ar) ? ar : model.aspectRatios.includes("1:1") ? "1:1" : (model.aspectRatios[0] ?? "auto"),
    );
    setSize((sz) => (model.sizes.includes(sz) ? sz : (model.sizes[0] ?? "1K")));
  }, [model]);

  // Persist the last-used controls.
  useEffect(() => {
    writeJson(STORAGE_KEY, { model: modelId, pickedModel, aspectRatio, size, count, prompt } satisfies Persisted);
  }, [modelId, pickedModel, aspectRatio, size, count, prompt]);

  // Let the page pad for the bar (it's fixed, so a long prompt would otherwise cover the last row).
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !onHeightChange) return;
    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  const settle = useCallback((u: Frame) => setRefs((r) => r.map((x) => (x.id === u.id ? u : x))), []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const room = Math.max(0, maxRefs - refs.length);
      if (files.length > room) toast.error(`Up to ${maxRefs} reference images`);
      for (const file of files.slice(0, room)) {
        const frame = await loadFrame(file, settle);
        if (frame) setRefs((r) => (r.length >= maxRefs ? r : [...r, frame]));
      }
    },
    [maxRefs, refs.length, settle],
  );

  const removeRef = (id: string) => setRefs((r) => r.filter((x) => x.id !== id));

  // "Reuse prompt" hand-off.
  useEffect(() => {
    if (!draft || draft.type !== "image") return;
    useUi.getState().consumeDraft("image");
    setPrompt(draft.prompt);
    if (draft.model && models.some((m) => m.id === draft.model)) pickModel(draft.model);
    if (draft.params && "size" in draft.params) {
      setAspectRatio(draft.params.aspectRatio);
      setSize(draft.params.size);
    }
    if (draft.referenceImages?.length) setRefs(draft.referenceImages.map(frameFromUrl));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [draft, models]);

  const refCount = refs.length;
  const modelReason = useCallback(
    (m: ImageModel): string | null => {
      if (refCount === 0) return null;
      if (!m.caps.imageToImage || m.caps.maxReferenceImages === 0) return `${m.name} doesn't support reference images`;
      if (refCount > m.caps.maxReferenceImages) {
        return `${m.name} accepts up to ${m.caps.maxReferenceImages} reference image${m.caps.maxReferenceImages === 1 ? "" : "s"}`;
      }
      return null;
    },
    [refCount],
  );

  const uploading = refs.some((r) => r.uploading);
  const trimmed = prompt.trim();

  const disabledReason: string | null = !model
    ? "No image models available"
    : server === "offline"
      ? "Server unreachable"
      : hasKey === false
        ? "Add your OpenRouter key in Settings"
        : !trimmed
          ? "Enter a prompt"
          : (modelReason(model) ?? (uploading ? "Uploading reference images…" : null));

  const estimate = model ? estimateImageCost(model, size, count) : undefined;

  const submit = async () => {
    if (!model || disabledReason || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        prompt: trimmed,
        model: model.id,
        aspectRatio,
        size,
        count,
        referenceImages: refs.length ? refs.map((r) => r.url ?? r.src) : undefined,
      });
    } catch (err) {
      toast.error("Generation failed", { description: describeApiError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  // ⌘/Ctrl+Enter lives on the textarea only, never on the form, where portaled popovers would bubble into it.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imageFilesFromClipboard(e);
    if (!files.length) return;
    e.preventDefault();
    void addFiles(files);
  };

  const onDragOver = (e: DragEvent<HTMLFormElement>) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLFormElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLFormElement>) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    setDragging(false);
    void addFiles(imageFilesFromDataTransfer(e.dataTransfer));
  };

  const pick = async () => {
    const files = await pickImageFiles({ multiple: true });
    void addFiles(files);
  };

  if (!model) return null;

  const modelMax = model.caps.maxReferenceImages;
  const addTooltip =
    modelMax > 0
      ? `Add reference images (up to ${modelMax} for ${model.name})`
      : `${model.name} doesn't use reference images. Attach some, then switch model.`;

  // Shared by both Generate renderings (icon button below `sm`, two-line block from `sm` up).
  const generateA11y = {
    "aria-disabled": disabledReason ? true : undefined,
    "aria-describedby": disabledReason ? reasonId : undefined,
  } as const;

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4",
        className,
      )}
    >
      <form
        onSubmit={onFormSubmit}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-label="Image prompt"
        className={cn(
          "group pointer-events-auto w-full max-w-[960px] rounded-2xl border bg-surface/90 p-3 shadow-bar backdrop-blur-xl",
          "sm:grid sm:grid-cols-[1fr_auto] sm:gap-x-3 sm:p-4",
          "transition-colors duration-150 focus-within:border-border-strong",
          dragging ? "border-accent/70" : "border-border",
        )}
      >
        <div className="min-w-0">
          {/* Row 1: + button · reference thumbnails · textarea · Generate (below `sm` only) */}
          <div className="flex items-start gap-2">
            <Tooltip content={addTooltip} side="top">
              <button
                type="button"
                onClick={() => void pick()}
                aria-label="Add reference image"
                className={cn(
                  "mt-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-2 text-fg-muted",
                  "transition-colors duration-150 hover:border-border-strong hover:bg-surface-3 hover:text-fg",
                )}
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </Tooltip>

            {refs.length ? (
              <ul className="mt-1.5 flex shrink-0 items-center gap-2" aria-label="Reference images">
                {refs.map((r) => (
                  <li key={r.id} className="relative">
                    <div className="size-8 overflow-hidden rounded-[8px] border border-border bg-surface-2">
                      <img src={r.src} alt={r.name} className="size-full object-cover" draggable={false} />
                      {r.uploading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <Spinner size={14} className="text-white" />
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRef(r.id)}
                      aria-label={`Remove ${r.name}`}
                      className="absolute -right-1.5 -top-1.5 inline-flex size-4 items-center justify-center rounded-full bg-fg text-bg shadow transition-transform duration-150 hover:scale-110"
                    >
                      <X size={10} strokeWidth={3} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <Textarea
              ref={textareaRef}
              unstyled
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder="Describe the scene you imagine"
              aria-label="Prompt"
              maxLength={8000}
              minRows={1}
              maxRows={6}
              className="min-h-11 flex-1 py-2.5 text-[15px] leading-6"
            />

            {/* `aria-disabled` (not `disabled`) keeps Generate focusable so the reason reaches keyboard / AT users. */}
            <Tooltip content={disabledReason} side="top" align="end">
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={submitting}
                aria-label="Generate"
                {...generateA11y}
                leftIcon={<ArrowUp strokeWidth={2.25} aria-hidden="true" />}
                className="mt-0.5 size-10 shrink-0 rounded-full p-0 sm:hidden [&_svg]:size-5"
              />
            </Tooltip>
          </div>

          {/* Row 2: controls · keyboard hint */}
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <ModelPicker kind="image" value={model.id} onChange={(m) => pickModel(m.id)} disabledReason={modelReason}>
              <Chip
                icon={<ProviderTile provider={model.provider} size={18} className="-ml-0.5" />}
                label={model.name}
                chevron
                aria-label={`Model: ${model.name}`}
                className={cn(modelReason(model) && "border-danger/40 text-danger")}
              />
            </ModelPicker>

            <Popover open={arOpen} onOpenChange={setArOpen}>
              <PopoverTrigger asChild>
                <Chip
                  icon={<RatioGlyph ratio={aspectRatio} />}
                  label={aspectRatio === "auto" ? "Auto" : aspectRatio}
                  aria-label={`Aspect ratio: ${aspectRatio}`}
                  className="tabular-nums"
                />
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="max-h-[420px] w-[200px] overflow-y-auto">
                <PopoverLabel>Aspect ratio</PopoverLabel>
                <div role="listbox" aria-label="Aspect ratio">
                  {model.aspectRatios.map((ar) => (
                    <PopoverItem
                      key={ar}
                      selected={ar === aspectRatio}
                      onClick={() => {
                        setAspectRatio(ar);
                        setArOpen(false);
                      }}
                    >
                      <RatioGlyph ratio={ar} className="text-fg-muted" />
                      <span className="flex-1 tabular-nums">{ar === "auto" ? "Auto" : ar}</span>
                      <span className="text-caption">{ratioLabel(ar)}</span>
                      {ar === aspectRatio ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
                    </PopoverItem>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {model.sizes.length <= 1 ? (
              <StaticChip icon={<Gem size={15} />} label={size} title={`${size} is the only quality for ${model.name}`} />
            ) : (
              <Popover open={sizeOpen} onOpenChange={setSizeOpen}>
                <PopoverTrigger asChild>
                  <Chip icon={<Gem size={15} />} label={size} aria-label={`Quality: ${size}`} />
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-[200px]">
                  <PopoverLabel>Quality</PopoverLabel>
                  <div role="listbox" aria-label="Quality">
                    {model.sizes.map((sz) => (
                      <PopoverItem
                        key={sz}
                        selected={sz === size}
                        onClick={() => {
                          setSize(sz);
                          setSizeOpen(false);
                        }}
                      >
                        <span className="w-6 font-medium tabular-nums">{sz}</span>
                        <span className="flex-1 text-meta">{SIZE_META[sz].hint}</span>
                        {SIZE_META[sz].pro ? <Badge variant="pro" /> : null}
                        {sz === size ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
                      </PopoverItem>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <Stepper value={count} min={1} max={MAX_COUNT} onChange={setCount} label="Number of images" />

            {/* Only while the bar has focus: the shortcut is a hint, not a label. */}
            <span
              className="ml-auto hidden items-center gap-1 text-fg-subtle opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 sm:inline-flex"
              aria-hidden="true"
            >
              <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>↵</Kbd>
            </span>
          </div>
        </div>

        {/* Generate: a lime block spanning both rows, estimate on its second line (`sm` and up). */}
        <Tooltip content={disabledReason} side="top" align="end">
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            {...generateA11y}
            className="hidden h-auto min-h-[72px] w-[132px] flex-col gap-0.5 self-stretch rounded-xl px-3 text-[14px] font-semibold sm:flex"
          >
            Generate
            {estimate !== undefined ? (
              <span className="text-[12px] font-medium tabular-nums opacity-70">{formatUsd(estimate, { approx: true })}</span>
            ) : null}
          </Button>
        </Tooltip>
        {disabledReason ? (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        ) : null}
      </form>
    </div>
  );
}
