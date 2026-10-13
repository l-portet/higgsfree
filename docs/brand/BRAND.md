# higgsfree brand

The identity is one mark, one wordmark and the lime. Everything in this folder is the source of
truth; `src/client/components/Logo.tsx` and the icons in `public/` are derived from it.

## The mark

A **looped script F**, black on a lime tile. The top stroke is a soft wave, the stem drops into
a closed loop at the bottom left, and a straight crossbar cuts to the right. It is the F of
"free", drawn by hand rather than set in a font.

`logo-source.png` is the original artwork (1254 x 1254). Every other file was traced from it once
into a single vector path, which matches the original to 99.7 % of its pixels. Use the vectors;
never trace or redraw the glyph again.

### Geometry

- 64 unit tile. In the supplied composition the glyph spans x 12.6..51.8 and y 12.4..50.9, so it
  fills 61 % of the tile width, sitting a hair above and right of centre as drawn. Keep that
  placement; scaled variants scale about the tile centre (32, 32).
- One path, `fill-rule="evenodd"` (the loop is a hole). No strokes, gradients, shadows or glow.
- Tile corners: square in `mark-square.svg` (as supplied, and for iOS, which masks itself);
  `rx` 15/64 everywhere the app draws the tile itself (`mark.svg`, favicon, PWA icons, the nav).

## Files

| File | Use |
|---|---|
| `logo-source.png` | The original artwork, kept as the reference. Not for use in the product |
| `mark.svg` | The logo: black F on the rounded lime tile. App icon, avatar, nav |
| `mark-square.svg` | The same on a square full-bleed tile, exactly as supplied |
| `mark-mono.svg` | The F alone in `currentColor`, body at 75 % of the 64 box, for single-colour use |
| `lockup.svg` | Tile + wordmark (`#f5f5f5`) on transparent, for dark surfaces |
| `lockup-dark.svg` | The same lockup on a `#0a0a0a` rounded panel with built-in clear space; use in READMEs, slides and anywhere the background is not ours |
| `lockup-mono.svg` | `currentColor` F + wordmark |
| `icon-maskable.svg` | Source of `public/icon-maskable-512.png` |
| `og-image.svg` | Source of `public/og-image.png` |

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
- Nav: lockup at 24 px, wordmark hidden below the `sm` breakpoint (640 px), tile always visible.
- README and social: `lockup-dark.svg` at 300 px wide; `og-image.png` 1200 x 630.

## Colour

- Lime `#d0f81e` and ink `#171717`, both sampled from the artwork. The logo keeps these exact
  values; it does not follow the UI accent (`#d4f53c`, docs/DESIGN.md), which is close but not
  the same colour.
- On dark (`#0a0a0a` to `#25252b`): the tile as is, wordmark `#f5f5f5`.
- On light: the tile as is, wordmark `#171717`. Never a lime glyph or lime wordmark on white.
- Monochrome (print, embossing, odd tab bars): `mark-mono.svg` in any single colour.

## Favicon and app icons (`public/`)

| File | Source | Notes |
|---|---|---|
| `favicon.svg` | tile, `rx` 15, glyph scaled 1.2x about the centre | Larger glyph so the 16 px tab icon keeps its loop open |
| `favicon-16.png`, `favicon-32.png` | `favicon.svg` | |
| `apple-touch-icon.png` (180) | `mark-square.svg` | iOS applies its own corner mask |
| `icon-192.png`, `icon-512.png` | `mark.svg` | Rounded tile, transparent corners |
| `icon-maskable-512.png` | `icon-maskable.svg` | Full bleed, glyph scaled 0.8x so its farthest point sits at 35 % of the side from the centre, inside the 40 % safe circle |
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

- Recolour the tile or the glyph, or swap their colours (no lime F on black tile).
- Add a gradient, glow, shadow, outline, bevel or rotation. Do not animate it in the product.
- Stretch it, re-trace it, thin or thicken the stroke, or close or open the loop.
- Set the wordmark in another face, weight or case, or split its colours.
- Use the F as a letter in running text or as a generic icon (button, badge, status).
- Pair it with Higgsfield AI's own marks or imply endorsement. "Higgsfield" is their trademark;
  this project is independent (see the README disclaimer).
