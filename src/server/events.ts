/**
 * The change feed behind `GET /api/events`. There is no in-process bus any more
 * (two requests rarely share a process on Vercel): clients poll with the cursor
 * they got last time and receive every record whose `updated_at` moved since, plus
 * tombstones for records that were deleted meanwhile.
 */
import type { EventsResponse, ServerEvent } from "../shared/types.ts";
import { countActiveGenerations, listDeletionsSince, listGenerationsUpdatedSince, pruneDeletions, toPublic } from "./repo.ts";

/** Clocks of two function instances differ a little; re-sending a row is harmless (clients merge by id). */
export const CURSOR_OVERLAP_MS = 2_000;
export const CHANGES_LIMIT = 200;
/** Tombstones only matter to tabs that were open at the time; a day is plenty. */
const TOMBSTONE_TTL_MS = 24 * 3_600_000;

export async function collectEvents(since?: string): Promise<EventsResponse> {
  const nowIso = new Date().toISOString();
  const pendingJobs = await countActiveGenerations();
  if (!since || Number.isNaN(Date.parse(since))) {
    await pruneDeletions(new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString());
    return { cursor: nowIso, pendingJobs, events: [{ type: "hello", pendingJobs }] };
  }
  const from = new Date(Date.parse(since) - CURSOR_OVERLAP_MS).toISOString();
  const [changed, deletions] = await Promise.all([listGenerationsUpdatedSince(from, CHANGES_LIMIT + 1), listDeletionsSince(from)]);
  const truncated = changed.length > CHANGES_LIMIT;
  const rows = truncated ? changed.slice(0, CHANGES_LIMIT) : changed;
  const events: ServerEvent[] = [
    ...deletions.map((d): ServerEvent => ({ type: "generation-deleted", id: d.id })),
    ...rows.map((g): ServerEvent => ({ type: "generation", generation: toPublic(g) })),
  ];
  // When the page overflowed, resume from the last row served so nothing is skipped.
  const cursor = truncated ? (rows[rows.length - 1]?.updatedAt ?? nowIso) : nowIso;
  return { cursor, pendingJobs, events };
}
