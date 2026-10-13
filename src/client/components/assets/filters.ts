/** Assets library filter model: type chips, status dropdown, and the API queries they map to. */
import type { GenerationStatus, ListGenerationsQuery } from "@shared/types";

export type TypeFilter = "all" | "image" | "video";
export type StatusFilter = "any" | "completed" | "rendering" | "failed";

export const TYPE_FILTERS: TypeFilter[] = ["all", "image", "video"];
export const STATUS_FILTERS: StatusFilter[] = ["any", "completed", "rendering", "failed"];

export const TYPE_LABEL: Record<TypeFilter, string> = { all: "All", image: "Images", video: "Videos" };
export const STATUS_LABEL: Record<StatusFilter, string> = {
  any: "Any status",
  completed: "Completed",
  rendering: "Rendering",
  failed: "Failed",
};

export function isTypeFilter(v: unknown): v is TypeFilter {
  return typeof v === "string" && (TYPE_FILTERS as string[]).includes(v);
}

export function matchesStatus(status: GenerationStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case "any":
      return true;
    case "rendering":
      return status === "pending" || status === "running";
    default:
      return status === filter;
  }
}

/**
 * The API accepts a single `status`, so "Rendering" fans out to two queries
 * (`pending` + `running`); the visible list is filtered client-side from the store.
 */
export function queriesFor(type: TypeFilter, status: StatusFilter): Pick<ListGenerationsQuery, "type" | "status">[] {
  const t = type === "all" ? undefined : type;
  const statuses: (GenerationStatus | undefined)[] =
    status === "any" ? [undefined] : status === "rendering" ? ["pending", "running"] : [status];
  return statuses.map((s) => ({ type: t, status: s }));
}

/** Noun for the header count: "generations" / "images" / "videos". */
export function typeNoun(type: TypeFilter, n: number): string {
  const one = type === "all" ? "generation" : type;
  return n === 1 ? one : `${one}s`;
}
