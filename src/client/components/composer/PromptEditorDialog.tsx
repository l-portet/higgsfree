import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { CircleAlert, Clapperboard, FileVideo, ImageIcon, RefreshCw, Sparkles, Undo2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { VideoAspectRatio } from "@shared/types";
import * as api from "@/lib/api";
import { ApiClientError, describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dragHasFiles, pickVideoFiles, videoFilesFromDataTransfer } from "@/lib/files";
import { formatBytes, formatUsd } from "@/lib/format";
import { useReturnFocus } from "@/lib/hooks";
import {
  MAX_PROMPT_CHARS,
  MAX_RECREATE_VIDEO_BYTES,
  PREVIEW_IMAGE_MODEL,
  PROMPT_EDITOR_MODEL,
  RECREATE_MODEL,
  previewAspect,
  type RewriteContext,
} from "@/lib/prompt-editor";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";

/** One click, one rewrite: the asks people make most. */
const SUGGESTIONS = ["More cinematic", "Add camera motion", "More detail", "Make it shorter"] as const;

type Mode = "rewrite" | "recreate";

const MODES: { id: Mode; label: string; icon: typeof Sparkles }[] = [
  { id: "rewrite", label: "Rewrite", icon: Sparkles },
  { id: "recreate", label: "Recreate video", icon: Clapperboard },
];

export interface PromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The composer's prompt when the dialog opens. */
  prompt: string;
  /** What the composer is set to, so the rewrite fits the run. */
  context: RewriteContext;
  aspectRatio?: VideoAspectRatio;
  /** Media id of the attached first frame (or character image): the preview's reference. */
  firstFrame?: string;
  /** "Use prompt". */
  onUse: (prompt: string) => void;
}

interface Preview {
  dataUrl: string;
  costUsd?: number;
  /** The prompt it was made from, to say when it no longer matches. */
  prompt: string;
}

/** The video to recreate: the picked file and an object url for the player. */
interface SourceVideo {
  file: File;
  url: string;
}

/** Who wrote the prompt in the field last, for the line under it. */
interface Written {
  model: string;
  costUsd?: number;
  fromVideo?: boolean;
}

const KEY_REASON = "The AI Prompt Editor runs on OpenRouter.";
const MAX_VIDEO_LABEL = `${Math.round(MAX_RECREATE_VIDEO_BYTES / 1024 / 1024)} MB`;

/** True when an OpenRouter key is stored; otherwise opens the key dialog, which runs `retry` once the key is saved. */
function haveKey(retry: () => void): boolean {
  if (useSettings.getState().settings?.hasKey) return true;
  useUi.getState().openKeyDialog({ provider: "openrouter", reason: KEY_REASON, onSaved: retry });
  return false;
}

const isCancel = (err: unknown): boolean => err instanceof ApiClientError && err.status === 499;

/** The first video in a drop, after the size check; null (with a toast) when there is none. */
function videoFromDrop(dt: DataTransfer | null): File | null {
  const [file] = videoFilesFromDataTransfer(dt);
  if (!file) {
    toast.error("Drop a video: MP4, MOV or WebM");
    return null;
  }
  return file;
}

/** The video to recreate: a drop zone / picker, then the clip in a player with Replace and Remove. */
function VideoSource({ video, onPick, onClear, disabled }: { video: SourceVideo | null; onPick: (file: File) => void; onClear: () => void; disabled: boolean }) {
  const [over, setOver] = useState(false);
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!over) setOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOver(false);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    if (disabled) return;
    const file = videoFromDrop(e.dataTransfer);
    if (file) onPick(file);
  };
  const pick = async () => {
    const [file] = await pickVideoFiles();
    if (file) onPick(file);
  };

  if (video) {
    return (
      <div onDragOver={onDragOver} onDragEnter={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={cn("rounded-card transition-shadow", over && "ring-2 ring-accent/50")}>
        <video
          key={video.url}
          src={video.url}
          controls
          muted
          playsInline
          preload="metadata"
          aria-label={video.file.name}
          className="max-h-[300px] w-full rounded-card border border-border bg-black object-contain"
        />
        <div className="mt-2 flex items-center justify-between gap-2 text-meta">
          <span className="min-w-0 truncate" title={video.file.name}>
            {video.file.name}
          </span>
          <span className="shrink-0 tabular-nums">{formatBytes(video.file.size)}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Button size="sm" variant="secondary" leftIcon={<Upload />} onClick={() => void pick()} disabled={disabled}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" leftIcon={<X />} onClick={onClear} disabled={disabled}>
            Remove
          </Button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void pick()}
      disabled={disabled}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed p-4 text-center",
        "transition-colors duration-150 disabled:opacity-50",
        over ? "border-accent/70 bg-accent/5" : "border-border-strong bg-inset hover:border-fg-faint hover:bg-surface-2",
      )}
    >
      <FileVideo size={22} strokeWidth={1.5} className="mb-1 text-fg-faint" aria-hidden="true" />
      <span className="text-body text-fg">Drop a video, or choose one</span>
      <span className="text-caption">MP4, MOV or WebM, up to {MAX_VIDEO_LABEL}</span>
    </button>
  );
}

