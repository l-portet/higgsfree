import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Gem,
  UserCheck,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import type { VideoAspectRatio, VideoGenerateRequest, VideoModel, VideoResolution } from "@shared/types";
import { DEFAULT_VIDEO_MODEL, estimateVideoCost, snapDuration } from "@shared/models";
import { cn } from "@/lib/cn";
import { describeApiError } from "@/lib/api";
import { imageFilesFromClipboard } from "@/lib/files";
import { formatUsd, isMac, ratioLabel } from "@/lib/format";
import { frameFromUrl, frameInput, loadFrame, type Frame } from "@/lib/frames";
import { useMediaQuery } from "@/lib/hooks";
import { isVideoAspectRatio, isVideoResolution, modelMeta } from "@/lib/models";
import { readJson, writeJson } from "@/lib/storage";
import { useModels } from "@/store/models";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Button } from "@/components/ui/Button";
import { Chip, StaticChip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { Kbd } from "@/components/ui/Kbd";
import { Popover, PopoverContent, PopoverItem, PopoverLabel, PopoverTrigger } from "@/components/ui/Popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { Tooltip } from "@/components/ui/Tooltip";
import { ModelPicker } from "@/components/ModelPicker";
import { ProviderTile } from "@/components/ProviderTile";
import { RatioGlyph } from "@/components/RatioGlyph";
import { DurationControl } from "./DurationControl";
import { FrameSlot, ReferenceStrip } from "./FrameSlot";

const STORAGE_KEY = "oh.video.panel";
const MAX_REFS = 4;

/** Camera chips: each one appends a phrase to the prompt and stays active while that phrase is present. */
const CAMERA_PRESETS: { label: string; phrase: string }[] = [
  { label: "Slow push-in", phrase: "slow push-in on the subject" },
  { label: "Orbit", phrase: "camera orbits around the subject" },
  { label: "Handheld", phrase: "handheld camera with a subtle shake" },
  { label: "Static", phrase: "static locked-off camera" },
  { label: "Dolly out", phrase: "slow dolly out revealing the scene" },
  { label: "Crane up", phrase: "crane shot rising over the scene" },
];

function hasPhrase(prompt: string, phrase: string): boolean {
  return prompt.toLowerCase().includes(phrase);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Append `phrase` after a comma, or remove it (with the separator before it) when it is already there. */
function togglePhrase(prompt: string, phrase: string): string {
  if (hasPhrase(prompt, phrase)) {
    return prompt
      .replace(new RegExp(`(?:,\\s*|\\s+)?${escapeRegExp(phrase)}`, "i"), "")
      .replace(/^[\s,]+/, "")
      .trimEnd();
  }
  const base = prompt.trimEnd();
  if (!base) return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return /[.,;:!?]$/.test(base) ? `${base} ${phrase}` : `${base}, ${phrase}`;
}

export type VideoMode = "t2v" | "i2v";

/** Shape written to localStorage; every field is untrusted on the way back in. */
interface Persisted {
  model?: string;
  /** True once the user chose a model here; until then Settings › Defaults applies. */
  pickedModel?: boolean;
  mode?: VideoMode;
  duration?: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  prompt?: string;
}

/** Coerce whatever is in localStorage into valid control values. */
function restore(models: VideoModel[]) {
  const p = readJson<Record<string, unknown>>(STORAGE_KEY, {});
  // The id is kept even when it is not in `models` yet: discovered models arrive with the fetch,
  // and the `model` memo falls back to the default until then.
  const pickedModel = p.pickedModel === true && typeof p.model === "string" && p.model.length > 0;
  // Seed from Settings › Defaults when they are already loaded; the effect that follows them would
  // otherwise swap the model in one render later, flashing the catalog default first.
  const settingsDefault = useSettings.getState().settings?.defaults.videoModel;
  const fallback = settingsDefault && models.some((m) => m.id === settingsDefault) ? settingsDefault : DEFAULT_VIDEO_MODEL;
  return {
    pickedModel,
    model: pickedModel ? (p.model as string) : fallback,
    mode: p.mode === "i2v" ? ("i2v" as VideoMode) : ("t2v" as VideoMode),
    duration: typeof p.duration === "number" && Number.isFinite(p.duration) ? p.duration : 5,
    aspectRatio: isVideoAspectRatio(p.aspectRatio) ? p.aspectRatio : ("16:9" as VideoAspectRatio),
    resolution: isVideoResolution(p.resolution) ? p.resolution : undefined,
    prompt: typeof p.prompt === "string" ? p.prompt : "",
  };
}

/** All image inputs in one state object so an upload can settle by id whichever slot it's in now. */
interface Frames {
  first: Frame | null;
  last: Frame | null;
  refs: Frame[];
}
const NO_FRAMES: Frames = { first: null, last: null, refs: [] };

function Section({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface p-3", className)}>
      {title ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-label">{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface VideoPanelProps {
  onSubmit: (req: VideoGenerateRequest) => Promise<void> | void;
  className?: string;
}

export function VideoPanel({ onSubmit, className }: VideoPanelProps) {
  const models = useModels((s) => s.video);
  const defaultModel = useSettings((s) => s.settings?.defaults.videoModel);
  const hasKey = useSettings((s) => s.settings?.hasKey);
  const server = useSettings((s) => s.server);
  const draft = useUi((s) => s.draft);
  const pendingFirstFrame = useUi((s) => s.pendingFirstFrame);
  // The panel becomes a column at md; open the picker beside it from there on.
  const wide = useMediaQuery("(min-width: 768px)");

  const initial = useMemo(() => restore(models), [models]);
  const [pickedModel, setPickedModel] = useState(initial.pickedModel);
  const [mode, setMode] = useState<VideoMode>(initial.mode);
  const [modelId, setModelId] = useState<string>(initial.model);
  const [duration, setDuration] = useState<number>(initial.duration);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(initial.aspectRatio);
  const [resolution, setResolution] = useState<VideoResolution | undefined>(initial.resolution);
  const [prompt, setPrompt] = useState<string>(initial.prompt);
  const [frames, setFrames] = useState<Frames>(NO_FRAMES);
  const [refsOpen, setRefsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reasonId = useId();
  const cameraId = useId();

  const { first: firstFrame, last: lastFrame, refs } = frames;

  const model: VideoModel | undefined = useMemo(
    () => models.find((m) => m.id === modelId) ?? models.find((m) => m.id === DEFAULT_VIDEO_MODEL) ?? models[0],
    [models, modelId],
  );

  const pickModel = (id: string) => {
    setPickedModel(true);
    setModelId(id);
  };

  // Follow Settings › Defaults (including later changes) until the user picks a model here.
  useEffect(() => {
    if (pickedModel || !defaultModel) return;
    if (models.some((m) => m.id === defaultModel)) setModelId(defaultModel);
  }, [defaultModel, models, pickedModel]);

  // Snap duration / aspect ratio / resolution to what the selected model supports.
  useEffect(() => {
    if (!model) return;
    setDuration((d) => snapDuration(model, Number.isFinite(d) ? d : model.defaultDuration));
    setAspectRatio((ar) =>
      model.aspectRatios.includes(ar) ? ar : model.aspectRatios.includes("16:9") ? "16:9" : (model.aspectRatios[0] ?? "16:9"),
    );
    setResolution((r) => (r && model.resolutions.includes(r) ? r : (model.defaultResolution ?? model.resolutions[0])));
  }, [model]);

  // Persist the last-used controls.
  useEffect(() => {
    writeJson(STORAGE_KEY, { model: modelId, pickedModel, mode, duration, aspectRatio, resolution, prompt } satisfies Persisted);
  }, [modelId, pickedModel, mode, duration, aspectRatio, resolution, prompt]);

  // "Animate this image" hand-off from the image page / lightbox.
  useEffect(() => {
    if (!pendingFirstFrame) return;
    const url = useUi.getState().consumePendingFirstFrame();
    if (!url) return;
    setFrames((f) => ({ ...f, first: frameFromUrl(url) }));
    setMode("i2v");
    toast.success("First frame added");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [pendingFirstFrame]);

  // "Reuse prompt" hand-off.
  useEffect(() => {
    if (!draft || draft.type !== "video") return;
    useUi.getState().consumeDraft("video");
    setPrompt(draft.prompt);
    if (draft.model && models.some((m) => m.id === draft.model)) pickModel(draft.model);
    if (draft.params && !("size" in draft.params)) {
      setDuration(draft.params.duration);
      if (draft.params.aspectRatio) setAspectRatio(draft.params.aspectRatio);
      if (draft.params.resolution) setResolution(draft.params.resolution);
    }
    setFrames((f) => ({
      first: draft.firstFrame ? frameFromUrl(draft.firstFrame) : f.first,
      last: draft.lastFrame ? frameFromUrl(draft.lastFrame) : f.last,
      refs: draft.referenceImages?.length ? draft.referenceImages.slice(0, MAX_REFS).map(frameFromUrl) : f.refs,
    }));
    if (draft.referenceImages?.length) setRefsOpen(true);
    setMode(draft.firstFrame || draft.lastFrame ? "i2v" : "t2v");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [draft, models]);

  // ---------- frames ----------

  /** An upload finished: replace the frame with the same id wherever it lives now (it may have been swapped). */
  const settle = useCallback(
    (u: Frame) =>
      setFrames((f) => ({
        first: f.first?.id === u.id ? u : f.first,
        last: f.last?.id === u.id ? u : f.last,
        refs: f.refs.map((x) => (x.id === u.id ? u : x)),
      })),
    [],
  );

  const addFirst = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const frame = await loadFrame(file, settle);
      if (!frame) return;
      setFrames((f) => ({ ...f, first: frame }));
      setMode("i2v");
    },
    [settle],
  );

  const addLast = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const frame = await loadFrame(file, settle);
      if (frame) setFrames((f) => ({ ...f, last: frame }));
    },
    [settle],
  );

  const addRefs = useCallback(
    async (files: File[]) => {
      const room = Math.max(0, MAX_REFS - refs.length);
      if (files.length > room) toast.error(`Up to ${MAX_REFS} style references`);
      for (const file of files.slice(0, room)) {
        const frame = await loadFrame(file, settle);
        if (frame) setFrames((f) => (f.refs.length >= MAX_REFS ? f : { ...f, refs: [...f.refs, frame] }));
      }
    },
    [refs.length, settle],
  );

  const swapFrames = () => setFrames((f) => ({ ...f, first: f.last, last: f.first }));
  const removeFirst = () => setFrames((f) => ({ ...f, first: null }));
  const removeLast = () => setFrames((f) => ({ ...f, last: null }));
  const removeRef = (id: string) => setFrames((f) => ({ ...f, refs: f.refs.filter((x) => x.id !== id) }));

  // Pasting an image anywhere in the panel (e.g. into the prompt) attaches it as the first frame.
  const onPanelPaste = (e: ClipboardEvent<HTMLFormElement>) => {
    const files = imageFilesFromClipboard(e);
    if (!files.length) return;
    e.preventDefault();
    void addFirst(files);
  };

  // ---------- validation ----------

  const i2v = mode === "i2v";
  const showLast = Boolean(model?.caps.lastFrame);
  // Style references are sent unless the model is known to reject `input_references`.
  const showRefs = model?.caps.references !== false;
  const frameAttached = i2v && Boolean(firstFrame || (showLast && lastFrame));
  const anchorsUploading = Boolean(firstFrame?.uploading || lastFrame?.uploading);
  // Only inputs this mode submits can hold Generate: t2v sends no images, and the last frame only when the model takes one.
  const uploading =
    i2v && Boolean(firstFrame?.uploading || (showLast && lastFrame?.uploading) || (showRefs && refs.some((r) => r.uploading)));
  const trimmed = prompt.trim();

  const modelReason = useCallback(
    (m: VideoModel): string | null => {
      if (i2v && !m.caps.imageToVideo) return `${m.name} doesn't support image-to-video`;
      if (!i2v && !m.caps.textToVideo) return `${m.name} is image-to-video only. Switch to Image to Video.`;
      return null;
    },
    [i2v],
  );

  const disabledReason: string | null = !model
    ? "No video models available"
    : server === "offline"
      ? "Server unreachable"
      : hasKey === false
        ? "Add your OpenRouter key in Settings"
        : (modelReason(model) ??
          (i2v && !firstFrame
            ? "Add a first frame"
            : !i2v && !trimmed
              ? "Enter a prompt"
              : uploading
                ? "Uploading images…"
                : null));

  const estimateFor = useCallback(
    (d: number) => (model ? estimateVideoCost(model, d, resolution) : undefined),
    [model, resolution],
  );
  const estimate = estimateFor(duration);

  const submit = async () => {
    if (!model || disabledReason || submitting) return;
    const req: VideoGenerateRequest = { prompt: trimmed, model: model.id, duration };
    if (resolution && model.resolutions.includes(resolution)) req.resolution = resolution;
    if (!(model.omitAspectRatioOnI2v && frameAttached)) req.aspectRatio = aspectRatio;
    if (model.caps.audio) req.audio = true;
    if (i2v) {
      if (firstFrame) req.firstFrame = frameInput(firstFrame);
      if (lastFrame && showLast) req.lastFrame = frameInput(lastFrame);
      if (refs.length && showRefs) req.references = refs.map(frameInput);
    }
    setSubmitting(true);
    try {
      await onSubmit(req);
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

  // ⌘/Ctrl+Enter lives on the prompt textarea only. On the <form> it would also catch React-bubbled
  // keystrokes from the portaled model picker and submit with a stale closure (the previous model).
  const onPromptKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  if (!model) return null;

  // Locked exactly when `submit` omits the ratio: a frame is attached, not merely the i2v tab.
  const arLocked = frameAttached && Boolean(model.omitAspectRatioOnI2v);
  // No resolution list (discovered models): the provider picks, so there is no chip to show.
  const noRes = model.resolutions.length === 0;
  const singleRes = model.resolutions.length === 1;
  const faceWarning = model.caps.realFaces === false && i2v && Boolean(firstFrame);

  // The three option chips share one row of equal cells (87 px at 300, 81 px at 280). That leaves
  // room for icon + label only: a chevron would truncate "16:9" and "1080p", so none are drawn and the
  // padding is trimmed at md where "1080p" is 2 px too wide at the default.
  const cellChip = "w-full px-2.5 md:max-lg:px-2";

  const arChip = (
    <Chip
      icon={<RatioGlyph ratio={aspectRatio} />}
      label={aspectRatio}
      disabled={arLocked}
      aria-label={arLocked ? `Aspect ratio follows the first frame` : `Aspect ratio: ${aspectRatio}`}
      className={cn(cellChip, "tabular-nums")}
    />
  );

  return (
    <form
      onSubmit={onFormSubmit}
      onPaste={onPanelPaste}
      aria-label="Video settings"
      className={cn("flex flex-col gap-2.5", className)}
    >
      <Tabs value={mode} onValueChange={(v) => setMode(v === "i2v" ? "i2v" : "t2v")}>
        <TabsList variant="segmented" aria-label="Mode" className="w-full">
          <TabsTrigger value="t2v">Text to Video</TabsTrigger>
          <TabsTrigger value="i2v">Image to Video</TabsTrigger>
        </TabsList>
      </Tabs>

      {i2v ? (
        <Section title="References">
          <div className="flex flex-col gap-2">
            <FrameSlot
              label="First frame"
              hint="Drop, paste or click · PNG, JPG, WebP"
              frame={firstFrame}
              onFiles={(f) => void addFirst(f)}
              onRemove={removeFirst}
              actions={
                showLast ? (
                  <IconButton
                    label={lastFrame ? "Swap first and last frame" : "Use as last frame"}
                    size="sm"
                    variant="overlay"
                    onClick={swapFrames}
                    disabled={anchorsUploading}
                  >
                    <ArrowLeftRight />
                  </IconButton>
                ) : null
              }
            />
            {showLast ? (
              <FrameSlot
                variant="compact"
                label="Last frame"
                hint="Optional · where the clip ends"
                frame={lastFrame}
                onFiles={(f) => void addLast(f)}
                onRemove={removeLast}
              />
            ) : null}

            {showRefs ? (
              <div>
                <button
                  type="button"
                  onClick={() => setRefsOpen((o) => !o)}
                  aria-expanded={refsOpen}
                  aria-controls="video-style-refs"
                  className="-mx-1 flex h-7 items-center gap-1 rounded-sm px-1 text-meta transition-colors duration-150 hover:text-fg"
                >
                  <ChevronRight
                    size={14}
                    className={cn("text-fg-faint transition-transform duration-150", refsOpen && "rotate-90")}
                    aria-hidden="true"
                  />
                  {refs.length ? `Style references (${refs.length})` : "Add style references"}
                </button>
                {refsOpen ? (
                  <div id="video-style-refs" className="mt-1.5">
                    <ReferenceStrip refs={refs} max={MAX_REFS} onFiles={(f) => void addRefs(f)} onRemove={removeRef} />
                    <p className="mt-1.5 text-caption">Up to {MAX_REFS} style or character images. They don't lock a frame.</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="Prompt" aside={i2v ? <span className="text-caption">Optional</span> : null}>
        <Textarea
          ref={textareaRef}
          unstyled
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onPromptKeyDown}
          placeholder="Describe the motion, camera and scene…"
          aria-label="Prompt"
          maxLength={8000}
          minRows={3}
          maxRows={10}
          className="text-body"
        />
        <div className="mt-3">
          <div id={cameraId} className="text-label">
            Camera
          </div>
          <div role="group" aria-labelledby={cameraId} className="mt-1.5 flex flex-wrap gap-1.5">
            {CAMERA_PRESETS.map(({ label, phrase }) => {
              const on = hasPhrase(prompt, phrase);
              return (
                <Chip
                  key={label}
                  size="sm"
                  label={label}
                  active={on}
                  aria-pressed={on}
                  onClick={() => setPrompt((p) => togglePhrase(p, phrase))}
                />
              );
            })}
          </div>
        </div>
      </Section>

      <Section title="Model">
        <ModelPicker
          kind="video"
          value={model.id}
          onChange={(m) => pickModel(m.id)}
          disabledReason={modelReason}
          side={wide ? "right" : "bottom"}
          align="start"
        >
          <button
            type="button"
            aria-label={`Model: ${model.name}`}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md border border-border bg-surface-2 p-2 text-left",
              "transition-colors duration-150 hover:border-border-strong hover:bg-surface-3",
              "data-[state=open]:border-border-strong data-[state=open]:bg-surface-3",
              modelReason(model) && "border-danger/40",
            )}
          >
            <ProviderTile provider={model.provider} size={32} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={cn("truncate text-[13px] font-medium", modelReason(model) ? "text-danger" : "text-fg")}>{model.name}</span>
                {model.caps.audio ? <Volume2 size={13} className="shrink-0 text-fg-muted" role="img" aria-label="Native audio" /> : null}
              </span>
              <span className="block truncate text-caption tabular-nums">{modelMeta(model)}</span>
            </span>
            <ChevronDown size={14} className="shrink-0 text-fg-faint transition-transform duration-150 [[data-state=open]_&]:rotate-180" aria-hidden="true" />
          </button>
        </ModelPicker>

        <div className={cn("mt-2.5 grid gap-1.5", noRes ? "grid-cols-2" : "grid-cols-3")}>
          <DurationControl model={model} value={duration} onChange={setDuration} estimateFor={estimateFor} chevron={false} className={cellChip} />

          {arLocked ? (
            <Tooltip content="Aspect ratio follows the first frame">
              <span className="inline-flex min-w-0" tabIndex={-1}>
                {arChip}
              </span>
            </Tooltip>
          ) : (
            <Popover open={arOpen} onOpenChange={setArOpen}>
              <PopoverTrigger asChild>{arChip}</PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="max-h-[360px] w-[200px] overflow-y-auto">
                <div role="listbox" aria-label="Aspect ratio">
                  <PopoverLabel>Aspect ratio</PopoverLabel>
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
                      <span className="flex-1 tabular-nums">{ar}</span>
                      <span className="text-caption">{ratioLabel(ar)}</span>
                      {ar === aspectRatio ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
                    </PopoverItem>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {noRes ? null : singleRes ? (
            <StaticChip
              icon={<Gem size={15} />}
              label={resolution ?? "Auto"}
              title={`${resolution ?? "Default"} is the only resolution for ${model.name}`}
              className={cellChip}
            />
          ) : (
            <Popover open={resOpen} onOpenChange={setResOpen}>
              <PopoverTrigger asChild>
                <Chip
                  icon={<Gem size={15} />}
                  label={resolution ?? "Auto"}
                  aria-label={`Resolution: ${resolution ?? "auto"}`}
                  className={cn(cellChip, "tabular-nums")}
                />
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="w-[220px]">
                <div role="listbox" aria-label="Resolution">
                  <PopoverLabel>Resolution</PopoverLabel>
                  {model.resolutions.map((r) => {
                    const est = estimateVideoCost(model, duration, r);
                    return (
                      <PopoverItem
                        key={r}
                        selected={r === resolution}
                        onClick={() => {
                          setResolution(r);
                          setResOpen(false);
                        }}
                      >
                        <span className="w-12 font-medium tabular-nums">{r}</span>
                        <span className="flex-1 text-meta tabular-nums">{est !== undefined ? formatUsd(est, { approx: true }) : ""}</span>
                        {r === resolution ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
                      </PopoverItem>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {model.caps.audio || model.caps.realFaces === true ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
            {model.caps.audio ? (
              <span className="inline-flex items-center gap-1">
                <Volume2 size={12} aria-hidden="true" />
                Native audio
              </span>
            ) : null}
            {model.caps.realFaces === true ? (
              <span className="inline-flex items-center gap-1">
                <UserCheck size={12} aria-hidden="true" />
                Real faces OK
              </span>
            ) : null}
          </div>
        ) : null}

        {faceWarning ? (
          <div className="mt-2.5 flex gap-2 rounded-sm border border-danger/25 bg-danger/5 p-2.5 text-meta" role="note">
            <CircleAlert size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
            <p>
              This model rejects recognizable real faces. Try{" "}
              <button type="button" onClick={() => pickModel("kwaivgi/kling-v3.0-pro")} className="font-medium text-fg underline decoration-fg-faint underline-offset-2 hover:decoration-fg">
                Kling 3.0 Pro
              </button>{" "}
              or{" "}
              <button type="button" onClick={() => pickModel("minimax/hailuo-3")} className="font-medium text-fg underline decoration-fg-faint underline-offset-2 hover:decoration-fg">
                Hailuo 3
              </button>
              .
            </p>
          </div>
        ) : null}
      </Section>

      <div className="flex flex-col gap-2">
        {/* `aria-disabled` (not `disabled`) keeps Generate focusable so the reason reaches keyboard / AT users. */}
        <Tooltip content={disabledReason} side="top">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            aria-disabled={disabledReason ? true : undefined}
            aria-describedby={disabledReason ? reasonId : undefined}
            className="w-full h-11 text-[14px] font-semibold"
          >
            Generate
            {estimate !== undefined ? (
              <span className="ml-0.5 text-[12px] font-medium tabular-nums text-on-accent/60">{formatUsd(estimate, { approx: true })}</span>
            ) : null}
          </Button>
        </Tooltip>
        {disabledReason ? (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        ) : null}
        <div className="flex items-center justify-center gap-1 text-caption" aria-hidden="true">
          <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>↵</Kbd>
          <span className="ml-0.5">to generate</span>
        </div>
        {estimate === undefined ? <p className="text-center text-caption">Price shown after render.</p> : null}
        {model.discovered ? (
          <p className="text-center text-caption">New on OpenRouter, limits not verified yet.</p>
        ) : !model.verified ? (
          <p className="text-center text-caption">Option ranges are best-effort. Provider errors are shown verbatim.</p>
        ) : null}
      </div>
    </form>
  );
}
