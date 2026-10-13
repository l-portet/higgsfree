import type { ComponentProps, ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useReturnFocus } from "@/lib/hooks";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

// Thin wrappers rather than `export const Dialog = DialogPrimitive.Root`: Fast Refresh can only
// hot-swap a module whose exports are all components it can identify.
export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}
export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />;
}
export function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />;
}

export const dialogOverlayClasses =
  "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] animate-fade-in data-[state=closed]:animate-fade-out";

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn(dialogOverlayClasses, className)} {...props} />;
}

type DialogSize = "sm" | "md" | "lg";
const SIZE: Record<DialogSize, string> = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  size?: DialogSize;
  /** Hide the top-right close button. */
  hideClose?: boolean;
}

export function DialogContent({ size = "md", hideClose, className, children, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2",
          "rounded-lg border border-border-strong bg-surface p-5 shadow-popover outline-none",
          "animate-pop-in data-[state=closed]:animate-pop-out",
          SIZE[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close asChild>
            <IconButton label="Close" size="sm" className="absolute right-3 top-3" tooltip={false}>
              <X />
            </IconButton>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-heading", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("mt-1 text-body text-fg-muted", className)} {...props} />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-5 flex items-center justify-end gap-2", className)} {...props} />;
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Small confirmation dialog (used for Delete). Focus lands on Cancel (the first focusable) so a
 * stray Enter never confirms a destructive action; it returns to the opener on close.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  const focus = useReturnFocus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" hideClose onOpenAutoFocus={focus.onOpenAutoFocus} onCloseAutoFocus={focus.onCloseAutoFocus}>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="md" disabled={loading}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button variant={danger ? "danger" : "primary"} size="md" loading={loading} onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
