import { useId, useState, type FormEvent } from "react";
import { describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { FOLDER_NAME_MAX, normalizeFolderName } from "@/lib/folders";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface FolderNameFormProps {
  initialName?: string;
  submitLabel: string;
  /** Rejections (an empty or duplicate name) show under the field. */
  onSubmit: (name: string) => Promise<void>;
  onCancel?: () => void;
  /** Focus the field on mount (the dialog focuses it itself). */
  autoFocus?: boolean;
  /** `row`: field and buttons on one line; `stack`: the buttons under the field (dialogs, narrow popovers). */
  layout?: "row" | "stack";
  /** Button size; `sm` for a popover. */
  size?: "sm" | "md";
  className?: string;
}

/** A folder's name: one field, Cancel, and Create / Save. Enter submits, the name is cleaned before it goes out. */
export function FolderNameForm({ initialName = "", submitLabel, onSubmit, onCancel, autoFocus, layout = "stack", size = "md", className }: FolderNameFormProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  const clean = normalizeFolderName(name);
  const unchanged = clean === normalizeFolderName(initialName) && initialName !== "";
  const canSubmit = clean.length > 0 && !unchanged && !busy;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(undefined);
    try {
      await onSubmit(clean);
    } catch (err) {
      setError(describeApiError(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={cn("flex flex-col gap-2", className)}>
      <div className={cn("flex gap-2", layout === "row" ? "flex-row items-center" : "flex-col")}>
        <Input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(undefined);
          }}
          placeholder="Folder name"
          aria-label="Folder name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          maxLength={FOLDER_NAME_MAX}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          className="min-w-0 flex-1"
        />
        <div className={cn("flex items-center gap-2", layout === "stack" && "justify-end")}>
          {onCancel ? (
            <Button type="button" variant="ghost" size={size} onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" variant="primary" size={size} loading={busy} aria-disabled={!canSubmit || undefined} onClick={canSubmit ? undefined : (e) => e.preventDefault()}>
            {submitLabel}
          </Button>
        </div>
      </div>
      {error ? (
        <p id={errorId} className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
