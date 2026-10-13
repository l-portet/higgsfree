import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { AudioLines, Check, CircleAlert, Gem, ImagePlus, Images, Plus, SquareArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { Generation, VideoAspectRatio, VideoGenerateRequest, VideoModel, VideoResolution } from "@shared/types";
import { DEFAULT_VIDEO_MODEL, estimateVideoCost, snapDuration } from "@shared/models";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dragHasFiles, imageFilesFromClipboard, imageFilesFromDataTransfer, pickImageFiles } from "@/lib/files";
import { formatUsd, ratioLabel } from "@/lib/format";
import { frameFromMedia, frameInput, loadFrame, type Frame } from "@/lib/frames";
import { isVideoAspectRatio, isVideoResolution } from "@/lib/models";
import { readJson, writeJson } from "@/lib/storage";
import { useGenerations } from "@/store/generations";
import { useModels } from "@/store/models";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Chip, StaticChip } from "@/components/ui/Chip";
import { Popover, PopoverContent, PopoverItem, PopoverLabel, PopoverTrigger } from "@/components/ui/Popover";
import { Stepper } from "@/components/ui/Stepper";
import { Textarea } from "@/components/ui/Textarea";
import { Tooltip } from "@/components/ui/Tooltip";
import { ModelPicker } from "@/components/ModelPicker";
import { RatioGlyph } from "@/components/RatioGlyph";
import { DurationControl } from "@/components/video/DurationControl";
import { AddButton, AttachmentStrip, ComposerFrame, PROMPT_TEXTAREA_CLASS, type Attachment } from "./ComposerFrame";
import { ModelChip } from "./ModelChip";

const STORAGE_KEY = "higgsfree.video.panel";
const MAX_REFS = 4;
const MAX_COUNT = 4;

/** Shape written to localStorage; every field is untrusted on the way back in. */
interface Persisted {
  model?: string;
  /** True once the user chose a model here; until then Settings › Defaults applies. */
  pickedModel?: boolean;
  duration?: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  sound?: boolean;
  count?: number;
  prompt?: string;
}

function clampCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 1;
  return Math.min(MAX_COUNT, Math.max(1, v));
}

/** Coerce whatever is in localStorage into valid control values. */
function restore(models: VideoModel[]) {
  const p = readJson<Record<string, unknown>>(STORAGE_KEY, {});
  // The id is kept even when it is not in `models` yet: discovered models arrive with the fetch,
  // and the `model` memo falls back to the default until then.
  const pickedModel = p.pickedModel === true && typeof p.model === "string" && p.model.length > 0;
  const settingsDefault = useSettings.getState().settings?.defaults.videoModel;
  const fallback = settingsDefault && models.some((m) => m.id === settingsDefault) ? settingsDefault : DEFAULT_VIDEO_MODEL;
  return {
    pickedModel,
    model: pickedModel ? (p.model as string) : fallback,
    duration: typeof p.duration === "number" && Number.isFinite(p.duration) ? p.duration : 5,
    aspectRatio: isVideoAspectRatio(p.aspectRatio) ? p.aspectRatio : ("16:9" as VideoAspectRatio),
    resolution: isVideoResolution(p.resolution) ? p.resolution : undefined,
    sound: p.sound !== false,
    count: clampCount(p.count),
    prompt: typeof p.prompt === "string" ? p.prompt : "",
  };
}

/** All image inputs in one state object so a frame can be removed by id whichever slot it's in now. */
interface Frames {
  first: Frame | null;
  last: Frame | null;
  refs: Frame[];
}
const NO_FRAMES: Frames = { first: null, last: null, refs: [] };

type Slot = "first" | "last" | "ref";

/** Views that show video runs as they come in; from anywhere else a submit navigates to the Video view. */
const SHOWS_VIDEOS = /^\/(video|assets)(\/|$)/;

