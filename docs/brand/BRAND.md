# higgsfree brand

The identity is one mark, one wordmark and the green. Everything in this folder is the source of
truth; `src/client/components/Logo.tsx` and the icons in `public/` are derived from it.

## The mark

A **looped script F**, black on a green tile. The top stroke is a soft wave ending in a rounded
tip, the stem drops into a closed loop at the bottom left, and a straight crossbar cuts to the
right. It is the F of "free", drawn by hand rather than set in a font.

`logo-source.png` is the original artwork (1254 x 1254, on the old lime tile). The F was traced
from it, then redrawn as the last frame of the load animation (`mark-crawl.json`), which rounded
the tip of the wave; that frame is the mark. Every file here draws the same single path
(`MARK_PATH` in `src/client/lib/mark.ts`, kept in sync by a test). Use the vectors; never trace
or redraw the glyph again.

### Geometry

- 64 unit tile. The glyph spans x 12.6..53.3 and y 12.4..50.9, so it fills 64 % of the tile
  width, sitting a hair above and right of centre as drawn. Keep that placement; scaled variants
  scale about the tile centre (32, 32).
- One path: a single outline that winds around the loop, filled with the default nonzero rule
  (it leaves the loop open). Never `evenodd`, which punches holes where the outline overlaps
  itself. No strokes, gradients, shadows or glow.
- Tile corners: square in `mark-square.svg` (as supplied, and for iOS, which masks itself);
  `rx` 15/64 everywhere the app draws the tile itself (`mark.svg`, favicon, PWA icons, the nav).

## Files

| File | Use |
|---|---|
| `logo-source.png` | The original artwork, kept as the reference. Not for use in the product |
| `mark.svg` | The logo: black F on the rounded green tile. App icon, avatar, nav |
| `mark-square.svg` | The same on a square full-bleed tile, exactly as supplied |
| `mark-mono.svg` | The F alone in `currentColor`, body at 75 % of the 64 box, for single-colour use |
| `lockup.svg` | Tile + wordmark (`#f5f5f5`) on transparent, for dark surfaces |
| `lockup-dark.svg` | The same lockup on a `#0a0a0a` rounded panel with built-in clear space; use in READMEs, slides and anywhere the background is not ours |
| `lockup-mono.svg` | `currentColor` F + wordmark |
| `icon-maskable.svg` | Source of `public/icon-maskable-512.png` |
| `og-image.svg` | Source of `public/og-image.png` |
| `mark-crawl.json` | Lottie (60 fps, 512 px artboard): a scribble that crawls into the F. The nav plays its `crawl` marker once on load (`components/MarkCrawl.tsx`, lottie-web), with the ink repainted `#171717`; its first and last frames are inlined in `lib/mark-crawl.ts` |

The wordmark in the SVGs is outlined (Inter Tight 700, tracking -0.01 em, kerned), so it renders
identically without the font. In the app the wordmark is live text (`Logo variant="lockup"`).

## Wordmark

"higgsfree", all lowercase, Inter Tight 700, letter-spacing -0.01 em, one colour. At a 24 px mark
the type is 15 px and the gap between mark and wordmark is 10 px; both scale linearly with the
mark (type = 0.625 x mark, gap = 0.42 x mark). The ascender-to-baseline band is centred on the tile.
Write it lowercase everywhere, even at the start of a sentence. The one exception is the app's
all-caps display headings (`text-display`), where it is set in caps with the rest of the line.

## Sizes and clear space

- Minimum tile size 16 px. Minimum lockup height 20 px (type 12.5 px); below that use the tile alone.
- Clear space around the tile and the lockup: half a tile on every side. `lockup-dark.svg` has
  16 units of padding baked in because the panel itself is the boundary.
- Top bar: the tile alone at 30 px, centred in a 46 px box with 15 px corners, so the tile's 7 px corners stay
  concentric at the 8 px inset. From `md` (768 px) the wordmark sits beside the tile, always; below
  it, the tile alone.
- README and social: `lockup-dark.svg` at 300 px wide; `og-image.png` 1200 x 630.

## Colour

- Green `#5dfd8c` and ink `#171717`. The green is the UI accent at rest (docs/DESIGN.md); the ink is
  sampled from the artwork and reads at 13.6:1 on the green. Every file here, the favicon, the PWA
  icons and the social card use exactly these values.
- The artwork's original lime `#d0f81e` is retired. It survives in `logo-source.png` and in one
  place in the product: on each page load the nav tile opens on it and sweeps to the green with the
  UI accent ("Accent on load" in docs/DESIGN.md). The glyph stays ink throughout.
- On dark (`#0a0a0a` to `#25252b`): the tile as is, wordmark `#f5f5f5`.
- On light: the tile as is, wordmark `#171717`. Never a green glyph or green wordmark on white.
- Monochrome (print, embossing, odd tab bars): `mark-mono.svg` in any single colour.

## Favicon and app icons (`public/`)

| File | Source | Notes |
|---|---|---|
| `favicon.svg` | tile, `rx` 15, glyph scaled 1.2x about the centre | Larger glyph so the 16 px tab icon keeps its loop open |
| `favicon-16.png`, `favicon-32.png` | `favicon.svg` | |
| `apple-touch-icon.png` (180) | `mark-square.svg` | iOS applies its own corner mask |
| `icon-192.png`, `icon-512.png` | `mark.svg` | Rounded tile, transparent corners |
| `icon-maskable-512.png` | `icon-maskable.svg` | Full bleed, glyph scaled 0.8x so its farthest point (the wave's tip) sits at 34.5 % of the side from the centre, inside the 40 % safe circle |
| `og-image.png` | `og-image.svg` | Lockup on `#0a0a0a` with the one-line descriptor |

Regenerate by rasterising the vectors, never by resampling a PNG:

```bash
rsvg-convert -w 16  -h 16  public/favicon.svg            -o public/favicon-16.png
rsvg-convert -w 32  -h 32  public/favicon.svg            -o public/favicon-32.png
rsvg-convert -w 180 -h 180 docs/brand/mark-square.svg    -o public/apple-touch-icon.png
rsvg-convert -w 192 -h 192 docs/brand/mark.svg           -o public/icon-192.png
rsvg-convert -w 512 -h 512 docs/brand/mark.svg           -o public/icon-512.png
rsvg-convert -w 512 -h 512 docs/brand/icon-maskable.svg  -o public/icon-maskable-512.png
rsvg-convert -w 1200 -h 630 docs/brand/og-image.svg      -o public/og-image.png
```

## Do not

- Recolour the tile or the glyph, or swap their colours (no green F on black tile). The nav tile's
  load sweep above is the only exception.
- Add a gradient, glow, shadow, outline, bevel or rotation. Do not animate it in the product
  beyond that colour sweep and the load crawl (`mark-crawl.json`: a scribble crawls into the F as the tile
  turns green; its last frame is the mark itself), and its replay when the nav's logo is clicked (the F
  crawls out to the right and back in from the left, ending on the mark).
- Stretch it, re-trace it, thin or thicken the stroke, or close or open the loop.
- Set the wordmark in another face, weight or case, or split its colours.
- Use the F as a letter in running text or as a generic icon (button, badge, status).
- Pair it with Higgsfield AI's own marks or imply endorsement. "Higgsfield" is their trademark;
  this project is independent (see the README disclaimer).
