import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Pencil, StickyNote } from "lucide-react";
import type { Generation } from "@shared/types";
import { describeApiError } from "@/lib/api";
import { NOTE_MAX, normalizeNote } from "@/lib/notes";
import { useGenerations } from "@/store/generations";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Textarea } from "@/components/ui/Textarea";

/**
 * A video's note, in the slot just above its prompt. With nothing written yet, a button opens the
 * editor; Escape leaves it (the lightbox stays open) and an empty save removes the note.
 */
export function VideoNote({ g }: { g: Generation }) {
  const [editing, setEditing] = useState(false);
  const note = g.note ?? "";

  if (editing) {
    return (
      <NoteEditor
        initial={note}
        onCancel={() => setEditing(false)}
        onSave={async (text) => {
          await useGenerations.getState().setNote(g.id, text || null);
          setEditing(false);
        }}
      />
    );
  }

  if (!note) {
    return (
      <Button
        variant="secondary"
        className="self-start"
        leftIcon={<StickyNote />}
        onClick={() => setEditing(true)}
      >
        Write a note
      </Button>
    );
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-label">Note</h3>
        <IconButton label="Edit note" size="sm" onClick={() => setEditing(true)}>
          <Pencil />
        </IconButton>
      </div>
      <p className="whitespace-pre-wrap break-words text-body text-fg">{note}</p>
    </section>
  );
}

function NoteEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (note: string) => Promise<void>;
}) {
  const [text, setText] = useState(initial);
  // Frozen at open: an optimistic save updates the record underneath, and must not flip Save / Remove.
  const [startedAs] = useState(() => normalizeNote(initial));
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  const clean = normalizeNote(text);
  const unchanged = clean === startedAs;
  const removing = startedAs.length > 0 && clean.length === 0;
  const canSave = !busy && !unchanged && (clean.length > 0 || removing);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(undefined);
    try {
      await onSave(clean);
    } catch (err) {
      setError(describeApiError(err));
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (!busy) onCancel();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target instanceof HTMLTextAreaElement) {
      e.preventDefault();
      void save();
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void save();
  };

  return (
    <form data-note-editor onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-2">
      <div className="mb-0.5">
        <h3 className="text-label">Note</h3>
      </div>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(undefined);
        }}
        placeholder="A note about this video"
        aria-label="Note"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        minRows={3}
        maxRows={8}
        maxLength={NOTE_MAX}
        autoFocus
        disabled={busy}
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={removing ? "danger" : "primary"}
          loading={busy}
          aria-disabled={!canSave || undefined}
          onClick={canSave ? undefined : (e) => e.preventDefault()}
        >
          {removing ? "Remove" : "Save"}
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