export function VideoComposer() {
  const models = useModels((s) => s.video);
  const defaultModel = useSettings((s) => s.settings?.defaults.videoModel);
  const hasKey = useSettings((s) => s.settings?.hasKey);
  const draft = useUi((s) => s.draft);
  const pendingFirstFrame = useUi((s) => s.pendingFirstFrame);
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const initial = useMemo(() => restore(models), [models]);
  const [pickedModel, setPickedModel] = useState(initial.pickedModel);
  const [modelId, setModelId] = useState<string>(initial.model);
  const [duration, setDuration] = useState<number>(initial.duration);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(initial.aspectRatio);
  const [resolution, setResolution] = useState<VideoResolution | undefined>(initial.resolution);
  const [sound, setSound] = useState<boolean>(initial.sound);
  const [count, setCount] = useState<number>(initial.count);
  const [prompt, setPrompt] = useState<string>(initial.prompt);
  const [frames, setFrames] = useState<Frames>(NO_FRAMES);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reasonId = useId();

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
    writeJson(STORAGE_KEY, { model: modelId, pickedModel, duration, aspectRatio, resolution, sound, count, prompt } satisfies Persisted);
  }, [modelId, pickedModel, duration, aspectRatio, resolution, sound, count, prompt]);

  // "Animate this image" hand-off from a card / the lightbox.
  useEffect(() => {
    if (!pendingFirstFrame) return;
    const mediaId = useUi.getState().consumePendingFirstFrame();
    if (!mediaId) return;
    setFrames((f) => ({ ...f, first: frameFromMedia(mediaId) }));
    toast.success("First frame added");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [pendingFirstFrame]);

  // "Reuse prompt" / example prompt hand-off.
  useEffect(() => {
    if (!draft || draft.type !== "video") return;
    useUi.getState().consumeDraft("video");
    setPrompt(draft.prompt);
    if (draft.model && models.some((m) => m.id === draft.model)) pickModel(draft.model);
    if (draft.params && !("size" in draft.params)) {
      setDuration(draft.params.duration);
      if (draft.params.aspectRatio) setAspectRatio(draft.params.aspectRatio);
      if (draft.params.resolution) setResolution(draft.params.resolution);
      if (draft.params.audio !== undefined) setSound(draft.params.audio);
    }
    setFrames((f) => ({
      first: draft.firstFrame ? frameFromMedia(draft.firstFrame) : f.first,
      last: draft.lastFrame ? frameFromMedia(draft.lastFrame) : f.last,
      refs: draft.referenceImages?.length ? draft.referenceImages.slice(0, MAX_REFS).map((id) => frameFromMedia(id)) : f.refs,
    }));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [draft, models]);

  // ---------- frames ----------

  const showLast = Boolean(model?.caps.lastFrame);
  // Style references are sent unless the model is known to reject `input_references`.
  const showRefs = model?.caps.references !== false;

  const addTo = useCallback(
    async (slot: Slot, files: File[]) => {
      if (slot === "ref") {
        const room = Math.max(0, MAX_REFS - refs.length);
        if (files.length > room) toast.error(`Up to ${MAX_REFS} style references`);
        for (const file of files.slice(0, room)) {
          const frame = await loadFrame(file);
          if (frame) setFrames((f) => (f.refs.length >= MAX_REFS ? f : { ...f, refs: [...f.refs, frame] }));
        }
        return;
      }
      const file = files[0];
      if (!file) return;
      const frame = await loadFrame(file);
      if (!frame) return;
      setFrames((f) => (slot === "first" ? { ...f, first: frame } : { ...f, last: frame }));
    },
    [refs.length],
  );

  /** Dropped / pasted images: fill the first frame, then the last frame (if the model takes one), then references. */
  const addSmart = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const queue = [...files];
      if (!firstFrame) {
        const f = queue.shift();
        if (f) await addTo("first", [f]);
      }
      if (queue.length && showLast && !lastFrame) {
        const f = queue.shift();
        if (f) await addTo("last", [f]);
      }
      if (queue.length) {
        if (showRefs) await addTo("ref", queue);
        else toast.error(`${model?.name ?? "This model"} takes a first frame${showLast ? " and a last frame" : ""} only`);
      }
    },
    [addTo, firstFrame, lastFrame, model?.name, showLast, showRefs],
  );

  const pickFor = async (slot: Slot) => {
    setAddOpen(false);
    const files = await pickImageFiles({ multiple: slot === "ref" });
    void addTo(slot, files);
  };

  const removeAttachment = (id: string) =>
    setFrames((f) => ({
      first: f.first?.id === id ? null : f.first,
      last: f.last?.id === id ? null : f.last,
      refs: f.refs.filter((x) => x.id !== id),
    }));

  const attachments: Attachment[] = [
    ...(firstFrame ? [{ id: firstFrame.id, mediaId: firstFrame.mediaId, name: firstFrame.name, tag: "1st" }] : []),
    ...(lastFrame && showLast ? [{ id: lastFrame.id, mediaId: lastFrame.mediaId, name: lastFrame.name, tag: "Last" }] : []),
    ...(showRefs ? refs.map((r) => ({ id: r.id, mediaId: r.mediaId, name: r.name, tag: "Ref" })) : []),
  ];

  // ---------- validation ----------

  // Image-to-video exactly when a frame is attached (a last frame counts only for models that take one).
  const frameAttached = Boolean(firstFrame || (showLast && lastFrame));
  const i2v = frameAttached;
  const trimmed = prompt.trim();
  const missingKey = hasKey === false;

  const modelReason = useCallback(
    (m: VideoModel): string | null => {
      if (i2v && !m.caps.imageToVideo) return `${m.name} doesn't support image-to-video`;
      if (!i2v && !m.caps.textToVideo) return `${m.name} needs a first frame. Add one with +`;
      return null;
    },
    [i2v],
  );

  const disabledReason: string | null = !model
    ? "No video models available"
    : missingKey
      ? "Add your OpenRouter key first"
      : (modelReason(model) ?? (!i2v && !trimmed ? "Enter a prompt" : null));

  const estimateFor = useCallback(
    (d: number) => (model ? estimateVideoCost(model, d, resolution) : undefined),
    [model, resolution],
  );
  const perClip = estimateFor(duration);
  const estimate = perClip !== undefined ? perClip * count : undefined;

  const submit = async () => {
    if (missingKey) {
      useUi.getState().openKeyDialog();
      return;
    }
    if (!model || disabledReason || submitting) return;
    const req: VideoGenerateRequest = { prompt: trimmed, model: model.id, duration };
    if (resolution && model.resolutions.includes(resolution)) req.resolution = resolution;
    if (!(model.omitAspectRatioOnI2v && frameAttached)) req.aspectRatio = aspectRatio;
    if (model.caps.audio) req.audio = sound;
    if (firstFrame) req.firstFrame = frameInput(firstFrame);
    if (lastFrame && showLast) req.lastFrame = frameInput(lastFrame);
    if (refs.length && showRefs) req.references = refs.map(frameInput);
    setSubmitting(true);
    try {
      // `count` clips are `count` independent jobs: one request each, in parallel.
      const results = await Promise.allSettled(Array.from({ length: count }, () => api.generateVideo(req)));
      const done: Generation[] = [];
      let failure: unknown;
      for (const r of results) {
        if (r.status === "fulfilled") done.push(...r.value.generations);
        else failure ??= r.reason;
      }
      if (done.length) useGenerations.getState().upsert(done);
      if (done.length === 0) throw failure ?? new Error("Generation failed");
      if (failure) toast.error(`Only ${done.length} of ${count} started`, { description: describeApiError(failure) });
      else toast.success(count > 1 ? `Rendering ${count} clips with ${model.name}…` : `Rendering with ${model.name}…`, { description: "Usually 2–5 min. You can keep working in the app meanwhile." });
      if (SHOWS_VIDEOS.test(pathname)) window.scrollTo({ top: 0, behavior: "smooth" });
      else router.push("/video");
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

  // ⌘/Ctrl+Enter lives on the textarea only (see ImageComposer).
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
    void addSmart(files);
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
    void addSmart(imageFilesFromDataTransfer(e.dataTransfer));
  };

  if (!model) return null;

  // Locked exactly when `submit` omits the ratio: a frame is attached, not merely planned.
  const arLocked = frameAttached && Boolean(model.omitAspectRatioOnI2v);
  // No resolution list (discovered models): the provider picks, so there is no chip to show.
  const noRes = model.resolutions.length === 0;
  const singleRes = model.resolutions.length === 1;
  const faceWarning = model.caps.realFaces === false && Boolean(firstFrame);

  return (
    <ComposerFrame
      onSubmit={onFormSubmit}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Video prompt"
      dragging={dragging}
      addControl={
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <Tooltip content="Add a first frame, last frame or style reference" side="top">
            <PopoverTrigger asChild>
              <AddButton aria-label="Add image">
                <Plus size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              </AddButton>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent side="top" align="start" className="w-[232px]">
            <PopoverLabel>Add image</PopoverLabel>
            <PopoverItem onClick={() => void pickFor("first")}>
              <ImagePlus size={15} className="text-fg-muted" aria-hidden="true" />
              <span className="flex-1">{firstFrame ? "Replace first frame" : "First frame"}</span>
            </PopoverItem>
            {showLast ? (
              <PopoverItem onClick={() => void pickFor("last")}>
                <SquareArrowRight size={15} className="text-fg-muted" aria-hidden="true" />
                <span className="flex-1">{lastFrame ? "Replace last frame" : "Last frame"}</span>
              </PopoverItem>
            ) : null}
            {showRefs ? (
              <PopoverItem onClick={() => void pickFor("ref")} disabled={refs.length >= MAX_REFS}>
                <Images size={15} className="text-fg-muted" aria-hidden="true" />
                <span className="flex-1">Style reference</span>
                <span className="text-caption tabular-nums">{refs.length}/{MAX_REFS}</span>
              </PopoverItem>
            ) : null}
            <p className="px-2 pb-1 pt-1.5 text-caption">Or drop / paste images anywhere on the bar.</p>
          </PopoverContent>
        </Popover>
      }
      attachments={<AttachmentStrip items={attachments} onRemove={removeAttachment} label="Attached images" />}
      textarea={
        <Textarea
          ref={textareaRef}
          unstyled
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={i2v ? "Describe the motion and camera (optional)…" : "Describe the shot: motion, camera, scene…"}
          aria-label="Prompt"
          maxLength={8000}
          minRows={1}
          maxRows={6}
          className={PROMPT_TEXTAREA_CLASS}
        />
      }
      note={
        faceWarning ? (
          <p className="flex items-center gap-1.5 text-caption" role="note">
            <CircleAlert size={12} className="shrink-0 text-danger" aria-hidden="true" />
            {model.name} rejects recognizable real faces.{" "}
            <button type="button" onClick={() => pickModel("kwaivgi/kling-v3.0-pro")} className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg">
              Kling 3.0 Pro
            </button>{" "}
            and{" "}
            <button type="button" onClick={() => pickModel("minimax/hailuo-3")} className="font-medium text-fg-muted underline underline-offset-2 hover:text-fg">
              Hailuo 3
            </button>{" "}
            accept them.
          </p>
        ) : null
      }
      chips={
        <>
          <ModelPicker kind="video" value={model.id} onChange={(m) => pickModel(m.id)} disabledReason={modelReason}>
            <ModelChip model={model} reason={modelReason(model)} />
          </ModelPicker>

          {arLocked ? (
            <StaticChip icon={<RatioGlyph ratio={aspectRatio} />} label={aspectRatio} title="Aspect ratio follows the first frame" className="tabular-nums" />
          ) : (
            <Popover open={arOpen} onOpenChange={setArOpen}>
              <PopoverTrigger asChild>
                <Chip icon={<RatioGlyph ratio={aspectRatio} />} label={aspectRatio} aria-label={`Aspect ratio: ${aspectRatio}`} className="tabular-nums" />
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="max-h-[360px] w-[200px] overflow-y-auto">
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

          <DurationControl model={model} value={duration} onChange={setDuration} estimateFor={estimateFor} chevron={false} />

          {noRes ? null : singleRes ? (
            <StaticChip icon={<Gem size={15} />} label={resolution ?? "Auto"} title={`${resolution ?? "Default"} is the only resolution for ${model.name}`} />
          ) : (
            <Popover open={resOpen} onOpenChange={setResOpen}>
              <PopoverTrigger asChild>
                <Chip icon={<Gem size={15} />} label={resolution ?? "Auto"} aria-label={`Resolution: ${resolution ?? "auto"}`} className="tabular-nums" />
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-[220px]">
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

          {model.caps.audio ? (
            <Chip
              icon={<AudioLines />}
              label="Sound"
              tone="accent"
              active={sound}
              aria-pressed={sound}
              onClick={() => setSound((s) => !s)}
              title={sound ? "Native audio on" : "Native audio off"}
            />
          ) : null}

          <Stepper value={count} min={1} max={MAX_COUNT} onChange={setCount} label="Number of videos" />
        </>
      }
      estimate={estimate !== undefined ? formatUsd(estimate, { approx: true }) : undefined}
      generate={{ disabledReason, submitting, reasonId, onClick: missingKey ? () => useUi.getState().openKeyDialog() : undefined }}
      className={cn(submitting && "cursor-progress")}
    />
  );
}
