import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { AudioLines, Check, CircleAlert, Clock, Film, Gem, ImageIcon, ImagePlus, Images, Plus, Sparkles, SquareArrowRight, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { Generation, MotionOrientation, VideoAspectRatio, VideoGenerateRequest, VideoModel, VideoResolution } from "@shared/types";
import { DEFAULT_VIDEO_EDIT_MODEL, DEFAULT_VIDEO_MODEL, editedLength, snapDuration } from "@shared/models";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dragHasFiles, imageFilesFromClipboard, imageFilesFromDataTransfer, pickImageFiles, pickVideoFiles, videoFilesFromDataTransfer } from "@/lib/files";
import { formatSeconds, formatUsd, ratioLabel } from "@/lib/format";
import { frameFromMedia, frameInput, loadFrame, type Frame } from "@/lib/frames";
import { ownerGenerationId } from "@/lib/media-ids";
import { editSourceHint, isVideoAspectRatio, isVideoResolution } from "@/lib/models";
import { readJson, writeJson } from "@/lib/storage";
import { uid } from "@/lib/uid";
import { sourceVideoProblem } from "@/lib/validate";
import { PROVIDER_IDS } from "@/lib/providers";
import { quoteVideo, shownQuote, type VideoQuote } from "@/lib/video-cost";
import { readVideoDuration } from "@/lib/video-meta";
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
import { AddButton, AttachmentStrip, ComposerFrame, ComposerNotice, PROMPT_TEXTAREA_CLASS, type Attachment } from "./ComposerFrame";
import { CostEstimate, VideoCostBreakdown } from "./CostEstimate";
import { PromptEditorDialog } from "./PromptEditorDialog";
import { useKeyGate } from "./useKeyGate";
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
  /** Motion control: whose orientation the character keeps. */
  orientation?: MotionOrientation;
  /** The last video editor picked here: "Edit video" on a clip comes back to it. */
  editModel?: string;
}

/** Motion control's two orientations, with fal's cap on the reference video for each. */
const ORIENTATIONS: { value: MotionOrientation; label: string; hint: string }[] = [
  { value: "video", label: "Follow video", hint: "Up to 30 s" },
  { value: "image", label: "Follow image", hint: "Up to 10 s" },
];

function clampCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 1;
  return Math.min(MAX_COUNT, Math.max(1, v));
}

