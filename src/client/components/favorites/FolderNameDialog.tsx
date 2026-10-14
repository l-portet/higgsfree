import { useReturnFocus } from "@/lib/hooks";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { FolderNameForm } from "./FolderNameForm";

export interface FolderNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialName?: string;
  submitLabel: string;
  /** Resolves when the folder is saved; the dialog closes then. A rejection shows under the field. */
  onSubmit: (name: string) => Promise<void>;
}

/** "New folder" / "Rename folder": a small dialog around `FolderNameForm`. Focus lands on the field and returns to the opener. */
export function FolderNameDialog({ open, onOpenChange, title, description, initialName, submitLabel, onSubmit }: FolderNameDialogProps) {
  const focus = useReturnFocus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" onOpenAutoFocus={focus.onOpenAutoFocus} onCloseAutoFocus={focus.onCloseAutoFocus}>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
        <FolderNameForm
          initialName={initialName}
          submitLabel={submitLabel}
          onSubmit={async (name) => {
            await onSubmit(name);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          className="mt-4"
        />
      </DialogContent>
    </Dialog>
  );
}
