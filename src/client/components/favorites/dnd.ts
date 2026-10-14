/**
 * Dragging a kept card onto a folder tile. The drag carries the record id under its own type, so
 * the composer's file dropzones (which look for `Files`) ignore it; a tab-local copy of the id is
 * the fallback for a browser that hands back an empty string from `getData`.
 */
export const GENERATION_DRAG_TYPE = "application/x-higgsfree-generation";

let current: string | null = null;

export function startGenerationDrag(dt: DataTransfer, id: string): void {
  dt.setData(GENERATION_DRAG_TYPE, id);
  dt.effectAllowed = "move";
  current = id;
}

export function endGenerationDrag(): void {
  current = null;
}

/** True while the drag over a target is one of ours (`types` is readable during `dragover`; the data is not). */
export function dragHasGeneration(dt: DataTransfer | null | undefined): boolean {
  return Array.from(dt?.types ?? []).includes(GENERATION_DRAG_TYPE);
}

/** The dropped record's id, or null when the drop was something else (files, text). */
export function droppedGenerationId(dt: DataTransfer | null | undefined): string | null {
  if (!dragHasGeneration(dt)) return null;
  return dt?.getData(GENERATION_DRAG_TYPE) || current;
}
