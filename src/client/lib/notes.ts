/** A note written on a generated video: length, and the form stored on the record. */

export const NOTE_MAX = 2_000;

/** Trimmed and clipped to `NOTE_MAX`. `""` means the video has no note. */
export function normalizeNote(note: string): string {
  return note.trim().slice(0, NOTE_MAX).trim();
}
