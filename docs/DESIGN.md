# higgsfree design spec

Derived from a live walkthrough of higgsfield.ai (Aug 2026). The goal is a faithful, *professional-minimal* interpretation:
Vercel/Linear dark discipline with Higgsfield's single lime accent. No neon, no glows, no gamer aesthetics.

## Tokens (Tailwind v4 `@theme` in `src/client/styles.css`)
```
--color-bg:         #0a0a0a   page background
--color-surface:    #141417   panels, prompt bar, cards
--color-surface-2:  #1c1c20   elevated (popovers, chips on the bar, hover rows)
--color-surface-3:  #25252b   pressed / active chips, selected popover rows
--color-border:     rgba(255,255,255,0.10)
--color-border-strong: rgba(255,255,255,0.16)
--color-fg:         #f5f5f5
--color-fg-muted:   #a1a1aa
--color-fg-subtle:  #93939c   tertiary text (6.0:1 on surface, 5.0:1 on surface-3, AA on all surfaces)
--color-fg-faint:   #6b6b73   decorative only: icons, chevrons, dividers, dashed borders (never text)
--color-accent:     #d4f53c   lime: primary CTA, active nav underline, selected check, NEW badge
--color-accent-hover: #c6e832
--color-on-accent:  #0a0a0a
--color-danger:     #f87171
--color-success:    #4ade80
--radius-sm: 8px  --radius-md: 12px  --radius-lg: 16px  --radius-xl: 20px
```
Each layer steps up 8 to 10 RGB points (bg 10 → surface 20 → surface-2 28 → surface-3 37), so chips read as
raised on the prompt bar and the selected row reads as raised in a popover. Lime is reserved for the primary CTA,
the active nav underline, the selected check and the NEW badge.

Rules that follow from the tokens:
- **Not-ready Generate.** A primary button that is `aria-disabled` (empty prompt, no key) rests on `surface-2` with
  `fg-muted` text and a `border` edge and ignores hover; it turns lime only once the action is possible. `disabled`
  (loading) keeps the lime at 50 % opacity. Never show a half-transparent lime button as a resting state.
- **Card badges.** Completed media cards have no border (edge-to-edge media, `rounded-lg`); the hover overlay shows
  one truncating info badge, `"{model} · {params} · {cost}"`, plus an audio glyph badge, never a wrapping row of
  tags. Pending and failed cards keep their border. In mixed lists the Image / Video type badge sits top-left.
- **NEW badge.** Solid lime (`bg-accent text-on-accent`), 16 px, 10 px bold uppercase, 4 px radius. PRO / FAST /
  BETA stay neutral on `surface-3`.

Fonts: `Inter` for UI (Google Fonts, `font-feature-settings: "cv11","ss01"`), `Inter Tight` 800 for display headings
(uppercase, `tracking-[-0.02em]`, `leading-[0.95]`). Both with `system-ui` fallback.

## Typography scale (`@utility` in `src/client/styles.css`)

One utility per kind of text; add a color or weight utility after it when the default doesn't fit
(`text-meta text-danger`, `text-body font-medium`). Letter-spacing only on `text-display` and `text-label`.
Timers, costs and counters add `tabular-nums` so digits don't jitter.

| Utility | Size / weight / line-height | Color | Used for |
|---|---|---|---|
| `text-display` | Inter Tight 800, uppercase, `-0.02em`, 0.95 | inherits | Hero and empty-state headings (size set per use: 40–72px) |
| `text-title` | 20px / 600 / 1.1 | `fg` | Page titles (`PageHeader`) |
| `text-heading` | 15px / 600 / 1.2 | `fg` | Card, dialog, empty-state and home-section headings |
| `text-lead` | 15px / 400 / 1.5 | `fg-muted` | Subline under a display heading |
| `text-label` | 11px / 500 / 1.2, uppercase, `0.06em` | `fg-subtle` | Section and field labels, picker groups, stat labels |
| `text-body` | 13px / 400 / 1.5 | inherits | Descriptions, prompts, dialog bodies, list rows |
| `text-meta` | 12px / 400 / 1.4 | `fg-muted` | Card meta, hints, tooltips, toast descriptions, inline errors |
| `text-caption` | 11px / 400 / 1.4 | `fg-subtle` | Captions, footers, keyboard hints, ratio labels |
| `text-mono` | mono 12px / 1.4, tabular | inherits | Ids, slugs, paths, masked keys, stack traces |

Long prompts, model names and paths truncate (`truncate`, `line-clamp-2`) with the full text in `title` or the lightbox.
Copy rules: sentence case (display headings excepted), no em dashes in prose (the standalone `—` empty-value glyph in
data cells is fine), one or two short sentences per hint / toast / empty state.

