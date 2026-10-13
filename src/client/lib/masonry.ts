import type { ReactNode } from "react";
import type { Generation } from "@shared/types";
import { ratioToCss } from "@/lib/format";
import { isImageParams } from "@/lib/models";
import { isPending } from "@/store/generations";

export interface MasonryItem {
  key: string;
  /** width / height. Known up front for every card, so nothing is measured. */
  aspect: number;
  render: () => ReactNode;
}

/** Failed cards have no fixed ratio (they grow with their text); 4:3 is close enough to pack them. */
const FAILED_ASPECT = 4 / 3;

/** "3 / 4" or "3:4" → 0.75; anything unparsable → 1. */
export function parseAspect(value: string | undefined): number {
  if (!value) return 1;
  const [w, h] = value.split(/[/:]/).map((s) => Number(s.trim()));
  return w && h ? w / h : 1;
}

/** CSS `aspect-ratio` for a card: real output dimensions when known, else the requested ratio. */
export function cardAspect(g: Generation): string {
  const out = g.output;
  if (out?.width && out?.height) return `${out.width} / ${out.height}`;
  if (isImageParams(g.params)) return ratioToCss(g.params.aspectRatio, "1 / 1");
  return ratioToCss(g.params.aspectRatio, "16 / 9");
}

/** Numeric width / height for masonry packing. */
export function cardAspectRatio(g: Generation): number {
  if (!isPending(g) && (g.status === "failed" || !g.output)) return FAILED_ASPECT;
  return parseAspect(cardAspect(g));
}

/** Items for a loading grid built from CSS aspect strings like "3 / 4". */
export function skeletonItems(aspects: readonly string[], render: (aspect: string) => ReactNode): MasonryItem[] {
  return aspects.map((a, i) => ({ key: `skeleton-${i}`, aspect: parseAspect(a), render: () => render(a) }));
}
