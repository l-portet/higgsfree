import type { ComponentProps, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { isMac } from "@/lib/format";
import { useMediaUrl } from "@/lib/media-urls";
import { Spinner } from "@/components/ui/Spinner";
import { Tooltip } from "@/components/ui/Tooltip";

/** One attached image in the composer (reference, first frame, last frame). */
export interface Attachment {
  id: string;
  name: string;
  /** Media id in the library; the thumbnail resolves it to a `blob:` url. */
  mediaId: string;
  /** Small caption on the thumbnail: "1st", "Last", … */
  tag?: string;
}

/** 33 px thumbnail: a quiet surface until the library hands back the object url. */
function AttachmentThumb({ a }: { a: Attachment }) {
  const src = useMediaUrl(a.mediaId);
  return (
    <div className="size-[33px] overflow-hidden rounded-thumb border border-border-strong bg-surface-2">
      {src ? <img src={src} alt={a.name} className="size-full object-cover" draggable={false} /> : null}
      {a.tag ? (
        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 text-center text-[9px] font-semibold uppercase leading-[14px] tracking-wide text-white/90">
          {a.tag}
        </span>
      ) : null}
    </div>
  );
}

export function AttachmentStrip({ items, onRemove, label }: { items: Attachment[]; onRemove: (id: string) => void; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex shrink-0 flex-wrap items-center gap-2" aria-label={label}>
      {items.map((a) => (
        <li key={a.id} className="relative">
          <AttachmentThumb a={a} />
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            aria-label={`Remove ${a.tag ? `${a.tag} ` : ""}${a.name}`}
            className="absolute -right-1.5 -top-1.5 inline-flex size-4 items-center justify-center rounded-full bg-fg text-bg shadow transition-transform duration-150 hover:scale-110"
          >
            <X size={10} strokeWidth={3} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface GenerateButtonProps {
  /** Why Generate is not ready, or null. The button stays focusable and tells AT users why. */
  disabledReason: string | null;
  submitting: boolean;
  reasonId: string;
  /** Runs even while not ready (e.g. open the key dialog when the key is missing). */
  onClick?: () => void;
}

/** Lime pill with the shortcut badge; a neutral surface while not ready. */
export function GenerateButton({ disabledReason, submitting, reasonId, onClick }: GenerateButtonProps) {
  const notReady = Boolean(disabledReason);
  return (
    <Tooltip content={disabledReason} side="top" align="end">
      <button
        type="submit"
        onClick={onClick}
        aria-disabled={notReady || undefined}
        aria-describedby={notReady ? reasonId : undefined}
        aria-busy={submitting || undefined}
        className={cn(
          "inline-flex h-9 shrink-0 select-none items-center gap-2 rounded-control px-3.5 text-[13px] font-semibold tracking-[-0.01em]",
          "transition-[background-color,color,border-color,opacity] duration-150 active:scale-[0.985]",
          notReady ? "border border-border bg-surface-2 text-fg-disabled" : "bg-accent text-on-accent hover:bg-accent-hover",
          submitting && "pointer-events-none opacity-70",
        )}
      >
        {submitting ? <Spinner size={14} /> : null}
        Generate
        <kbd
          aria-hidden="true"
          className={cn(
            "hidden h-5 items-center rounded-tag px-1 font-sans text-[11px] font-medium leading-none sm:inline-flex",
            notReady ? "bg-fg/5 text-fg-disabled" : "bg-black/10 text-on-accent/60",
          )}
        >
          {isMac() ? "⌘" : "Ctrl"}↵
        </kbd>
      </button>
    </Tooltip>
  );
}

export interface ComposerFrameProps extends Omit<ComponentProps<"form">, "children"> {
  dragging?: boolean;
  /** The round "+" control (a button or a popover trigger). */
  addControl: ReactNode;
  attachments?: ReactNode;
  textarea: ReactNode;
  /** Row 2, left: the option chips. */
  chips: ReactNode;
  /** Optional line between the rows (warnings, hints). */
  note?: ReactNode;
  /** Shown just before Generate, e.g. "~$0.13". */
  estimate?: string;
  generate: GenerateButtonProps;
}

/** The bar itself (dock radius, 13 px inset): "+" and prompt on top, chips and Generate underneath. */
export function ComposerFrame({ dragging, addControl, attachments, textarea, chips, note, estimate, generate, className, ...form }: ComposerFrameProps) {
  return (
    <form
      {...form}
      className={cn(
        "group pointer-events-auto w-full max-w-[940px] rounded-dock border bg-surface p-3 shadow-float",
        "transition-colors duration-150",
        dragging ? "border-accent/70" : "border-border",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        <div className="shrink-0">{addControl}</div>
        {attachments}
        <div className="min-w-0 flex-1">{textarea}</div>
      </div>
      {note ? <div className="mt-1.5 pl-[47px]">{note}</div> : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {chips}
        <div className="ml-auto flex items-center gap-3">
          {estimate ? (
            <span className="hidden text-[13px] tabular-nums tracking-[-0.01em] text-fg-subtle sm:inline" aria-label={`Estimated cost ${estimate}`}>
              {estimate}
            </span>
          ) : null}
          <GenerateButton {...generate} />
        </div>
      </div>
      {generate.disabledReason ? (
        <span id={generate.reasonId} className="sr-only">
          {generate.disabledReason}
        </span>
      ) : null}
    </form>
  );
}

/** The "+" button: a 33 px rounded square (control radius), the height of one prompt line. */
export function AddButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-[33px] shrink-0 items-center justify-center rounded-control border border-border-strong bg-surface text-fg-muted",
        "transition-colors duration-150 hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2 data-[state=open]:text-fg",
        className,
      )}
      {...props}
    />
  );
}

/** One 24 px line padded to the "+" button's 33 px, so the first line sits level with it. */
export const PROMPT_TEXTAREA_CLASS = "min-h-[33px] w-full py-[4.5px] text-[15px] leading-6 placeholder:text-fg-subtle";