## Layout
- **Top nav** 56px, sticky, `bg-bg/80 backdrop-blur`, bottom border. Left: the logo tile (black script F on lime, `Logo` in `src/client/components/Logo.tsx`) + "higgsfree" wordmark.
  Full-bleed (`px-3 sm:px-5`, no inner max-width). Center-left links: Home · Image · Video · Assets. Active link = fg + 2px lime underline. Right: credits pill (`h-8`, wallet icon, `$1,362.69 left`) and Settings (gear). GitHub lives in Settings › About, not in the nav.
- Content max-width 1400px, page padding 24px.

## Image page (`/image`)
- Empty state centered: 3–4 slightly rotated sample cards (no hotlinked images; bundled sample stills in `public/samples/` are fine, with a CSS-gradient fallback underneath) + display heading
  "START CREATING WITH" / lime "HIGGSFREE" + muted subline.
- Results: responsive grid (`grid-cols-[repeat(auto-fill,minmax(260px,1fr))]`) newest first, each card keeps its aspect ratio.
  Pending cards show a shimmer skeleton with model name + elapsed timer. Failed cards show the provider error with a Retry button.
  Hover overlay: Download · Animate (→ /video with this image as first frame) · Reuse prompt · Delete.
- **Prompt bar**: fixed bottom center, `max-w-[960px] w-[calc(100%-32px)]`, `rounded-2xl bg-surface/90 backdrop-blur border`.
  Row 1: `+` round button (reference images: opens file picker, shows thumbnails with ✕) + auto-growing textarea "Describe the scene you imagine".
  Row 2: chips left → [G Nano Banana Pro ›] [▭ 3:4] [◇ 1K] [− 1/4 +]; right → **Generate** lime button with `~$0.13` estimate.
  ⌘/Ctrl+Enter submits.
- **Model picker** (Radix Popover, `w-[360px] max-h-[520px]`): search input on top; groups "Featured" and "All models";
  row = 36px provider tile (initial letter / glyph) · name · badge (NEW lime / PRO neutral / FAST) · muted description · ✓ on selected.
  Rows that don't support the current mode (e.g. no i2i while references are attached) are dimmed with a tooltip.
- Aspect ratio popover: list with a tiny outline rectangle icon reflecting the ratio. Quality popover: 1K · 2K · 4K (badge "Pro").

## Video page (`/video`)
- Two-column: left panel `w-[300px]` sticky; right canvas.
- Left panel sections (each a `surface` card): mode tabs "Text to Video" / "Image to Video";
  references dropzone ("Add first frame" with paste/drag; last-frame slot when the model supports it);
  Prompt textarea; Model selector (row style: label "Model", name, chevron) opening the same picker but rows show chips `1080p` `4s–30s` and a 🔊 glyph when the model has audio;
  controls row: [⏱ 5s] [▭ 16:9] [◇ 1080p]; duration is a stepper/select limited to the model's allowed values (snap on model change);
  **Generate** full-width lime button with `~$1.17` estimate; small helper text under it for unverified models ("Option ranges are best-effort. Provider errors are shown verbatim.").
- Canvas: tabs "History" / "How it works". Empty state: display heading "MAKE VIDEOS IN ONE CLICK" + 3 step cards (Add image → Choose model → Get video).
  History = grid of video cards with inline `<video muted loop playsInline>` preview on hover, duration + resolution + cost badges.
  Pending cards: skeleton + "Rendering · 1:42" elapsed + model name. Failed: error + Retry.

## Assets page (`/assets`)
- Filter chips: All · Images · Videos; sort newest. Same card grid. Clicking opens a **Lightbox** (Radix Dialog, full-height):
  media left, metadata right (prompt with copy, model, params, cost, created, elapsed, provider job id), actions (Download, Animate, Reuse, Delete).
  ← → keyboard navigation between items.

## Settings (`/settings`)
- Card "OpenRouter key": password input, Save, Test connection → shows key label, credits total/used/remaining, spend limit.
  If the key comes from env, show a read-only notice. Link "Get a key → openrouter.ai/keys".
- Card "Defaults": default image / video model selects.
- Card "Storage": data dir, count + size of media.

## Home (`/`)
- Hero: display heading "AI-NATIVE CREATIVE SUITE, OPEN." + subline about BYO OpenRouter key; two CTAs (Create image · Create video).
- Feature tiles (Image · Video · Assets) styled like Higgsfield's tile cards (icon top-left, type chip top-right, title, muted subline).
- "Recent" strip of the last 8 generations.

## Motion & polish
- 150ms ease-out transitions for hover/active; popovers fade+scale 4%. Skeleton shimmer 1.6s.
- Toasts (sonner, top-right so the fixed prompt bar never covers them, dark). Focus rings `ring-2 ring-accent/60`. All icon buttons have `aria-label`.
- Mobile: nav collapses to icons; video panel stacks above the canvas; prompt bar goes full-width.
