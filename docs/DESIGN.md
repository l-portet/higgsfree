# higgsfree design spec

Derived from a live walkthrough of higgsfield.ai (Aug 2026). The goal is a faithful, *professional-minimal* interpretation:
Vercel/Linear dark discipline with Higgsfield's single lime accent. No neon, no glows, no gamer aesthetics.

## Tokens (Tailwind v4 `@theme` in `src/client/styles.css`)
```
--color-bg:         #0a0a0b   page background
--color-surface:    #1b1d1f   floating chrome: nav pills, the composer, dialogs
--color-surface-2:  #232629   on chrome: chips, the active nav tab, popovers, inputs' hover
--color-surface-3:  #2c3033   pressed / hovered chips, selected popover rows, tooltips
--color-panel:      #101012   quiet cards straight on the page (example prompts)
--color-inset:      #151719   fields inside chrome (the key input)
--color-border:     rgba(255,255,255,0.06)
--color-border-strong: rgba(255,255,255,0.11)
--color-fg:         #edefef
--color-fg-muted:   #a9aeaf
--color-fg-subtle:  #888e90   tertiary text: placeholders, sublines, inactive nav icons (6.4:1 on bg, 4.6:1 on surface-2)
--color-fg-disabled: #7e8486  not-ready Generate, the "no key" dot
--color-fg-faint:   #676c6e   decorative only: option-chip icons, dividers, dashed borders (never text)
--color-accent:     #defd5d   lime: Generate, the active tab's icon, the Sound toggle, the kept heart, NEW badge
--color-accent-hover: #d2f24c
--color-on-accent:  #141a05
--color-danger:     #f87171
--color-success:    #4ade80
```

### Corner radii

Measured from the mockups; every component uses these names (`rounded-control`, `rounded-card`, …), never raw
values or Tailwind's default scale. Nested surfaces stay concentric: inner radius = outer radius − inset.

| Token | px | Used for |
|---|---|---|
| `badge` | 4 | NEW / PRO model badges |
| `field` | 5 | text inputs, icon buttons inside dialogs, code chips, small provider tiles |
| `tag` | 6 | shortcut badges, overlay badges, stepper buttons (10 − 4) |
| `thumb` | 7 | thumbnails inside cards and the composer |
| `button` | 8 | text buttons, tooltips, skeletons |
| `control` | 10 | chips, steppers, Generate, the `+` button, nav tabs (15 − 5), popover rows (14 − 4), notices |
| `card` | 13 | cards on the page: example prompts, generation cards |
| `popover` | 14 | popovers and menus |
| `chrome` | 15 | the top bar boxes (logo tile inside: 7, at an 8 px inset) |
| `panel` | 18 | dialogs, settings sections |
| `dock` | 24 | the composer and the selection bar |

The global `:focus-visible` outline follows each element's own radius; nothing may set a radius on focus.
The chrome (nav, composer, dialogs) is one lifted grey (`surface`), and everything on it steps up ~8 RGB points per
layer (27 → 35 → 44) so chips read as raised on the bar and the selected row as raised in a popover. Quiet cards
on the page itself (`panel`) are barely lifted. Lime is reserved for Generate, the active tab's icon, an on toggle,
the kept heart and the NEW badge. The logo keeps its own lime (`#d0f81e`, docs/brand/BRAND.md); the UI does not use it.

Rules that follow from the tokens:
- **Not-ready Generate.** A primary button that is `aria-disabled` (empty prompt, no key) rests on `surface-2` with
  `fg-subtle` text and a `border-strong` edge and ignores hover; it turns lime only once the action is possible.
  `disabled` (loading) keeps the lime at 50 % opacity. Never show a half-transparent lime button as a resting state.
  Generate carries the shortcut as a badge (`⌘↵`, `Ctrl↵` elsewhere) on a slightly darker lime.
- **Toggles.** An on toggle chip (Sound) is a lime tint: `border-accent/45`, `bg-accent/15`, lime text and icon.
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

