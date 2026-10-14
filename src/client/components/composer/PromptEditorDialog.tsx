import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleAlert, ImageIcon, RefreshCw, Sparkles, Undo2 } from "lucide-react";
import type { VideoAspectRatio } from "@shared/types";
import * as api from "@/lib/api";
import { ApiClientError, describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { useReturnFocus } from "@/lib/hooks";
import { MAX_PROMPT_CHARS, PREVIEW_IMAGE_MODEL, PROMPT_EDITOR_MODEL, previewAspect, type RewriteContext } from "@/lib/prompt-editor";
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

const KEY_REASON = "The AI Prompt Editor runs on OpenRouter.";

/** True when an OpenRouter key is stored; otherwise opens the key dialog, which runs `retry` once the key is saved. */
function haveKey(retry: () => void): boolean {
  if (useSettings.getState().settings?.hasKey) return true;
  useUi.getState().openKeyDialog({ provider: "openrouter", reason: KEY_REASON, onSaved: retry });
  return false;
}

const isCancel = (err: unknown): boolean => err instanceof ApiClientError && err.status === 499;

/**
 * The video composer's prompt editor: rewrite the prompt with an LLM (streamed into the field, with
 * Undo), preview a still of the shot with a fast image model, then "Use prompt" hands the text back.
 * Both calls run on OpenRouter with the user's key and show their real cost; nothing is saved.
 */
export function PromptEditorDialog({ open, onOpenChange, prompt, context, aspectRatio, firstFrame, onUse }: PromptEditorDialogProps) {
  const focus = useReturnFocus();
  const [draft, setDraft] = useState(prompt);
  const [history, setHistory] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteCost, setRewriteCost] = useState<number | undefined>();
  const [rewriteError, setRewriteError] = useState<string | undefined>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>();
  const rewriteAbort = useRef<AbortController | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const instructionRef = useRef<HTMLInputElement>(null);

  // Each opening starts from the composer's prompt; closing cancels whatever is still running.
  useEffect(() => {
    if (open) {
      setDraft(prompt);
      setHistory([]);
      setInstruction("");
      setRewriteCost(undefined);
      setRewriteError(undefined);
      setPreview(null);
      setPreviewError(undefined);
      return;
    }
    rewriteAbort.current?.abort();
    previewAbort.current?.abort();
    // `prompt` is read once per opening, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = draft.trim();
  const ratio = previewAspect(aspectRatio);
  const [rw, rh] = ratio.split(":").map(Number);
  const portrait = (rw ?? 16) < (rh ?? 9);

  const rewrite = async (ask: string) => {
    if (rewriting) return;
    if (!haveKey(() => void rewrite(ask))) return;
    const before = draft;
    const controller = new AbortController();
    rewriteAbort.current = controller;
    setRewriting(true);
    setRewriteError(undefined);
    try {
      const res = await api.rewriteVideoPrompt(
        { prompt: before, instruction: ask, context },
        { signal: controller.signal, onText: (t) => setDraft(t) },
      );
      setDraft(res.prompt);
      setHistory((h) => [...h, before]);
      setRewriteCost(res.costUsd);
      setInstruction("");
      void useSettings.getState().refreshCredits();
    } catch (err) {
      setDraft(before);
      if (!isCancel(err)) setRewriteError(describeApiError(err));
    } finally {
      setRewriting(false);
      if (rewriteAbort.current === controller) rewriteAbort.current = null;
      // The field was disabled while it ran: hand the caret back for the next change.
      if (!controller.signal.aborted) requestAnimationFrame(() => instructionRef.current?.focus());
    }
  };

  const undo = () => {
    const prev = history.at(-1);
    if (prev === undefined) return;
    setHistory((h) => h.slice(0, -1));
    setDraft(prev);
    setRewriteCost(undefined);
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
    void rewrite(instruction);
  };

  const use = () => {
    if (!trimmed || rewriting) return;
    onUse(trimmed);
    onOpenChange(false);
  };

  const stale = preview !== null && preview.prompt !== trimmed;

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
        className="flex max-h-[calc(100dvh-32px)] flex-col overflow-hidden p-0"
      >
        <div className="px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" aria-hidden="true" />
            AI Prompt Editor
          </DialogTitle>
          <DialogDescription>
            Rewrite the prompt with {PROMPT_EDITOR_MODEL.name}, preview a frame with {PREVIEW_IMAGE_MODEL.name}, then use it. Both run on your
            OpenRouter key.
          </DialogDescription>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 pb-5 md:grid-cols-[minmax(0,1fr)_300px]">
          {/* ---------- the prompt ---------- */}
          <section className="flex min-w-0 flex-col" aria-label="Prompt">
            <div className="mb-1.5 flex h-7 items-center justify-between gap-2">
              <label htmlFor="prompt-editor-draft" className="text-label">
                Prompt
              </label>
              {history.length > 0 ? (
                <Button size="sm" variant="ghost" leftIcon={<Undo2 />} onClick={undo} disabled={rewriting} className="-mr-2">
                  Undo
                </Button>
              ) : null}
            </div>
            <Textarea
              id="prompt-editor-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={rewriting}
              aria-busy={rewriting || undefined}
              placeholder="Describe the shot, or ask the AI below to write one."
              maxLength={MAX_PROMPT_CHARS}
              minRows={6}
              maxRows={12}
              className={cn("text-[14px] leading-[22px]", rewriting && "text-fg-muted")}
            />
            <p className="mt-1.5 min-h-[17px] text-meta tabular-nums" aria-live="polite">
              {rewriting
                ? `${PROMPT_EDITOR_MODEL.name} is rewriting…`
                : rewriteCost !== undefined
                  ? `Rewritten by ${PROMPT_EDITOR_MODEL.name} · ${formatUsd(rewriteCost)}`
                  : history.length > 0
                    ? `Rewritten by ${PROMPT_EDITOR_MODEL.name}`
                    : "Edit it yourself, or ask for a change below."}
            </p>
            {rewriteError ? (
              <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-control border border-danger/25 bg-danger/5 p-2.5 text-meta">
                <CircleAlert size={14} className="mt-px shrink-0 text-danger" aria-hidden="true" />
                <span className="whitespace-pre-wrap break-words">{rewriteError}</span>
              </p>
            ) : null}

            <form onSubmit={onInstructionSubmit} className="mt-4 flex items-center gap-2">
              <Input
                ref={instructionRef}
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={trimmed ? "Ask for a change: golden hour, slow dolly-in…" : "What should the video show?"}
                aria-label="What to change"
                autoComplete="off"
                maxLength={500}
                disabled={rewriting}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="secondary" leftIcon={<Sparkles />} loading={rewriting} disabled={!trimmed && !instruction.trim()}>
                {trimmed ? "Rewrite" : "Write"}
              </Button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick changes">
              {SUGGESTIONS.map((s) => (
                <Chip key={s} size="sm" label={s} onClick={() => void rewrite(s)} disabled={rewriting || !trimmed} />
              ))}
            </div>
          </section>

          {/* ---------- the preview ---------- */}
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
              disabled={!trimmed || rewriting}
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
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={use} aria-disabled={!trimmed || rewriting || undefined}>
            Use prompt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
