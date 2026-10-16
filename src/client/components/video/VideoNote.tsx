import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Generation } from "@shared/types";
import { describeApiError } from "@/lib/api";
import { NOTE_MAX, normalizeNote } from "@/lib/notes";
import { useGenerations } from "@/store/generations";
import { Textarea } from "@/components/ui/Textarea";

/** Pause after the last keystroke before the note is written. */
const SAVE_DELAY_MS = 500;

/**
 * A video's note, in the slot just above its prompt. Nothing written yet: a quiet line that opens
 * the field. The field saves itself; leaving it (blur or Escape) shows the note, or the line again
 * when the field is empty.
 */
export function VideoNote({ g }: { g: Generation }) {
  const [editing, setEditing] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const note = g.note ?? "";

  // The field unmounts before the line (or the note) is back, so focus waits for that commit.
  useEffect(() => {
    if (editing || !restoreFocus.current) return;
    restoreFocus.current = false;
    openerRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <NoteField
        id={g.id}
        saved={note}
        onClose={(restore) => {
          restoreFocus.current = restore;
          setEditing(false);
        }}
      />
    );
  }

  if (!note) {
    return (
      <button
        ref={openerRef}
        type="button"
        className="cursor-text self-start border-0 bg-transparent p-0 text-left text-body font-normal text-fg-muted transition-colors duration-150 hover:text-fg"
        onClick={() => setEditing(true)}
      >
        Write a note
      </button>
    );
  }

  return (
    <button
      ref={openerRef}
      type="button"
      className="cursor-text w-full border-0 bg-transparent p-0 text-left text-body font-normal whitespace-pre-wrap break-words text-fg"
      onClick={() => setEditing(true)}
    >
      {note}
    </button>
  );
}

function NoteField({
  id,
  saved,
  onClose,
}: {
  id: string;
  saved: string;
  onClose: (restoreFocus: boolean) => void;
}) {
  const [text, setText] = useState(saved);
  const [error, setError] = useState<string | undefined>();
  const textRef = useRef(saved);
  const savedRef = useRef(normalizeNote(saved));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tail = useRef(Promise.resolve());
  const closing = useRef(false);
  const errorId = useId();

  // One write at a time, always of whatever is in the field when that write starts.
  const flush = () => {
    const run = tail.current.then(async () => {
      const clean = normalizeNote(textRef.current);
      if (clean === savedRef.current) return;
      await useGenerations.getState().setNote(id, clean || null);
      savedRef.current = clean;
    });
    tail.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  // A switch to another video unmounts the field before the pause elapses.
  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
      const clean = normalizeNote(textRef.current);
      if (clean !== savedRef.current) void useGenerations.getState().setNote(id, clean || null);
    };
  }, [id]);

  const schedule = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void flush().catch((err: unknown) => {
        if (!closing.current) setError(describeApiError(err));
      });
    }, SAVE_DELAY_MS);
  };

  const commitAndClose = (restore: boolean) => {
    if (closing.current) return;
    closing.current = true;
    clearTimeout(timer.current);
    timer.current = undefined;
    void flush()
      .then(() => onClose(restore))
      .catch((err: unknown) => {
        closing.current = false;
        setError(describeApiError(err));
      });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    commitAndClose(true);
  };

  return (
    <div data-note-editor className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          textRef.current = next;
          setText(next);
          if (error) setError(undefined);
          schedule();
        }}
        onBlur={() => commitAndClose(false)}
        onKeyDown={onKeyDown}
        placeholder="Write a note"
        aria-label="Note"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        minRows={2}
        maxRows={8}
        maxLength={NOTE_MAX}
        autoFocus
      />
      {error ? (
        <p id={errorId} className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
