# Open Higgsfield brand

The identity is one mark, one wordmark and one accent. Everything in this folder is the source of
truth; `src/client/components/Logo.tsx` and `src/client/public/` are derived from it.

## The mark

An **H with its crossbar cut open**. Two stems, two short stubs, and a full-height slot of light
running straight through the middle of the letter. Read it as an open gate or a camera aperture:
the H is Higgsfield, the opening is what this project adds.

Why it won over the three alternates (see `candidates.png` and `alternates/`): it carries the
name (it is still plainly an H at 16 px), the "open" idea lives in the geometry rather than in a
tagline, and it stays ownable next to the provider marks in the model picker. The bracket pair
reads as a crop or code icon, the play-H reads as a "skip forward" button, and the stacked bars
read as a menu. None of those is a name; this one is.

It is not, and must never become, an interlocking loop, a lens, a sparkle or an "AI" glyph. It is
also not a generic icon: never use it for a button, a status badge or as the "H" in a sentence.

### Geometry

- 64 unit grid, 8 unit margin, so the body is 48 x 48 (75 % of the box).
- Stems 12 wide at x 8..20 and 44..56. Crossbar band y 24..36 (12 tall, centred slightly above the
  middle, as an H should be). Stubs 8 long, gap 8. Outer corners r 3, cut ends square.
- Every edge sits on a multiple of 4, so at 16 px the glyph is 3 px stems, 2 px stubs and a
  2 px gap with no anti-aliasing; at 32 px everything doubles. At 24 px (the nav) the inner
  edges land on half pixels, which is fine on a dark ground.
- Single path, no strokes, no gradients, no shadows, no glow, no rotation.

## Files

| File | Use |
|---|---|
| `mark.svg` | Lime `#d4f53c` mark on transparent, for dark surfaces |
| `mark-mono.svg` | `currentColor` mark: white on dark, black on light, or any single UI colour |
| `mark-on-lime.svg` | Dark mark on the lime tile (`rx` 15/64, glyph at 61 %), the app-icon and avatar tile |
| `lockup.svg` | Mark + wordmark on transparent (lime mark, `#f5f5f5` wordmark) for dark surfaces, 380 x 64 |
| `lockup-dark.svg` | The same lockup on a `#0a0a0a` rounded panel with built-in clear space; use in READMEs, slides and anywhere the background is not ours |
| `lockup-mono.svg` | `currentColor` lockup |
| `candidates.png` | The contact sheet the mark was chosen from |
| `alternates/*.svg` | The three runners-up, kept so the mark can be swapped |

The wordmark in the lockup SVGs is outlined (Inter Tight 700, tracking -0.01 em), so it renders
identically without the font. In the app the wordmark is live text (`Logo variant="lockup"`).

## Wordmark

"Open Higgsfield", Inter Tight 700, letter-spacing -0.01 em, sentence case, one colour. At a 24 px
mark the type is 15 px and the gap between mark and wordmark is 10 px; both scale linearly with
the mark (type = 0.625 x mark, gap = 0.42 x mark). The caps are centred on the mark body.

The wordmark is one colour on purpose. Muting "Open" would make "Higgsfield" the brand, which is
the opposite of what the name says and not something an unaffiliated project should do.

## Sizes and clear space

- Minimum mark size 16 px. Minimum lockup height 20 px (type 12.5 px); below that use the mark alone.
- Clear space around the mark and the lockup: one mark height on every side. `lockup-dark.svg`
  has 24 units of padding baked in (half a mark height) because the panel itself is the boundary.
- Nav: lockup at 24 px, wordmark hidden below the `sm` breakpoint (640 px), mark always visible.
- README and social: `lockup-dark.svg` at 280 px wide; `og-image.png` 1200 x 630.

## Colour

- On dark (`#0a0a0a` to `#25252b`): lime mark `#d4f53c`, wordmark `#f5f5f5`.
- On light: never lime on white (1.3:1). Use `mark-mono.svg` in `#0a0a0a`, or the lime tile.
- On lime (`#d4f53c`): dark `#0a0a0a` only, which is the tile.
- Monochrome (print, embossing, favicon on odd tab bars): `mark-mono.svg` in any single colour.
- The lime is the app's accent; the mark is the only place it appears next to the wordmark.

## Favicon and app icons (`src/client/public/`)

- `favicon.svg`: lime tile, glyph at 75 % so the 16 px tab icon keeps 3 px stems. The tile is
  opaque, so it reads the same on light and dark tab strips; no colour-scheme media query needed.
- `favicon-16.png`, `favicon-32.png`: rasterised from `favicon.svg` at 1x, pixel-exact.
- `apple-touch-icon.png` (180): square lime tile, glyph at 61 %; iOS applies its own corner mask.
- `icon-192.png`, `icon-512.png`: rounded tile from `mark-on-lime.svg`. `icon-maskable-512.png`:
  full-bleed lime with the glyph at 47 %, inside the maskable safe zone.
- `og-image.png`: lockup centred on `#0a0a0a` with the one-line descriptor.
- Regenerate with headless Chrome at device scale factor 1 from the SVGs. Do not resample the
  PNGs with an image tool; re-rasterise from the vector.

## Do not

- Recolour the mark to anything but lime, `#0a0a0a`, `#f5f5f5` or the current UI text colour.
- Put the lime mark on a light or lime background, or the dark mark on a dark one.
- Add a gradient, glow, shadow, outline, bevel or rotation. Do not animate it in the product.
- Stretch it, change the gap, round the cut ends, or close the crossbar.
- Set the wordmark in another face, weight or case, or split its colours.
- Place it inside another shape, or use the H as a letter in running text.
- Use it as a generic icon (button, badge, avatar for something that is not this project).
- Pair it with Higgsfield AI's own marks or imply endorsement. "Higgsfield" is their trademark;
  this project is independent (see the README disclaimer).