/**
 * The video composer's prompt editor, in two modes. Rewrite: an LLM rewrites the prompt (streamed into the
 * field, with Undo) and a fast image model previews a still of the shot. Recreate video: a video model watches
 * a clip you drop in and writes the prompt that recreates it, with your instructions. "Use prompt" hands the
 * text back. Every call runs on OpenRouter with the user's key and shows its real cost; nothing is saved.
 */
export function PromptEditorDialog({ open, onOpenChange, prompt, context, aspectRatio, firstFrame, onUse }: PromptEditorDialogProps) {
  const focus = useReturnFocus();
  const [mode, setMode] = useState<Mode>("rewrite");
  const [draft, setDraft] = useState(prompt);
  const [history, setHistory] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState<Written | null>(null);
  const [writeError, setWriteError] = useState<string | undefined>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>();
  const [video, setVideo] = useState<SourceVideo | null>(null);
  const writeAbort = useRef<AbortController | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const instructionRef = useRef<HTMLInputElement>(null);

  // Each opening starts from the composer's prompt, in Rewrite; closing cancels whatever is still running.
  useEffect(() => {
    if (open) {
      setMode("rewrite");
      setDraft(prompt);
      setHistory([]);
      setInstruction("");
      setWritten(null);
      setWriteError(undefined);
      setPreview(null);
      setPreviewError(undefined);
      setVideo(null);
      return;
    }
    writeAbort.current?.abort();
    previewAbort.current?.abort();
    // `prompt` is read once per opening, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The player's object url lives as long as the video is picked.
  useEffect(() => {
    if (!video) return;
    return () => URL.revokeObjectURL(video.url);
  }, [video]);

  const trimmed = draft.trim();
  const recreate = mode === "recreate";
  const busy = writing || previewing;
  const ratio = previewAspect(aspectRatio);
  const [rw, rh] = ratio.split(":").map(Number);
  const portrait = (rw ?? 16) < (rh ?? 9);

  /** One streamed write into the field, whichever model does it; the text before it goes on the Undo stack. */
  const write = async (run: (signal: AbortSignal) => Promise<{ prompt: string; costUsd?: number }>, model: string, fromVideo: boolean) => {
    const before = draft;
    const controller = new AbortController();
    writeAbort.current = controller;
    setWriting(true);
    setWriteError(undefined);
    try {
      const res = await run(controller.signal);
      setDraft(res.prompt);
      setHistory((h) => [...h, before]);
      setWritten({ model, costUsd: res.costUsd, fromVideo });
      setInstruction("");
      void useSettings.getState().refreshCredits();
    } catch (err) {
      setDraft(before);
      if (!isCancel(err)) setWriteError(describeApiError(err));
    } finally {
      setWriting(false);
      if (writeAbort.current === controller) writeAbort.current = null;
      // The field was disabled while it ran: hand the caret back for the next change.
      if (!controller.signal.aborted) requestAnimationFrame(() => instructionRef.current?.focus());
    }
  };

  const rewrite = (ask: string) => {
    if (writing) return;
    if (!haveKey(() => rewrite(ask))) return;
    void write((signal) => api.rewriteVideoPrompt({ prompt: draft, instruction: ask, context }, { signal, onText: setDraft }), PROMPT_EDITOR_MODEL.name, false);
  };

  const describe = (ask: string) => {
    if (writing || !video) return;
    if (!haveKey(() => describe(ask))) return;
    void write((signal) => api.recreateVideoPrompt({ file: video.file, instruction: ask, context }, { signal, onText: setDraft }), RECREATE_MODEL.name, true);
  };

  const pickVideo = (file: File) => {
    if (file.size > MAX_RECREATE_VIDEO_BYTES) {
      toast.error(`Video is over ${MAX_VIDEO_LABEL}`, { description: "Trim or compress it first." });
      return;
    }
    setWriteError(undefined);
    setVideo({ file, url: URL.createObjectURL(file) });
  };

  const undo = () => {
    const prev = history.at(-1);
    if (prev === undefined) return;
    setHistory((h) => h.slice(0, -1));
    setDraft(prev);
    setWritten(null);
  };

  const makePreview = async () => {
    if (previewing || !trimmed) return;
    if (!haveKey(() => void makePreview())) return;
    const controller = new AbortController();
    previewAbort.current = controller;
    setPreviewing(true);
    setPreviewError(undefined);
    try {
      const res = await api.previewVideoFrame({ prompt: trimmed, aspectRatio, firstFrame }, { signal: controller.signal });
      setPreview({ dataUrl: res.dataUrl, costUsd: res.costUsd, prompt: trimmed });
      void useSettings.getState().refreshCredits();
    } catch (err) {
      if (!isCancel(err)) setPreviewError(describeApiError(err));
    } finally {
      setPreviewing(false);
      if (previewAbort.current === controller) previewAbort.current = null;
    }
  };

  const onInstructionSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Never let it reach a form the dialog is rendered under (React events bubble out of portals).
    e.stopPropagation();
    if (recreate) describe(instruction);
    else rewrite(instruction);
  };

  // A video dropped anywhere on the dialog (not only the zone) is taken in Recreate; a stray drop never opens the file in the tab.
  const onDialogDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (dragHasFiles(e.dataTransfer)) e.preventDefault();
  };
  const onDialogDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (!recreate || writing) return;
    const file = videoFromDrop(e.dataTransfer);
    if (file) pickVideo(file);
  };

  const use = () => {
    if (!trimmed || writing) return;
    onUse(trimmed);
    onOpenChange(false);
  };

  const stale = preview !== null && preview.prompt !== trimmed;

  const statusLine = writing
    ? recreate
      ? `${RECREATE_MODEL.name} is watching the video…`
      : `${PROMPT_EDITOR_MODEL.name} is rewriting…`
    : written
      ? `${written.fromVideo ? "Written from the video" : "Rewritten"} by ${written.model}${written.costUsd !== undefined ? ` · ${formatUsd(written.costUsd)}` : ""}`
      : recreate
        ? "Pick a video on the right, then ask for its prompt."
        : "Edit it yourself, or ask for a change below.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        onOpenAutoFocus={(e) => {
          focus.onOpenAutoFocus();
          // Start in the ask field: the prompt is already there, the change is what to type.
          e.preventDefault();
          instructionRef.current?.focus();
        }}
        onCloseAutoFocus={focus.onCloseAutoFocus}
        onDragOver={onDialogDragOver}
        onDragEnter={onDialogDragOver}
        onDrop={onDialogDrop}
        className="flex max-h-[calc(100dvh-32px)] flex-col overflow-hidden p-0"
      >
        <div className="px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" aria-hidden="true" />
            AI Prompt Editor
          </DialogTitle>
          <DialogDescription>
            Rewrite the prompt with {PROMPT_EDITOR_MODEL.name} and preview a frame with {PREVIEW_IMAGE_MODEL.name}, or write one from a video with{" "}
            {RECREATE_MODEL.name}. All run on your OpenRouter key.
          </DialogDescription>
          <div role="group" aria-label="Mode" className="mt-3 flex w-fit gap-0.5 rounded-control border border-border bg-surface-2 p-1">
            {MODES.map((m) => {
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  disabled={writing}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-tag px-3 text-[13px] font-medium transition-colors duration-150",
                    "disabled:pointer-events-none disabled:opacity-50",
                    active ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  <m.icon size={14} className={active ? "text-fg" : "text-fg-subtle"} aria-hidden="true" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 pb-5 md:grid-cols-[minmax(0,1fr)_300px]">
          {/* ---------- the prompt ---------- */}
          <section className="flex min-w-0 flex-col" aria-label="Prompt">
            <div className="mb-1.5 flex h-7 items-center justify-between gap-2">
              <label htmlFor="prompt-editor-draft" className="text-label">
                Prompt
              </label>
              {history.length > 0 ? (
                <Button size="sm" variant="ghost" leftIcon={<Undo2 />} onClick={undo} disabled={writing} className="-mr-2">
                  Undo
                </Button>
              ) : null}
            </div>
            <Textarea
              id="prompt-editor-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={writing}
              aria-busy={writing || undefined}
              placeholder={recreate ? "The prompt that recreates the video lands here." : "Describe the shot, or ask the AI below to write one."}
              maxLength={MAX_PROMPT_CHARS}
              minRows={6}
              maxRows={12}
              className={cn("text-[14px] leading-[22px]", writing && "text-fg-muted")}
            />
            <p className="mt-1.5 min-h-[17px] text-meta tabular-nums" aria-live="polite">
              {statusLine}
            </p>
            {writeError ? (
              <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-control border border-danger/25 bg-danger/5 p-2.5 text-meta">
                <CircleAlert size={14} className="mt-px shrink-0 text-danger" aria-hidden="true" />
                <span className="whitespace-pre-wrap break-words">{writeError}</span>
              </p>
            ) : null}

            <form onSubmit={onInstructionSubmit} className="mt-4 flex items-center gap-2">
              <Input
                ref={instructionRef}
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={
                  recreate
                    ? "Optional: same shot with a cat, focus on the camera move, as an animation…"
                    : trimmed
                      ? "Ask for a change: golden hour, slow dolly-in…"
                      : "What should the video show?"
                }
                aria-label={recreate ? "Instructions for the prompt" : "What to change"}
                autoComplete="off"
                maxLength={500}
                disabled={writing}
                className="min-w-0 flex-1"
              />
              {recreate ? (
                <Button type="submit" variant="secondary" leftIcon={<Clapperboard />} loading={writing} disabled={!video}>
                  Describe video
                </Button>
              ) : (
                <Button type="submit" variant="secondary" leftIcon={<Sparkles />} loading={writing} disabled={!trimmed && !instruction.trim()}>
                  {trimmed ? "Rewrite" : "Write"}
                </Button>
              )}
            </form>
            {recreate ? (
              <p className="mt-2 text-caption">
                {RECREATE_MODEL.name} watches the clip and writes a prompt for the run you set up (model, length, ratio). Switch to Rewrite to
                tweak it or preview a frame.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick changes">
                {SUGGESTIONS.map((s) => (
                  <Chip key={s} size="sm" label={s} onClick={() => rewrite(s)} disabled={writing || !trimmed} />
                ))}
              </div>
            )}
          </section>

          {recreate ? (
            /* ---------- the video to recreate ---------- */
            <section className="flex min-w-0 flex-col" aria-label="Video to recreate">
              <div className="mb-1.5 flex h-7 items-center">
                <span className="text-label">Video to recreate</span>
              </div>
              <VideoSource video={video} onPick={pickVideo} onClear={() => setVideo(null)} disabled={writing} />
              <p className="mt-2 text-caption">Sent to {RECREATE_MODEL.name} once, with your instructions. Not saved to the library.</p>
            </section>
          ) : (
            /* ---------- the preview ---------- */
            <section className="flex min-w-0 flex-col" aria-label="Preview frame">
              <div className="mb-1.5 flex h-7 items-center">
                <span className="text-label">Preview frame</span>
              </div>
              <div className={cn("flex items-center justify-center", portrait && "h-[300px]")}>
                <div
                  className={cn(
                    "relative flex items-center justify-center overflow-hidden rounded-card border border-border bg-inset",
                    portrait ? "h-full" : "w-full",
                  )}
                  style={{ aspectRatio: `${rw ?? 16} / ${rh ?? 9}` }}
                >
                  {preview ? (
                    <img src={preview.dataUrl} alt={`Preview of: ${preview.prompt.slice(0, 120)}`} className={cn("size-full object-cover", previewing && "opacity-40")} />
                  ) : !previewing ? (
                    <ImageIcon size={24} strokeWidth={1.5} className="text-fg-faint" aria-hidden="true" />
                  ) : null}
                  {previewing ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-meta">
                      <Spinner size={18} className="text-fg-muted" />
                      Drawing a frame…
                    </div>
                  ) : null}
                </div>
              </div>
              <Button
                variant="secondary"
                leftIcon={preview ? <RefreshCw /> : <ImageIcon />}
                onClick={() => void makePreview()}
                loading={previewing}
                disabled={!trimmed || writing}
                className="mt-3"
              >
                {preview ? (stale ? "Preview the new prompt" : "Another preview") : "Preview frame"}
              </Button>
              {previewError ? (
                <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-control border border-danger/25 bg-danger/5 p-2.5 text-meta">
                  <CircleAlert size={14} className="mt-px shrink-0 text-danger" aria-hidden="true" />
                  <span className="whitespace-pre-wrap break-words">{previewError}</span>
                </p>
              ) : null}
              <p className="mt-2 text-caption tabular-nums">
                {preview?.costUsd !== undefined ? `${formatUsd(preview.costUsd)} · ` : ""}
                {PREVIEW_IMAGE_MODEL.name}, low quality: a quick look at the shot, not the video.
                {firstFrame ? " Uses your first frame as a reference." : ""} Not saved.
                {stale ? " The prompt changed since this preview." : ""}
              </p>
            </section>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={use} aria-disabled={!trimmed || busy || undefined}>
            Use prompt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