There is no page chrome: the app is four views under one floating nav, with one composer docked at the bottom.

- **Top bar**: three boxes floating 12 px from the top, centred, 8 px apart, over the content (`fixed`, `z-40`).
  Each box is 46 px tall: `surface`, 1 px `border`, `rounded-chrome` (15), `shadow-float` (a hairline of top light
  inside, a soft drop outside).
  - **Logo box**: 46 × 46, the brand tile at 30 px; links to the Image view.
  - **Views**: Image · Video · Assets · Favorites as 36 px tabs (`rounded-control`, `px-3`, `gap-2`, 2 px apart) in a
    4 px padded box. Labels 13 px medium, `-0.01em`. Icons sit in a 16 px box with 1.5 px strokes, sized to match the
    mock (14 px frames, a 12 px heart); the video frame, the tray and the key are drawn in `components/icons/nav.tsx`.
    Inactive: `fg-muted` label, `fg-subtle` icon. Active: raised (`surface-2`, `border-strong`, `shadow-raised`),
    `fg` label, lime icon. Below `sm` (640 px) the labels collapse to icons.
  - **Key box**: key icon, "Add key", 6 px dot (`fg-disabled`) until a key is set; then the remaining credits
    (`$12.34`) and a lime dot. Opens the API key dialog.
- **Content**: max-width 1400 px, 24 px page padding, 72 px top padding to clear the nav, bottom padding equal to the
  composer's measured height (`--composer-h`) + 16 px.
- **Composer**: fixed bottom centre, `max-w-[940px]`, `rounded-dock` (24), `surface`, `border`, `shadow-float`, 13 px
  inset. Row 1: a 33 px `+` (a rounded square, `rounded-control`, not a circle) · attached-image thumbnails (33 px,
  `rounded-thumb`, tagged 1st / Last / Ref for video) · the prompt (15 px on a 24 px line, padded to 33 px so it sits
  level with the `+`, auto-growing to 6 lines), 14 px apart. Row 2, 8 px below: option chips left, 6 px apart; the
  estimate (`~$0.13`, 13 px `fg-subtle`) and Generate right. Chips are 36 px, `rounded-control`, `surface-2`,
  `border-strong`, 13 px medium with `-0.01em`. Option chips: `fg-muted` label, `fg-faint` icon. The model chip names
  the thing: `fg` label and icon. Generate: 13 px semibold, `px-3.5`, shortcut badge `rounded-tag` on `black/10`.
  ⌘/Ctrl+Enter submits; the whole bar is a drop target and accepts pasted images. It is one global surface: it follows the Image
  and Video views and keeps its last mode on Assets and Favorites, where a submit navigates to the matching view.
  While asset selection is active the composer steps aside for the selection bar.

## Image view (`/image`)
- Empty: centred block. Title 20 px semibold, `-0.02em`; 8 px below, a 13 px `fg-subtle` line of guidance on a 20 px
  line, `max-w-[400px]` with balanced wrapping; 24 px below, three example prompts 8 px apart as 528 px rows
  (`panel`, `border`, `rounded-card` (13), 11 px padding, a 58 px 4:3 gradient swatch with `rounded-thumb` (7), 13 px
  `fg-muted` text on a 19 px line). Clicking one fills the composer and focuses it.
- Feed: masonry grid (`minmax(260px, 1fr)` from `sm`, 160 below) newest first, each card at its real ratio.
  Pending cards show a shimmer skeleton with model name + elapsed timer. Failed cards show the provider error verbatim
  with Retry. Hover overlay: Keep (heart) · Download · Animate (→ Video with this image as first frame) · Reuse prompt
  · Delete, plus one truncating info badge `"{model} · {params} · {cost}"`. A kept card shows a small lime heart badge.
- Composer chips: [⟨provider mark⟩ Nano Banana Pro ˅] [▭ 1:1] [◇ 1K] [− 1/4 +]. `+` adds reference images (up to the
  largest count any model takes; the picker dims models that cannot take what is attached).

