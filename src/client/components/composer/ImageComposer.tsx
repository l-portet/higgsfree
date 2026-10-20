import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { Check, Gem, Plus } from "lucide-react";
import { toast } from "sonner";
import type { ImageAspectRatio, ImageGenerateRequest, ImageModel, ImageSize } from "@shared/types";
import { DEFAULT_IMAGE_MODEL } from "@shared/models";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { quoteImage } from "@/lib/image-cost";
import { dragHasFiles, imageFilesFromClipboard, imageFilesFromDataTransfer, pickImageFiles } from "@/lib/files";
import { pluralize, ratioLabel } from "@/lib/format";
import { frameFromMedia, frameInput, loadFrame, type Frame } from "@/lib/frames";
import { isImageAspectRatio, isImageSize } from "@/lib/models";
import { readJson, writeJson } from "@/lib/storage";
import { useGenerations } from "@/store/generations";
import { useModels } from "@/store/models";
import { useUi } from "@/store/ui";
import { Badge } from "@/components/ui/Badge";
import { Chip, StaticChip } from "@/components/ui/Chip";
import { Popover, PopoverContent, PopoverItem, PopoverLabel, PopoverTrigger } from "@/components/ui/Popover";
import { Stepper } from "@/components/ui/Stepper";
import { Textarea } from "@/components/ui/Textarea";
import { Tooltip } from "@/components/ui/Tooltip";
import { ModelPicker } from "@/components/ModelPicker";
import { RatioGlyph } from "@/components/RatioGlyph";
import { AddButton, AttachmentStrip, ComposerFrame, ComposerNotice, PROMPT_TEXTAREA_CLASS } from "./ComposerFrame";
import { CostEstimate } from "./CostEstimate";
import { useKeyGate } from "./useKeyGate";
import { ModelChip } from "./ModelChip";

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
  // The last model picked here comes back; the app's default otherwise.
  const pickedModel = p.pickedModel === true && typeof p.model === "string" && models.some((m) => m.id === p.model);
  return {
    pickedModel,
    model: pickedModel ? (p.model as string) : DEFAULT_IMAGE_MODEL,
    aspectRatio: isImageAspectRatio(p.aspectRatio) ? p.aspectRatio : ("1:1" as ImageAspectRatio),
    size: isImageSize(p.size) ? p.size : ("1K" as ImageSize),
    count: clampCount(p.count),
    prompt: typeof p.prompt === "string" ? p.prompt : "",
  };
}

/** Views that show image runs as they come in; from anywhere else a submit navigates to the Image view. */
const SHOWS_IMAGES = /^\/(image|assets)(\/|$)/;

export function ImageComposer() {
  const models = useModels((s) => s.image);
  const draft = useUi((s) => s.draft);
  const router = useRouter();
  const pathname = usePathname() ?? "/";

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

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const room = Math.max(0, maxRefs - refs.length);
      if (files.length > room) toast.error(`Up to ${maxRefs} reference images`);
      for (const file of files.slice(0, room)) {
        const f = await loadFrame(file);
        if (f) setRefs((r) => (r.length >= maxRefs ? r : [...r, f]));
      }
    },
    [maxRefs, refs.length],
  );

  const removeRef = (id: string) => setRefs((r) => r.filter((x) => x.id !== id));

  // "Reuse prompt" / example prompt hand-off.
  useEffect(() => {
    if (!draft || draft.type !== "image") return;
    useUi.getState().consumeDraft("image");
    setPrompt(draft.prompt);
    if (draft.model && models.some((m) => m.id === draft.model)) pickModel(draft.model);
    if (draft.params && "size" in draft.params) {
      setAspectRatio(draft.params.aspectRatio);
      setSize(draft.params.size);
    }
    if (draft.referenceImages?.length) setRefs(draft.referenceImages.map((id) => frameFromMedia(id)));
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

  const trimmed = prompt.trim();
  // Generate stays clickable without a key: it opens the key dialog for the model's provider.
  const keyGate = useKeyGate(model);
  const notice = keyGate.notice;

  const disabledReason: string | null = !model
    ? "No image models available"
    : !trimmed
          ? "Enter a prompt"
          : (modelReason(model) ?? (refCount === 0 && !model.caps.textToImage ? `${model.name} needs a reference image. Add one with +` : null));

  // The price on the provider that runs it (the preferred one that can take the request): OpenRouter's from
  // the catalog, fal's and kie.ai's list prices. No key yet: the price where it would run once one is added.
  const quote = model ? quoteImage(model, { aspectRatio, size, count, references: refCount }, keyGate.keys, keyGate.preferred) : undefined;
  const shown = quote?.quotes.find((q) => q.provider === quote.provider) ?? quote?.quotes.find((q) => !q.refusal);
  const estimate = shown?.usd;

  const submit = async () => {
    if (!model || disabledReason || submitting) return;
    if (keyGate.askForKey(() => void submit())) return;
    const req: ImageGenerateRequest = { prompt: trimmed, model: model.id, aspectRatio, size, count };
    if (refs.length) req.referenceImages = refs.map(frameInput);
    setSubmitting(true);
    try {
      const res = await api.generateImage(req);
      useGenerations.getState().upsert(res.generations);
      toast.success(`Generating ${pluralize(res.generations.length, "image")}…`);
      if (SHOWS_IMAGES.test(pathname)) window.scrollTo({ top: 0, behavior: "smooth" });
      else router.push("/image");
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

  return (
    <ComposerFrame
      onSubmit={onFormSubmit}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Image prompt"
      dragging={dragging}
      notice={notice ? <ComposerNotice message={notice.message} action={notice.action} onAction={notice.onAction} /> : null}
      addControl={
        <Tooltip content={addTooltip} side="top">
          <AddButton onClick={() => void pick()} aria-label="Add reference image">
            <Plus size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </AddButton>
        </Tooltip>
      }
      attachments={<AttachmentStrip items={refs} onRemove={removeRef} label="Reference images" />}
      textarea={
        <Textarea
          ref={textareaRef}
          unstyled
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="Describe the image: subject, style, light, lens…"
          aria-label="Prompt"
          maxLength={8000}
          minRows={1}
          maxRows={6}
          compactUntilFocus
          className={PROMPT_TEXTAREA_CLASS}
        />
      }
      chips={
        <>
          <ModelPicker kind="image" value={model.id} onChange={(m) => pickModel(m.id)} disabledReason={modelReason}>
            <ModelChip model={model} reason={modelReason(model)} />
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
        </>
      }
      estimate={estimate !== undefined ? <CostEstimate usd={estimate} provider={shown?.provider} /> : undefined}
      generate={{ disabledReason, submitting, reasonId }}
      className={cn(submitting && "cursor-progress")}
    />
  );
}
