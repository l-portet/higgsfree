import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, CircleAlert, Copy, Download, Heart, ImageOff, RefreshCw, RotateCcw, Trash2, VideoOff, WandSparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { downloadFilename } from "@/lib/files";
import { formatBytes, formatDateTime, formatDims, formatDurationMs, formatElapsed, formatSeconds, formatUsd } from "@/lib/format";
import { useGenerationActions } from "@/lib/actions";
import { copyText, useElapsed, useReturnFocus } from "@/lib/hooks";
import { useMediaUrl } from "@/lib/media-urls";
import { isImageParams, providerLabel } from "@/lib/models";
import { PROVIDER_NAME } from "@/lib/providers";
import { useFolderName } from "@/store/folders";
import { isPending, useGenerations } from "@/store/generations";
import { useModels } from "@/store/models";
import { useUi } from "@/store/ui";
import { Badge } from "@/components/ui/Badge";
import { AnchorButton, Button } from "@/components/ui/Button";
import { ConfirmDialog, dialogOverlayClasses } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { ProviderTile } from "@/components/ProviderTile";
import { KeepMenu } from "@/components/favorites/KeepMenu";
import type { Generation } from "@shared/types";

function Row({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-meta text-fg-subtle">{label}</dt>
      <dd className={cn("min-w-0 text-right tabular-nums", mono ? "break-all text-mono text-fg" : "text-meta text-fg")}>{children}</dd>
    </div>
  );
}

