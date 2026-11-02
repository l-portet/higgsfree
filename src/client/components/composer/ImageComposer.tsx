import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { Check, Gem, ImageUpscale, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ImageAspectRatio, ImageGenerateRequest, ImageModel, ImageSize, ProviderId } from "@shared/types";
import { DEFAULT_IMAGE_MODEL } from "@shared/models";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { quoteImage } from "@/lib/image-cost";
import { factorLabel, upscaleFactor } from "@/lib/upscale";
import { pinQuote } from "@/lib/video-cost";
import { dragHasFiles, imageFilesFromClipboard, imageFilesFromDataTransfer, pickImageFiles } from "@/lib/files";
import { formatUsd, pluralize, ratioLabel } from "@/lib/format";
import { frameFromMedia, frameInput, loadFrame, type Frame } from "@/lib/frames";
import { isImageAspectRatio, isImageSize } from "@/lib/models";
import { inMode, isComposerMode, modelForMode, modelModes, type ComposerMode } from "@/lib/modes";
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
import { CostEstimate, ProviderPicker } from "./CostEstimate";
import { sizeChange, UpscaleDropZone } from "./UpscaleDropZone";
import { useKeyGate } from "./useKeyGate";
import { ModelChip } from "./ModelChip";
import { ChipSlash, CHIP_SEGMENT, ModeModelChip, ModeSwitch } from "./ModeSwitch";

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
  /** Create, Edit or Upscale, and the model last picked in each. */
  mode?: ComposerMode;
  modeModels?: Partial<Record<ComposerMode, string>>;
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
  const model = pickedModel ? (p.model as string) : DEFAULT_IMAGE_MODEL;
  // Saved before the modes existed: the mode the saved model is listed in.
  const saved = models.find((m) => m.id === model);
  const mode: ComposerMode = isComposerMode(p.mode) ? p.mode : saved ? (modelModes(saved)[0] ?? "create") : "create";
  const rawModes = typeof p.modeModels === "object" && p.modeModels !== null ? (p.modeModels as Record<string, unknown>) : {};
  const modeModels: Partial<Record<ComposerMode, string>> = {};
  for (const k of ["create", "edit", "upscale"] as const) if (typeof rawModes[k] === "string") modeModels[k] = rawModes[k];
  return {
    pickedModel,
    model,
    mode,
    modeModels,
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
  const pendingUpscale = useUi((s) => s.pendingUpscale);
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const initial = useMemo(() => restore(models), [models]);
  const [pickedModel, setPickedModel] = useState(initial.pickedModel);
  const [modelId, setModelId] = useState<string>(initial.model);
  const [mode, setMode] = useState<ComposerMode>(initial.mode);
  /** The model last picked in each mode: switching back to a mode brings it back. */
  const [modeModels, setModeModels] = useState<Partial<Record<ComposerMode, string>>>(initial.modeModels);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(initial.aspectRatio);
  const [size, setSize] = useState<ImageSize>(initial.size);
  const [count, setCount] = useState<number>(initial.count);
  const [prompt, setPrompt] = useState<string>(initial.prompt);
  const [refs, setRefs] = useState<Frame[]>([]);
  /** The provider picked by hand next to Generate; unset, the cheapest runs it. Ignored while it cannot take the request. */
  const [pinned, setPinned] = useState<ProviderId | undefined>(undefined);
  /** Upscalers: the image to upscale (kept apart from the references, which the other models use) and the scale. */
  const [source, setSource] = useState<Frame | null>(null);
  const [factor, setFactor] = useState<number>(2);
  /** Upscalers with a creative mode: it is on. */
  const [creative, setCreative] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [factorOpen, setFactorOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reasonId = useId();

  // The picked model when the mode lists it, else the mode's default.
  const model: ImageModel | undefined = useMemo(() => modelForMode(models, mode, modelId), [models, mode, modelId]);

  const pickModel = (id: string) => {
    setPickedModel(true);
    setModelId(id);
    setModeModels((mm) => ({ ...mm, [mode]: id }));
  };

  /** Another mode: its last model, or the one picked now if that mode lists it too, or its default. */
  const switchMode = (next: ComposerMode, id?: string) => {
    if (next !== mode) {
      setMode(next);
      setPinned(undefined);
    }
    const target = id ?? modeModels[next] ?? (model && inMode(model, next) ? model.id : undefined);
    const chosen = modelForMode(models, next, target);
    if (chosen) {
      // Saved as picked, so a reload comes back on this mode's model.
      setModelId(chosen.id);
      setPickedModel(true);
      setModeModels((mm) => ({ ...mm, [next]: chosen.id }));
    }
  };

  /** An upscaler: the prompt becomes a drop zone for the one image it takes; ratio, quality and count go. */
  const upscaleMode = mode === "upscale";
  /** Editing: the attached image is the one to change, so one is required and the prompt says what to change. */
  const editMode = mode === "edit";

  /** Attach limit: the most any catalog model accepts, so you can attach first and switch model after. */
  const maxRefs = useMemo(() => models.reduce((n, m) => Math.max(n, m.caps.maxReferenceImages), 0), [models]);

  // Snap aspect ratio / size to what the selected model supports. An upscaler uses neither: they stay for the next model.
  useEffect(() => {
    if (!model || model.caps.upscale) return;
    setAspectRatio((ar) =>
      model.aspectRatios.includes(ar) ? ar : model.aspectRatios.includes("1:1") ? "1:1" : (model.aspectRatios[0] ?? "auto"),
    );
    setSize((sz) => (model.sizes.includes(sz) ? sz : (model.sizes[0] ?? "1K")));
  }, [model]);

  // Persist the last-used controls.
  useEffect(() => {
    writeJson(STORAGE_KEY, { model: modelId, pickedModel, aspectRatio, size, count, prompt, mode, modeModels } satisfies Persisted);
  }, [modelId, pickedModel, aspectRatio, size, count, prompt, mode, modeModels]);

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

  /** Upscalers take one image: a new one replaces it. */
  const setSourceFile = useCallback(async (files: File[]) => {
    const [file, ...more] = files;
    if (!file) return;
    if (more.length) toast.error("Upscalers take one image at a time");
    const f = await loadFrame(file);
    if (f) setSource(f);
  }, []);

  // "Upscale" hand-off from a card / the lightbox: onto an upscaler, unless one is picked already.
  useEffect(() => {
    if (pendingUpscale?.type !== "image") return;
    const id = useUi.getState().consumePendingUpscale("image");
    if (!id) return;
    setSource(frameFromMedia(id));
    switchMode("upscale");
    toast.success("Image added", { description: "Pick the scale, then Generate." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUpscale]);

  // "Reuse prompt" / example prompt hand-off.
  useEffect(() => {
    if (!draft || draft.type !== "image") return;
    useUi.getState().consumeDraft("image");
    const target = draft.model ? models.find((m) => m.id === draft.model) : undefined;
    // Into a mode that lists the model: the current one when it does (a model that creates and edits stays where it is).
    if (target) switchMode(inMode(target, mode) ? mode : (modelModes(target)[0] ?? "create"), target.id);
    // An upscale run: its image goes back in the drop zone, at the same scale.
    if (target?.caps.upscale) {
      const id = draft.referenceImages?.[0];
      if (id) setSource(frameFromMedia(id));
      if (draft.params && "size" in draft.params && draft.params.upscale) setFactor(draft.params.upscale);
      if (draft.params && "size" in draft.params) setCreative(Boolean(draft.params.creative));
      return;
    }
    setPrompt(draft.prompt);
    if (draft.params && "size" in draft.params) {
      setAspectRatio(draft.params.aspectRatio);
      setSize(draft.params.size);
    }
    if (draft.referenceImages?.length) setRefs(draft.referenceImages.map((id) => frameFromMedia(id)));
    requestAnimationFrame(() => textareaRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, models]);

  const refCount = refs.length;
  const modelReason = useCallback(
    (m: ImageModel): string | null => {
      // An upscaler takes its own image (the drop zone), not the references.
      if (refCount === 0 || m.caps.upscale) return null;
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

  const sentFactor = model?.caps.upscale ? upscaleFactor(model, factor) : undefined;
  const sentCreative = upscaleMode && Boolean(model?.caps.upscale?.creative) && creative;
  const disabledReason: string | null = !model
    ? "No image models available"
    : upscaleMode
      ? !source
        ? "Add an image to upscale"
        : null
      : editMode && refCount === 0
        ? "Add an image to edit"
        : !trimmed
          ? editMode
            ? "Say what to change"
            : "Enter a prompt"
          : (modelReason(model) ?? (refCount === 0 && !model.caps.textToImage ? `${model.name} needs a reference image. Add one with +` : null));

  // The price on the provider that runs it (the cheapest that can take the request): OpenRouter's from
  // the catalog, fal's and kie.ai's list prices. No key yet: the price where it would run once one is added.
  // A provider picked by hand runs it instead, while it can.
  // An upscaler is priced for one image (before one is attached too), at the scale and, once known, the image's size.
  const quoteFor = (f: number | undefined) =>
    model
      ? quoteImage(
          model,
          upscaleMode
            ? { aspectRatio: "auto", size: "1K", count: 1, references: 1, upscale: f, creative: sentCreative, inputWidth: source?.width, inputHeight: source?.height }
            : { aspectRatio, size, count, references: refCount },
          keyGate.keys,
        )
      : undefined;
  const quote = quoteFor(sentFactor);
  const effective = quote ? pinQuote(quote, pinned) : undefined;
  const shown = effective?.quotes.find((q) => q.provider === effective.provider) ?? effective?.quotes.find((q) => !q.refusal);
  const estimate = shown?.usd;

  const submit = async () => {
    if (!model || disabledReason || submitting) return;
    if (keyGate.askForKey(() => void submit())) return;
    let req: ImageGenerateRequest;
    if (upscaleMode) {
      if (!source) return;
      req = { prompt: "", model: model.id, aspectRatio: "auto", size: "1K", count: 1, referenceImages: [frameInput(source)] };
      if (sentFactor) req.upscale = sentFactor;
      if (sentCreative) req.creative = true;
    } else {
      req = { prompt: trimmed, model: model.id, aspectRatio, size, count };
      if (refs.length) req.referenceImages = refs.map(frameInput);
    }
    if (pinned) req.provider = pinned;
    setSubmitting(true);
    try {
      const res = await api.generateImage(req);
      useGenerations.getState().upsert(res.generations);
      toast.success(upscaleMode ? `Upscaling with ${model.name}…` : `Generating ${pluralize(res.generations.length, "image")}…`);
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
    const files = imageFilesFromDataTransfer(e.dataTransfer);
    void (upscaleMode ? setSourceFile(files) : addFiles(files));
  };

  // Upscalers have no prompt to paste into: an image pasted anywhere on the bar is the one to upscale.
  const onFormPaste = (e: ClipboardEvent<HTMLFormElement>) => {
    if (!upscaleMode) return;
    const files = imageFilesFromClipboard(e);
    if (!files.length) return;
    e.preventDefault();
    void setSourceFile(files);
  };

  const pick = async () => {
    const files = await pickImageFiles({ multiple: !upscaleMode });
    void (upscaleMode ? setSourceFile(files) : addFiles(files));
  };

  if (!model) return null;

  const modelMax = model.caps.maxReferenceImages;
  const addTooltip = upscaleMode
    ? "Choose the image to upscale"
    : editMode
      ? `Add the image to edit${modelMax > 1 ? ` (and up to ${modelMax - 1} more as references)` : ""}`
      : modelMax > 0
      ? `Add reference images (up to ${modelMax} for ${model.name})`
      : `${model.name} doesn't use reference images. Attach some, then switch model.`;
  const factors = model.caps.upscale?.factors ?? [];

  // An upscaler's scales: the size each gives, and its price where it would run.
  const scaleChip =
    factors.length > 1 ? (
      <Popover open={factorOpen} onOpenChange={setFactorOpen}>
        <PopoverTrigger asChild>
          <Chip icon={<ImageUpscale />} label={factorLabel(sentFactor)} aria-label={`Scale: ${factorLabel(sentFactor)}`} className="tabular-nums" />
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-[240px]">
          <PopoverLabel>Scale</PopoverLabel>
          <div role="listbox" aria-label="Scale">
            {factors.map((f) => {
              const q = quoteFor(f);
              const runs = q ? pinQuote(q, pinned) : undefined;
              const usd = runs?.quotes.find((x) => x.provider === runs.provider)?.usd;
              const out = source?.width && source.height ? `${Math.round(source.width * f)} × ${Math.round(source.height * f)}` : "";
              return (
                <PopoverItem
                  key={f}
                  selected={f === sentFactor}
                  onClick={() => {
                    setFactor(f);
                    setFactorOpen(false);
                  }}
                >
                  <span className="w-7 font-medium tabular-nums">{factorLabel(f)}</span>
                  <span className="flex-1 text-meta tabular-nums">{out}</span>
                  <span className="text-meta tabular-nums">{usd !== undefined ? formatUsd(usd, { approx: true }) : ""}</span>
                  {f === sentFactor ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
                </PopoverItem>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    ) : null;

  // An upscaler's creative mode (generative detail instead of a faithful upscale), for the ones that have it.
  const creativeChip = model.caps.upscale?.creative ? (
    <Chip
      icon={<Sparkles />}
      label="Creative"
      tone="accent"
      active={creative}
      aria-pressed={creative}
      onClick={() => setCreative((c) => !c)}
      title={creative ? "Creative: rebuilds detail, may change small things" : "Faithful: sharper, nothing new added"}
    />
  ) : null;

  return (
    <ComposerFrame
      onSubmit={onFormSubmit}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onFormPaste}
      aria-label={upscaleMode ? "Image upscale" : editMode ? "Image edit" : "Image prompt"}
      dragging={dragging}
      notice={notice ? <ComposerNotice message={notice.message} action={notice.action} onAction={notice.onAction} /> : null}
      addControl={
        <Tooltip content={addTooltip} side="top">
          <AddButton onClick={() => void pick()} aria-label={upscaleMode ? "Choose image" : editMode ? "Add image to edit" : "Add reference image"}>
            <Plus size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </AddButton>
        </Tooltip>
      }
      attachments={upscaleMode ? null : <AttachmentStrip items={refs} onRemove={removeRef} label={editMode ? "Image to edit" : "Reference images"} />}
      textarea={
        upscaleMode ? (
          <UpscaleDropZone
            kind="image"
            source={source ? { mediaId: source.mediaId, name: source.name, meta: sizeChange(source.width, source.height, sentFactor) } : null}
            dragging={dragging}
            onPick={() => void pick()}
            onRemove={() => setSource(null)}
          />
        ) : (
        <Textarea
          ref={textareaRef}
          unstyled
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={editMode ? (refCount ? "Say what to change: swap, add, remove, restyle…" : "Add an image with +, then say what to change…") : "Describe the image: subject, style, light, lens…"}
          aria-label="Prompt"
          maxLength={8000}
          minRows={1}
          maxRows={6}
          compactUntilFocus
          className={PROMPT_TEXTAREA_CLASS}
        />
        )
      }
      chips={
        <>
          <ModeModelChip>
            <ModeSwitch value={mode} onChange={(m) => switchMode(m)} label="Image mode" />
            <ChipSlash />
            <ModelPicker kind="image" mode={mode} value={model.id} onChange={(m) => pickModel(m.id)} disabledReason={modelReason}>
              <ModelChip model={model} reason={modelReason(model)} className={cn(CHIP_SEGMENT, "min-w-0")} />
            </ModelPicker>
          </ModeModelChip>

          {upscaleMode ? (
            <>
              {scaleChip}
              {creativeChip}
            </>
          ) : (
          <>
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
          )}
        </>
      }
      estimate={
        quote && quote.quotes.length > 1 ? (
          <ProviderPicker auto={quote} pinned={pinned} onPin={setPinned} />
        ) : estimate !== undefined ? (
          <CostEstimate usd={estimate} provider={shown?.provider} />
        ) : undefined
      }
      generate={{ disabledReason, submitting, reasonId }}
      className={cn(submitting && "cursor-progress")}
    />
  );
}