## Video view (`/video`)
- Same empty block ("Your video runs land here") with three example shots.
- Feed: same grid of video cards with inline `<video muted loop playsInline>` preview on hover, duration + resolution
  + cost in the badge, a "N rendering · usually 2–5 min" line above while clips render.
- Composer chips: [⟨mark⟩ Seedance 2.5 ˅] [▭ 16:9] [⏱ 5s] [◇ 720p] [⫶ Sound] [− 1/4 +]. Duration opens a stepper +
  slider (ranges) or a list (fixed options) limited to the model's values; aspect ratio locks to the first frame for
  models that drop it on i2v; resolution is a list with per-option estimates; Sound is a lime toggle shown only for
  models with native audio; the count runs that many independent jobs. `+` opens a small menu: first frame, last
  frame (models with `caps.lastFrame`), style reference (unless the model rejects references). Dropped or pasted
  images fill those slots in that order. Image-to-video is implicit: a frame attached is the mode.

## Assets view (`/assets`)
- Empty: "Nothing generated yet" with one line, no toolbar.
- Otherwise a count line ("9 generations · 410 KB") with Select at the right, a toolbar of type chips (All · Images ·
  Videos), a status dropdown and a search field (`/` focuses it), then the grid. Select turns cards into checkboxes
  (shift-click for ranges, ⌘A for all) with a floating selection bar: Download / Delete / Done.
- Clicking a card opens the **Lightbox** (full-screen dialog): media left, metadata right (prompt with copy, model,
  params, cost, created, elapsed, provider job id, inputs) and actions (Download, Animate, Reuse prompt, Keep, Retry,
  Delete). ← → move between items.

## Favorites view (`/favorites`)
- The kept runs, images and videos together, newest first, type badge on each card. Empty: "Nothing kept yet. Hover a
  run and press its heart to keep it here."

## API key dialog and Settings
- The key box opens a 440 px dialog (`rounded-panel`, 20 px padding): "API key" (16 px semibold), a 13 px `fg-subtle`
  paragraph (the key stays in this browser and only goes to openrouter.ai), a 13 px label, a 34 px password field on
  `inset` (`rounded-field`), Test and Get a key (or Remove once a key is saved) on the left, "Save key" (34 px primary,
  `rounded-button`) on the right; the close button is 32 px, `rounded-field`, at the 20 px corner. The saved key is
  shown masked with the remaining credits. A footer link leads to the full Settings page (`/settings`, not in the nav).
- **Settings** is a 760 px column of cards (`rounded-panel`): OpenRouter key (masked key, Save / Test connection /
  Remove key, a Connected / Not set badge), Credits (remaining, used, purchased, a usage bar, Refresh), Default
  models, Library, About (version, "This browser (IndexedDB)", MIT, links).
- **Library card**: a usage line ("Using 1.2 GB of 60 GB the browser allows") over a thin bar (lime, `danger` from
  90 %), then two tiles, Images and Videos (count · size, files), with a reference-images line under them. Below a
  divider, "Protected from eviction" with a Yes / Not yet badge and a Protect button while it is not (Safari gets a
  note about the 7-day eviction). Then Backup: Export library… / Import… side by side; while an archive is written or
  read, a progress line ("Packing 12 / 40…", "Importing 3 / 40…") and a bar, with the other button disabled. Last,
  Delete everything (danger, confirm dialog) with a reminder that everything lives in this browser.

## Motion & polish
- 150ms ease-out transitions for hover/active; popovers fade+scale 4%. Skeleton shimmer 1.6s.
- Toasts (sonner, top-right so the fixed prompt bar never covers them, dark). Focus rings `ring-2 ring-accent/60`. All icon buttons have `aria-label`.
- Mobile: nav collapses to icons; video panel stacks above the canvas; prompt bar goes full-width.
