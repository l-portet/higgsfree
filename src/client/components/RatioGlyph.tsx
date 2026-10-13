import { cn } from "@/lib/cn";
import { ratioToNumber } from "@/lib/format";

/** Tiny outline rectangle whose proportions reflect the aspect ratio. */
export function RatioGlyph({ ratio, size = 14, className }: { ratio: string; size?: number; className?: string }) {
  const n = ratioToNumber(ratio);
  const box = { width: size, height: size };
  if (n === undefined) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center", className)} style={box} aria-hidden="true">
        <span className="block rounded-[2px] border-[1.5px] border-dashed border-current" style={{ width: size - 2, height: size - 2 }} />
      </span>
    );
  }
  const w = n >= 1 ? size : Math.max(5, Math.round(size * n));
  const h = n >= 1 ? Math.max(5, Math.round(size / n)) : size;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", className)} style={box} aria-hidden="true">
      <span className="block rounded-[2px] border-[1.5px] border-current" style={{ width: w, height: h }} />
    </span>
  );
}