function Details({ g }: { g: Generation }) {
  const actions = useGenerationActions(g);
  const [keepOpen, setKeepOpen] = useState(false);
  const folderName = useFolderName(g.folder);
  const pending = isPending(g);
  const elapsed = useElapsed(g.createdAt, pending, g.completedAt);
  const out = g.output;
  // Shares the lightbox's object url (ref-counted); the Download control waits for it.
  const src = useMediaUrl(out?.id);
  const p = g.params;
  const image = isImageParams(p);
  // Motion control: a character image and a reference video; the clip is as long as the video.
  const motion = !image && (p.orientation !== undefined || Boolean(g.inputs?.motionVideo));
  // The model's maker from the catalog (a fal-only slug starts with `fal/`), else the slug's prefix.
  const catalogModel = useModels((s) => (g.type === "image" ? s.findImage(g.model) : s.findVideo(g.model)));
  const maker = catalogModel?.provider ?? g.model.split("/")[0] ?? "openrouter";
  // 0 = not known yet (motion control, until the clip is back).
  const durationSec = out?.durationSec ?? (!image && p.duration > 0 ? p.duration : undefined);
  const status: { label: string; variant: "neutral" | "accent" | "danger" } =
    g.status === "completed"
      ? { label: "Completed", variant: "neutral" }
      : g.status === "failed"
        ? { label: "Failed", variant: "danger" }
        : { label: g.status === "running" ? "Rendering" : "Pending", variant: "accent" };

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-center gap-3">
        <ProviderTile provider={maker} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <DialogPrimitive.Title className="truncate text-heading">{g.modelName}</DialogPrimitive.Title>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <DialogPrimitive.Description className="truncate text-meta">
            {g.type === "image" ? "Image" : "Video"} · {providerLabel(maker)} · {formatDateTime(g.createdAt)}
          </DialogPrimitive.Description>
        </div>
      </div>

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-label">Prompt</h3>
          <IconButton label="Copy prompt" size="sm" onClick={() => void copyText(g.prompt, "Prompt copied")}>
            <Copy />
          </IconButton>
        </div>
        <p className="whitespace-pre-wrap break-words text-body text-fg">{g.prompt || <span className="text-fg-subtle">—</span>}</p>
      </section>

      {g.error ? (
        <section className="rounded-control border border-danger/25 bg-danger/5 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-meta font-medium text-danger">
            <CircleAlert size={14} aria-hidden="true" />
            Provider error
          </div>
          <p className="whitespace-pre-wrap break-words text-meta">{g.error}</p>
        </section>
      ) : null}

      <section>
        <h3 className="mb-1 text-label">Details</h3>
        <dl className="divide-y divide-border">
          <Row label="Model" mono>{g.model}</Row>
          <Row label="Provider">{PROVIDER_NAME[g.provider ?? "openrouter"]}</Row>
          {image ? (
            <>
              <Row label="Aspect ratio">{p.aspectRatio === "auto" ? "Auto" : p.aspectRatio}</Row>
              <Row label="Quality">{p.size}</Row>
            </>
          ) : (
            <>
              <Row label="Duration">{durationSec !== undefined ? formatSeconds(durationSec) : undefined}</Row>
              <Row label="Orientation">{motion ? (p.orientation === "image" ? "Follow image" : "Follow video") : undefined}</Row>
              <Row label="Aspect ratio">{p.aspectRatio}</Row>
              <Row label="Resolution">{p.resolution}</Row>
              <Row label="Audio">{p.audio === undefined ? undefined : p.audio ? "Yes" : "No"}</Row>
            </>
          )}
          <Row label="Dimensions">{formatDims(out?.width, out?.height)}</Row>
          <Row label="File">{out ? `${formatBytes(out.bytes)} · ${out.mime}` : undefined}</Row>
          <Row label="Cost">{g.costUsd !== undefined ? formatUsd(g.costUsd) : undefined}</Row>
          <Row label="Created">{formatDateTime(g.createdAt)}</Row>
          <Row label="Elapsed">{pending ? formatElapsed(elapsed) : formatDurationMs(g.elapsedMs)}</Row>
          <Row label="Provider job" mono>{g.providerJobId}</Row>
          <Row label="Batch" mono>{g.batchId ? `${g.batchId} #${(g.batchIndex ?? 0) + 1}` : undefined}</Row>
        </dl>
      </section>

      {g.inputs?.referenceImages?.length || g.inputs?.firstFrame || g.inputs?.lastFrame || g.inputs?.motionVideo ? (
        <section>
          <h3 className="mb-2 text-label">Inputs</h3>
          <div className="flex flex-wrap gap-2">
            {g.inputs.firstFrame ? <InputThumb id={g.inputs.firstFrame} label={motion ? "Character" : "First frame"} /> : null}
            {g.inputs.motionVideo ? <InputThumb id={g.inputs.motionVideo} label="Motion" video /> : null}
            {g.inputs.lastFrame ? <InputThumb id={g.inputs.lastFrame} label="Last frame" /> : null}
            {g.inputs.referenceImages?.map((id, i) => (
              <InputThumb key={`${id}-${i}`} id={id} label={`Reference ${i + 1}`} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-auto grid grid-cols-2 gap-2">
        {out && src ? (
          <AnchorButton href={src} download={downloadFilename(g.id, out.mime)} leftIcon={<Download />}>
            Download
          </AnchorButton>
        ) : out ? (
          <Button leftIcon={<Download />} disabled>
            Download
          </Button>
        ) : null}
        {out && g.type === "image" ? (
          <Button leftIcon={<WandSparkles />} onClick={actions.animate}>
            Animate
          </Button>
        ) : null}
        <Button leftIcon={<RotateCcw />} onClick={actions.reuse}>
          Reuse prompt
        </Button>
        {g.status === "completed" ? (
          <KeepMenu generation={g} actions={actions} open={keepOpen} onOpenChange={setKeepOpen} side="top" align="start">
            <Button
              leftIcon={<Heart fill={g.favorite ? "currentColor" : "none"} />}
              aria-pressed={Boolean(g.favorite)}
              loading={actions.keeping}
              className={cn("min-w-0", g.favorite && "text-accent")}
            >
              <span className="min-w-0 truncate">{g.favorite ? (folderName ? `Kept in ${folderName}` : "Kept") : "Keep"}</span>
            </Button>
          </KeepMenu>
        ) : null}
        {g.status === "failed" ? (
          <Button leftIcon={<RefreshCw />} loading={actions.retrying} onClick={() => void actions.retry()}>
            Retry
          </Button>
        ) : null}
        <Button variant="danger" leftIcon={<Trash2 />} onClick={() => actions.setConfirmDelete(true)}>
          Delete
        </Button>
      </section>

      <ConfirmDialog
        open={actions.confirmDelete}
        onOpenChange={actions.setConfirmDelete}
        title={`Delete this ${g.type}?`}
        description="Removes the record and its file from this browser. This can't be undone."
        confirmLabel="Delete"
        danger
        loading={actions.deleting}
        onConfirm={actions.remove}
      />
    </div>
  );
}

/** An input by media id (a muted loop for a video); a quiet placeholder when the file is no longer in the library. */
function InputThumb({ id, label, video }: { id: string; label: string; video?: boolean }) {
  const src = useMediaUrl(id);
  const Missing = video ? VideoOff : ImageOff;
  return (
    <figure className="w-16">
      <div className="flex size-16 items-center justify-center overflow-hidden rounded-thumb border border-border bg-surface-2 text-fg-subtle">
        {src ? (
          video ? (
            <video src={src} muted loop autoPlay playsInline preload="metadata" aria-label={label} className="size-full object-cover" />
          ) : (
            <img src={src} alt={label} className="size-full object-cover" loading="lazy" />
          )
        ) : (
          <Missing size={18} aria-label={`${label} not available`} />
        )}
      </div>
      <figcaption className="mt-1 truncate text-center text-caption">{label}</figcaption>
    </figure>
  );
}

function Media({ g }: { g: Generation }) {
  const pending = isPending(g);
  const out = g.output;
  const src = useMediaUrl(out?.id);
  if (pending || !out) {
    return (
      <div className="flex max-h-full w-full max-w-[520px] flex-col items-center justify-center gap-3 p-8 text-center" style={{ aspectRatio: "4 / 3" }}>
        {pending ? (
          <>
            <Spinner size={22} className="text-fg-muted" />
            <p className="text-body text-fg-muted">{g.type === "video" ? "Rendering with" : "Generating with"} {g.modelName}…</p>
          </>
        ) : (
          <>
            <CircleAlert size={22} className="text-danger" aria-hidden="true" />
            <p className="text-body text-fg-muted">Generation failed. The provider's message is under Details.</p>
          </>
        )}
      </div>
    );
  }
  if (g.type === "video") {
    return (
      <video
        key={out.id}
        src={src}
        controls
        autoPlay
        loop
        playsInline
        aria-label={g.prompt ? `Video: ${g.prompt.slice(0, 80)}` : "Generated video"}
        className="max-h-full max-w-full rounded-[4px] outline-none"
        style={{ aspectRatio: out.width && out.height ? `${out.width} / ${out.height}` : undefined }}
      />
    );
  }
  return (
    // Hidden until the url is there so the alt text never paints as a stand-in.
    <img
      key={out.id}
      src={src}
      alt={g.prompt}
      width={out.width}
      height={out.height}
      className={cn("max-h-full max-w-full select-none object-contain", !src && "invisible")}
      draggable={false}
    />
  );
}

export function Lightbox() {
  const lb = useUi((s) => s.lightbox);
  const close = useUi((s) => s.closeLightbox);
  const step = useUi((s) => s.lightboxStep);
  const contentRef = useRef<HTMLDivElement>(null);
  const focus = useReturnFocus();

  const currentId = lb ? lb.ids[lb.index] : undefined;
  // Subscribe to the current item only (not the whole `byId` map) so unrelated feed updates don't re-render the dialog.
  const g = useGenerations((s) => (currentId ? s.byId[currentId] : undefined));
  const count = lb?.ids.length ?? 0;

  // The store prunes deleted ids on `remove`; this covers anything else that vanished (closes when nothing is left).
  useEffect(() => {
    if (!lb || !currentId || g) return;
    const { byId } = useGenerations.getState();
    useUi.getState().lightboxSetIds(lb.ids.filter((id) => byId[id]));
  }, [lb, currentId, g]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target;
    // Leave ← → to the native <video controls> (seeking) and to any text field / editable region.
    if (t instanceof HTMLVideoElement) return;
    if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  };

  const open = Boolean(lb && g);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={dialogOverlayClasses} />
        <DialogPrimitive.Content
          ref={contentRef}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          // Focus the container (not the Close button) so ← → work immediately and Esc closes the dialog
          // instead of a focused icon button's tooltip. Remember the opener (a card) to return focus to on close.
          onOpenAutoFocus={(e) => {
            focus.onOpenAutoFocus();
            e.preventDefault();
            contentRef.current?.focus();
          }}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          aria-label={g ? `${g.type === "image" ? "Image" : "Video"} details` : "Details"}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-bg outline-none md:flex-row",
            "animate-fade-in data-[state=closed]:animate-fade-out",
          )}
        >
          {g ? (
            <>
              <div className="relative flex min-h-[45dvh] flex-1 items-center justify-center overflow-hidden bg-black p-3 md:min-h-0 md:p-6">
                <Media g={g} />

                <div className="absolute left-3 top-3 flex items-center gap-1.5">
                  <DialogPrimitive.Close asChild>
                    <IconButton label="Close" variant="overlay" size="lg" round tooltipSide="right">
                      <X />
                    </IconButton>
                  </DialogPrimitive.Close>
                </div>

                {count > 1 ? (
                  <>
                    <IconButton
                      label="Previous"
                      variant="overlay"
                      size="lg"
                      round
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      onClick={() => step(-1)}
                      tooltipSide="right"
                    >
                      <ChevronLeft />
                    </IconButton>
                    <IconButton
                      label="Next"
                      variant="overlay"
                      size="lg"
                      round
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      onClick={() => step(1)}
                      tooltipSide="left"
                    >
                      <ChevronRight />
                    </IconButton>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] tabular-nums text-white/80 backdrop-blur-sm">
                      {(lb?.index ?? 0) + 1} / {count}
                    </div>
                  </>
                ) : null}
              </div>

              <aside className="w-full shrink-0 overflow-y-auto border-t border-border bg-surface md:w-[380px] md:border-l md:border-t-0">
                <Details key={g.id} g={g} />
              </aside>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
