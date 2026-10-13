import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge treats any `text-*` class it doesn't know as a text *color*, so `text-meta text-fg`
 * would collapse to `text-fg`. Register the typography utilities from styles.css as their own group.
 */
const twMerge = extendTailwindMerge<"text-role">({
  extend: {
    classGroups: {
      "text-role": [{ text: ["display", "title", "heading", "lead", "label", "body", "meta", "caption", "mono"] }],
    },
  },
});

/** Merge Tailwind classes with clsx conditionals; later classes win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