/** Coerce whatever is in localStorage into valid control values. */
function restore() {
  const p = readJson<Record<string, unknown>>(STORAGE_KEY, {});
  // The id is kept even when it is not in `models` yet: discovered models arrive with the fetch,
  // and the `model` memo falls back to the default until then.
  // The last model picked here comes back; the app's default otherwise.
  const pickedModel = p.pickedModel === true && typeof p.model === "string" && p.model.length > 0;
  return {
    pickedModel,
    model: pickedModel ? (p.model as string) : DEFAULT_VIDEO_MODEL,
    duration: typeof p.duration === "number" && Number.isFinite(p.duration) ? p.duration : 5,
    aspectRatio: isVideoAspectRatio(p.aspectRatio) ? p.aspectRatio : ("16:9" as VideoAspectRatio),
    resolution: isVideoResolution(p.resolution) ? p.resolution : undefined,
    sound: p.sound !== false,
    count: clampCount(p.count),
    prompt: typeof p.prompt === "string" ? p.prompt : "",
    orientation: (p.orientation === "image" ? "image" : "video") as MotionOrientation,
    editModel: typeof p.editModel === "string" && p.editModel.length > 0 ? p.editModel : DEFAULT_VIDEO_EDIT_MODEL,
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

/** The input video (motion control's reference, or the video being edited): a media id in the library (never persisted). */
interface VideoClip {
  id: string;
  name: string;
  mediaId: string;
  /** Its length in seconds, when known: the clip's length, which prices the run. */
  durationSec?: number;
  bytes?: number;
}

/** A library video as an input. Another record's output brings its length and size; an upload's are checked at submit. */
function clipFromMedia(mediaId: string, name = "video"): VideoClip {
  const owner = ownerGenerationId(mediaId);
  const out = owner ? useGenerations.getState().byId[owner]?.output : undefined;
  return { id: uid(), name, mediaId, durationSec: out?.durationSec, bytes: out?.bytes };
}

/** Views that show video runs as they come in; from anywhere else a submit navigates to the Video view. */
const SHOWS_VIDEOS = /^\/(video|assets)(\/|$)/;

export function VideoComposer() {
  const models = useModels((s) => s.video);
  const draft = useUi((s) => s.draft);
  const pendingFirstFrame = useUi((s) => s.pendingFirstFrame);
  const pendingSourceVideo = useUi((s) => s.pendingSourceVideo);
  // A string, so the selector's value only changes when a key is added or removed.
  const keyed = useSettings((s) => PROVIDER_IDS.filter((p) => s.settings?.keys[p]).join(","));
  const preferred = useSettings((s) => s.settings?.preferredProvider ?? "openrouter");
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  // Read once: the saved controls only seed the initial state.
  const initial = useMemo(() => restore(), []);
  const [pickedModel, setPickedModel] = useState(initial.pickedModel);
  const [modelId, setModelId] = useState<string>(initial.model);
  const [duration, setDuration] = useState<number>(initial.duration);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(initial.aspectRatio);
  const [resolution, setResolution] = useState<VideoResolution | undefined>(initial.resolution);
  const [sound, setSound] = useState<boolean>(initial.sound);
  const [count, setCount] = useState<number>(initial.count);
  const [prompt, setPrompt] = useState<string>(initial.prompt);
  const [frames, setFrames] = useState<Frames>(NO_FRAMES);
  // Kept while another model is selected, so switching back to a motion or edit model restores it.
  const [clip, setClip] = useState<VideoClip | null>(null);
  const [orientation, setOrientation] = useState<MotionOrientation>(initial.orientation);
  const [editModelId, setEditModelId] = useState<string>(initial.editModel);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const [orientOpen, setOrientOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reasonId = useId();

  const { first: firstFrame, last: lastFrame, refs } = frames;

  const model: VideoModel | undefined = useMemo(
    () => models.find((m) => m.id === modelId) ?? models.find((m) => m.id === DEFAULT_VIDEO_MODEL) ?? models[0],
    [models, modelId],
  );
  /** Motion control: a character image (the first frame) and a reference video instead of frames and references. */
  const motionMode = Boolean(model?.caps.motionControl);
  /** Video editing: one video and a prompt saying what to change; nothing else is sent. */
  const editMode = Boolean(model?.caps.videoEdit);

  const pickModel = (id: string) => {
    setPickedModel(true);
    setModelId(id);
  };

  // Snap duration / aspect ratio / resolution to what the selected model supports. Motion control
  // uses none of them (the clip follows the reference video), and video editing only the resolution
  // (the clip keeps the source's length and framing), so the rest is left as it was.
  useEffect(() => {
    if (!model || model.caps.motionControl) return;
    setResolution((r) => (r && model.resolutions.includes(r) ? r : (model.defaultResolution ?? model.resolutions[0])));
    if (model.caps.videoEdit) {
      setEditModelId(model.id);
      return;
    }
    setDuration((d) => snapDuration(model, Number.isFinite(d) ? d : model.defaultDuration));
    setAspectRatio((ar) =>
      model.aspectRatios.includes(ar) ? ar : model.aspectRatios.includes("16:9") ? "16:9" : (model.aspectRatios[0] ?? "16:9"),
    );
  }, [model]);

  // Persist the last-used controls.
  useEffect(() => {
    writeJson(STORAGE_KEY, { model: modelId, pickedModel, duration, aspectRatio, resolution, sound, count, prompt, orientation, editModel: editModelId } satisfies Persisted);
  }, [modelId, pickedModel, duration, aspectRatio, resolution, sound, count, prompt, orientation, editModelId]);

  // "Animate this image" hand-off from a card / the lightbox. An editor takes no frame: back to the default model.
  useEffect(() => {
    if (!pendingFirstFrame) return;
    const mediaId = useUi.getState().consumePendingFirstFrame();
    if (!mediaId) return;
    setFrames((f) => ({ ...f, first: frameFromMedia(mediaId) }));
    if (editMode) pickModel(DEFAULT_VIDEO_MODEL);
    toast.success(motionMode ? "Character image added" : "First frame added");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [pendingFirstFrame, motionMode, editMode]);

  // "Edit this video" hand-off from a card / the lightbox: onto the last editor used here (or the default one).
  useEffect(() => {
    if (!pendingSourceVideo) return;
    const mediaId = useUi.getState().consumePendingSourceVideo();
    if (!mediaId) return;
    setClip(clipFromMedia(mediaId, "video to edit"));
    if (!editMode) pickModel(models.some((m) => m.id === editModelId && m.caps.videoEdit) ? editModelId : DEFAULT_VIDEO_EDIT_MODEL);
    toast.success("Video added", { description: "Say what to change, then Generate." });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [pendingSourceVideo, editMode, editModelId, models]);

  // "Reuse prompt" / example prompt hand-off.
  useEffect(() => {
    if (!draft || draft.type !== "video") return;
    useUi.getState().consumeDraft("video");
    setPrompt(draft.prompt);
    if (draft.model && models.some((m) => m.id === draft.model)) pickModel(draft.model);
    const params = draft.params && !("size" in draft.params) ? draft.params : undefined;
    // A motion-control or edit run's duration is its input video's length (0 until it finished): not a setting to bring back.
    const videoDraft = Boolean(draft.motionVideo || draft.sourceVideo) || params?.orientation !== undefined;
    if (params && !videoDraft) {
      setDuration(params.duration);
      if (params.aspectRatio) setAspectRatio(params.aspectRatio);
      if (params.resolution) setResolution(params.resolution);
      if (params.audio !== undefined) setSound(params.audio);
    } else if (params?.resolution) setResolution(params.resolution);
    const orient = draft.orientation ?? params?.orientation;
    if (orient) setOrientation(orient);
    setFrames((f) => ({
      first: draft.firstFrame ? frameFromMedia(draft.firstFrame) : f.first,
      last: draft.lastFrame ? frameFromMedia(draft.lastFrame) : f.last,
      refs: draft.referenceImages?.length ? draft.referenceImages.slice(0, MAX_REFS).map((id) => frameFromMedia(id)) : f.refs,
    }));
    if (draft.motionVideo) setClip(clipFromMedia(draft.motionVideo));
    else if (draft.sourceVideo) setClip(clipFromMedia(draft.sourceVideo, "video to edit"));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [draft, models]);

  // ---------- frames ----------

  const showLast = !motionMode && !editMode && Boolean(model?.caps.lastFrame);
  // Style references are sent unless the model is known to reject `input_references`.
  const showRefs = !motionMode && !editMode && model?.caps.references !== false;

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

  /** Store an input video (MP4 / MOV / WebM, sniffed and size-checked by the library). */
  const addClip = useCallback(async (file: File) => {
    try {
      const [res, durationSec] = await Promise.all([api.uploadVideo(file), readVideoDuration(file)]);
      setClip({ id: uid(), name: file.name, mediaId: res.media.id, durationSec, bytes: res.media.bytes });
    } catch (err) {
      toast.error("Couldn't add the video", { description: describeApiError(err) });
    }
  }, []);

  /**
   * Dropped / pasted files. Video editing: one video. Motion control: an image is the character, a video the motion.
   * Otherwise images fill the first frame, then the last frame (if the model takes one), then references.
   */
  const addSmart = useCallback(
    async (files: File[], videos: File[] = []) => {
      if (editMode) {
        const [video, ...moreVideos] = videos;
        if (files.length || moreVideos.length) toast.error(`${model?.name ?? "Video editing"} takes one video to edit`);
        if (video) await addClip(video);
        return;
      }
      if (motionMode) {
        const [image, ...moreImages] = files;
        const [video, ...moreVideos] = videos;
        if (moreImages.length || moreVideos.length) toast.error("Motion control takes one character image and one reference video");
        if (image) await addTo("first", [image]);
        if (video) await addClip(video);
        return;
      }
      if (videos.length) toast.error("Only motion control and video editing models take a video");
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
    [addClip, addTo, editMode, firstFrame, lastFrame, model?.name, motionMode, showLast, showRefs],
  );

  const pickFor = async (slot: Slot) => {
    setAddOpen(false);
    const files = await pickImageFiles({ multiple: slot === "ref" });
    void addTo(slot, files);
  };

  const pickClip = async () => {
    setAddOpen(false);
    const [file] = await pickVideoFiles();
    if (file) await addClip(file);
  };

  const removeAttachment = (id: string) => {
    setClip((c) => (c?.id === id ? null : c));
    setFrames((f) => ({
      first: f.first?.id === id ? null : f.first,
      last: f.last?.id === id ? null : f.last,
      refs: f.refs.filter((x) => x.id !== id),
    }));
  };

  const attachments: Attachment[] = editMode
    ? clip
      ? [{ id: clip.id, mediaId: clip.mediaId, name: clip.name, tag: "Source", kind: "video" as const }]
      : []
    : motionMode
    ? [
        ...(firstFrame ? [{ id: firstFrame.id, mediaId: firstFrame.mediaId, name: "character image" }] : []),
        ...(clip ? [{ id: clip.id, mediaId: clip.mediaId, name: clip.name, tag: "Motion", kind: "video" as const }] : []),
      ]
    : [
        ...(firstFrame ? [{ id: firstFrame.id, mediaId: firstFrame.mediaId, name: firstFrame.name, tag: "1st" }] : []),
        ...(lastFrame && showLast ? [{ id: lastFrame.id, mediaId: lastFrame.mediaId, name: lastFrame.name, tag: "Last" }] : []),
        ...(showRefs ? refs.map((r) => ({ id: r.id, mediaId: r.mediaId, name: r.name, tag: "Ref" })) : []),
      ];

  // ---------- validation ----------

  // Video editing: the attached video's length or size is outside the model's limits (when known).
  const editProblem = editMode && model && clip ? sourceVideoProblem(model, clip.durationSec, clip.bytes) : undefined;

  // Image-to-video exactly when a frame is attached (a last frame counts only for models that take one).
  const frameAttached = Boolean(firstFrame || (showLast && lastFrame));
  const i2v = frameAttached;
  const trimmed = prompt.trim();
  // Generate stays clickable without a key: it opens the key dialog for the model's provider.
  const keyGate = useKeyGate(model);
  const notice = keyGate.notice;

  const modelReason = useCallback(
    (m: VideoModel): string | null => {
      // Motion control takes the attached image as its character, video editing a video: neither needs anything picked.
      if (m.caps.motionControl || m.caps.videoEdit) return null;
      if (i2v && !m.caps.imageToVideo) return `${m.name} doesn't support image-to-video`;
      if (!i2v && !m.caps.textToVideo) return `${m.name} needs a first frame. Add one with +`;
      return null;
    },
    [i2v],
  );

  const disabledReason: string | null = !model
    ? "No video models available"
    : editMode
      ? !clip
        ? "Add a video to edit"
        : !trimmed
          ? "Say what to change"
          : (editProblem ?? null)
      : motionMode
          ? !firstFrame
            ? "Add a character image"
            : !clip
              ? "Add a reference video"
              : null
          : (modelReason(model) ?? (!i2v && !trimmed ? "Enter a prompt" : null));

  // Each provider's price for this request (OpenRouter's from the catalog, fal's list prices for the endpoint the
  // inputs pick), and who runs it: the cheaper one that can, as the engine decides. Motion control and editing
  // are priced by the input video's length, once it is known.
  const hasFirst = Boolean(firstFrame);
  const hasLast = showLast && Boolean(lastFrame);
  const hasRefs = showRefs && refs.length > 0;
  const clipSec = clip?.durationSec;
  const quoteAt = useCallback(
    (d: number, r: VideoResolution | undefined): VideoQuote | undefined =>
      model
        ? quoteVideo(
            model,
            { prompt: trimmed, duration: d, resolution: r, aspectRatio, audio: model.caps.audio ? sound : undefined, firstFrame: hasFirst, lastFrame: hasLast, references: hasRefs, videoSec: clipSec },
            Object.fromEntries(PROVIDER_IDS.map((p) => [p, keyed.split(",").includes(p)])),
            preferred,
          )
        : undefined,
    [model, trimmed, aspectRatio, sound, hasFirst, hasLast, hasRefs, clipSec, keyed, preferred],
  );
  const estimateAt = useCallback((d: number, r: VideoResolution | undefined) => {
    const q = quoteAt(d, r);
    return q ? shownQuote(q)?.usd : undefined;
  }, [quoteAt]);
  const estimateFor = useCallback((d: number) => estimateAt(d, resolution), [estimateAt, resolution]);
  const quote = quoteAt(duration, resolution);
  const shown = quote ? shownQuote(quote) : undefined;
  const estimate = shown?.usd !== undefined ? shown.usd * count : undefined;

  const submit = async () => {
    if (!model || disabledReason || submitting) return;
    if (keyGate.askForKey(() => void submit())) return;
    let req: VideoGenerateRequest;
    if (editMode) {
      if (!clip) return;
      // `duration` is required by the type and ignored: the clip keeps the source's length.
      req = { prompt: trimmed, model: model.id, duration: 5, sourceVideo: clip.mediaId };
      if (resolution && model.resolutions.includes(resolution)) req.resolution = resolution;
    } else if (motionMode) {
      if (!firstFrame || !clip) return;
      // `duration` is required by the type and ignored: the clip follows the reference video.
      req = { prompt: trimmed, model: model.id, duration: 5, firstFrame: frameInput(firstFrame), motionVideo: clip.mediaId, orientation };
    } else {
      req = { prompt: trimmed, model: model.id, duration };
      if (resolution && model.resolutions.includes(resolution)) req.resolution = resolution;
      if (!(model.omitAspectRatioOnI2v && frameAttached)) req.aspectRatio = aspectRatio;
      if (model.caps.audio) req.audio = sound;
      if (firstFrame) req.firstFrame = frameInput(firstFrame);
      if (lastFrame && showLast) req.lastFrame = frameInput(lastFrame);
      if (refs.length && showRefs) req.references = refs.map(frameInput);
    }
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
    void addSmart(imageFilesFromDataTransfer(e.dataTransfer), videoFilesFromDataTransfer(e.dataTransfer));
  };

  if (!model) return null;

  // Locked exactly when `submit` omits the ratio: a frame is attached, not merely planned.
  const arLocked = frameAttached && Boolean(model.omitAspectRatioOnI2v);
  // No resolution list (discovered models): the provider picks, so there is no chip to show.
  const noRes = model.resolutions.length === 0;
  const singleRes = model.resolutions.length === 1;
  const faceWarning = model.caps.realFaces === false && Boolean(firstFrame);
  const orientationLabel = orientation === "image" ? "Follow image" : "Follow video";
  // Video editing: how long the edit will be, once the source's length is known (a model may keep only its start).
  const editSec = editMode && clipSec !== undefined ? editedLength(model, clipSec) : undefined;
  const editCut = editSec !== undefined && clipSec !== undefined && editSec < clipSec - 0.05;
  const editHint = editMode ? editSourceHint(model) : undefined;

  const resolutionChip = noRes ? null : singleRes ? (
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
            const est = estimateAt(duration, r);
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
  );

  return (
    <>
    <ComposerFrame
      onSubmit={onFormSubmit}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Video prompt"
      dragging={dragging}
      notice={notice ? <ComposerNotice message={notice.message} action={notice.action} onAction={notice.onAction} /> : null}
      addControl={
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <Tooltip
            content={editMode ? "Add the video to edit" : motionMode ? "Add a character image or a reference video" : "Add a first frame, last frame or style reference"}
            side="top"
          >
            <PopoverTrigger asChild>
              <AddButton aria-label={editMode ? "Add video" : motionMode ? "Add image or video" : "Add image"}>
                <Plus size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              </AddButton>
            </PopoverTrigger>
          </Tooltip>
          {editMode ? (
            <PopoverContent side="top" align="start" className="w-[232px]">
              <PopoverLabel>Video editing</PopoverLabel>
              <PopoverItem onClick={() => void pickClip()}>
                <Film size={15} className="text-fg-muted" aria-hidden="true" />
                <span className="flex-1">{clip ? "Replace video" : "Video to edit"}</span>
              </PopoverItem>
              <p className="px-2 pb-1 pt-1.5 text-caption">{editHint ? `${editHint} ` : ""}Or drop a video anywhere on the bar.</p>
            </PopoverContent>
          ) : motionMode ? (
            <PopoverContent side="top" align="start" className="w-[232px]">
              <PopoverLabel>Motion control</PopoverLabel>
              <PopoverItem onClick={() => void pickFor("first")}>
                <UserRound size={15} className="text-fg-muted" aria-hidden="true" />
                <span className="flex-1">{firstFrame ? "Replace character image" : "Character image"}</span>
              </PopoverItem>
              <PopoverItem onClick={() => void pickClip()}>
                <Film size={15} className="text-fg-muted" aria-hidden="true" />
                <span className="flex-1">{clip ? "Replace reference video" : "Reference video"}</span>
              </PopoverItem>
              <p className="px-2 pb-1 pt-1.5 text-caption">Or drop an image and a video anywhere on the bar.</p>
            </PopoverContent>
          ) : (
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
          )}
        </Popover>
      }
      attachments={
        <AttachmentStrip items={attachments} onRemove={removeAttachment} label={editMode ? "Attached video" : motionMode ? "Attached inputs" : "Attached images"} />
      }
      textarea={
        <Textarea
          ref={textareaRef}
          unstyled
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            editMode
              ? "Say what to change: swap, add, remove, restyle…"
              : motionMode
                ? "Describe the scene or style (optional)…"
                : i2v
                  ? "Describe the motion and camera (optional)…"
                  : "Describe the shot: motion, camera, scene…"
          }
          aria-label="Prompt"
          maxLength={8000}
          minRows={1}
          maxRows={6}
          compactUntilFocus
          className={PROMPT_TEXTAREA_CLASS}
        />
      }
      secondaryControl={
        // The prompt editor (rewrite the prompt with an LLM, preview the shot, use it): a sparkle square under the "+".
        <Tooltip content="Prompt Editor: rewrite with AI, preview the shot" side="right">
          <AddButton aria-label="Prompt Editor" onClick={() => setEditorOpen(true)}>
            <Sparkles size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </AddButton>
        </Tooltip>
      }
      note={
        editProblem ? (
          <p className="flex items-center gap-1.5 text-caption" role="note">
            <CircleAlert size={12} className="shrink-0 text-danger" aria-hidden="true" />
            {editProblem}
          </p>
        ) : editCut && editSec !== undefined && clipSec !== undefined ? (
          <p className="flex items-center gap-1.5 text-caption" role="note">
            <CircleAlert size={12} className="shrink-0 text-fg-muted" aria-hidden="true" />
            {model.name} edits the first {formatSeconds(editSec)} of this {formatSeconds(clipSec)} video.
          </p>
        ) : faceWarning ? (
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

          {editMode ? (
            <>
              {editSec !== undefined ? (
                <StaticChip icon={<Clock size={15} />} label={formatSeconds(editSec)} title="The edit is as long as the video" />
              ) : null}
              {resolutionChip}
            </>
          ) : motionMode ? (
            <Popover open={orientOpen} onOpenChange={setOrientOpen}>
              <PopoverTrigger asChild>
                <Chip
                  icon={orientation === "image" ? <ImageIcon /> : <Film />}
                  label={orientationLabel}
                  aria-label={`Character orientation: ${orientationLabel}`}
                />
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-[248px]">
                <div role="listbox" aria-label="Character orientation">
                  <PopoverLabel>Character orientation</PopoverLabel>
                  {ORIENTATIONS.map((o) => (
                    <PopoverItem
                      key={o.value}
                      selected={o.value === orientation}
                      onClick={() => {
                        setOrientation(o.value);
                        setOrientOpen(false);
                      }}
                    >
                      {o.value === "image" ? (
                        <ImageIcon size={15} className="text-fg-muted" aria-hidden="true" />
                      ) : (
                        <Film size={15} className="text-fg-muted" aria-hidden="true" />
                      )}
                      <span className="flex-1">{o.label}</span>
                      <span className="text-caption tabular-nums">{o.hint}</span>
                      {o.value === orientation ? <Check size={14} className="text-accent" aria-hidden="true" /> : null}
                    </PopoverItem>
                  ))}
                </div>
                <p className="px-2 pb-1 pt-1.5 text-caption">The reference video sets the clip length.</p>
              </PopoverContent>
            </Popover>
          ) : (
            <>
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

            {resolutionChip}

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
            </>
          )}

          <Stepper value={count} min={1} max={MAX_COUNT} onChange={setCount} label="Number of videos" />

        </>
      }
      estimate={
        estimate !== undefined ? (
          <CostEstimate usd={estimate} provider={shown?.provider} breakdown={quote ? <VideoCostBreakdown quote={quote} count={count} preferred={preferred} /> : undefined} />
        ) : undefined
      }
      generate={{ disabledReason, submitting, reasonId }}
      className={cn(submitting && "cursor-progress")}
    />
    {/* Beside the form, not in it: React events bubble out of portals, so a submit or a drop in the dialog would reach the composer. */}
    <PromptEditorDialog
      open={editorOpen}
      onOpenChange={setEditorOpen}
      prompt={prompt}
      context={{
        modelName: model.name,
        duration: motionMode || editMode ? undefined : duration,
        aspectRatio: motionMode || editMode ? undefined : aspectRatio,
        startsFromImage: !editMode && Boolean(firstFrame),
        motionControl: motionMode,
        videoEdit: editMode,
      }}
      aspectRatio={motionMode || editMode ? undefined : aspectRatio}
      firstFrame={firstFrame && !editMode ? frameInput(firstFrame) : undefined}
      onUse={(p) => {
        setPrompt(p);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }}
    />
    </>
  );
}
