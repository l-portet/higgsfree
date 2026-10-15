# higgsfree design spec

Derived from a live walkthrough of higgsfield.ai (Aug 2026). The goal is a faithful, *professional-minimal* interpretation:
Vercel/Linear dark discipline with a single accent: green `#5dfd8c`, which each page load reaches from Higgsfield's lime.
No neon, no glows, no gamer aesthetics.

## Tokens (Tailwind v4 `@theme` in `src/app/globals.css`)
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
--color-accent:     #defd5d → #5dfd8c   lime at load, then green (Accent on load): Generate, the active tab's icon, the Sound toggle, the kept heart, NEW badge
--color-accent-hover: #d2f24c → #4ef181
--color-on-accent:  #141a05 → #021c09
--color-danger:     #f87171
--color-warning:    #fbbf24   amber: the composer's provider notice (a model whose provider has no key)
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
on the page itself (`panel`) are barely lifted. The accent is reserved for Generate, the active tab's icon, an on toggle,
the kept heart and the NEW badge. The logo's tile is the same green (`#5dfd8c`, docs/brand/BRAND.md); on load it sweeps
there from the old brand lime (`#d0f81e`) with the accent.

Rules that follow from the tokens:
- **Not-ready Generate.** A primary button that is `aria-disabled` (empty prompt, no key) rests on `surface-2` with
  `fg-subtle` text and a `border-strong` edge and ignores hover; it turns to the accent only once the action is possible.
  `disabled` (loading) keeps the accent at 50 % opacity. Never show a half-transparent accent button as a resting state.
  Generate carries the shortcut as a badge (`⌘↵`, `Ctrl↵` elsewhere) on a slightly darker accent.
- **Toggles.** An on toggle chip (Sound) is an accent tint: `border-accent/45`, `bg-accent/15`, accent text and icon.
- **Card badges.** Completed media cards have no border (edge-to-edge media, `rounded-lg`); the hover overlay shows
  one truncating info badge, `"{model} · {params} · {cost}"`, plus an audio glyph badge, never a wrapping row of
  tags. Pending and failed cards keep their border. In mixed lists the Image / Video type badge sits top-left.
- **NEW badge.** Solid accent (`bg-accent text-on-accent`), 16 px, 10 px bold uppercase, 4 px radius. PRO / FAST /
  BETA stay neutral on `surface-3`.

Fonts: `Inter` for UI (Google Fonts, `font-feature-settings: "cv11","ss01"`), `Inter Tight` 800 for display headings
(uppercase, `tracking-[-0.02em]`, `leading-[0.95]`). Both with `system-ui` fallback.

## Typography scale (`@utility` in `src/app/globals.css`)

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
  - **Logo box**: the brand tile at 30 px with the "higgsfree" wordmark beside it (Inter Tight 15 px bold), always,
    from `md` (768 px); below it the box is the 46 × 46 tile alone (no room beside the tab labels, and phones need
    the space). Links to the Video view (the default).
  - **Views**: Video · Image · Assets · Favorites as 36 px tabs (`rounded-control`, `px-3`, `gap-2`, 2 px apart) in a
    4 px padded box. Labels 13 px medium, `-0.01em`. Icons sit in a 16 px box with 1.5 px strokes, sized to match the
    mock (14 px frames, a 12 px heart); the video frame, the tray and the key are drawn in `components/icons/nav.tsx`.
    Inactive: `fg-muted` label, `fg-subtle` icon. Active: raised (`surface-2`, `border-strong`, `shadow-raised`),
    `fg` label, accent icon. Below `sm` (640 px) the labels collapse to icons.
  - **Key box**: key icon, "Add key", 6 px dot (`fg-disabled`) until a key is set (opens the key dialog); then the
    remaining credits (`$12.34`) and an accent dot (opens Settings on the OpenRouter section).
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
- **Missing key** (`useKeyGate`): Generate is never blocked by a missing key. Pressed while the selected model's
  provider has no key, it opens the key dialog for that provider, whose primary button reads "Save and generate":
  the key is checked, saved, and the generation starts. When the user has the other provider's key (a fal-only model
  with only an OpenRouter key, or the reverse), a notice also sits at the top of the composer, 10 px above row 1
  (`ComposerNotice`): `rounded-control`, `border-warning/25` on `bg-warning/5`, a 14 px `warning` alert icon, the
  sentence in `text-meta` ("Kling 3.0 Motion Control runs on fal.") and an "Add fal key" text button that opens the
  same dialog. It goes away once the key is saved. The model list carries no provider tag.

## Image view (`/image`)
- Empty: centred block. Title 20 px semibold, `-0.02em`; 8 px below, a 13 px `fg-subtle` line of guidance on a 20 px
  line, `max-w-[400px]` with balanced wrapping; 24 px below, three example prompts 8 px apart as 528 px rows
  (`panel`, `border`, `rounded-card` (13), 11 px padding, a 58 px 4:3 gradient swatch with `rounded-thumb` (7), 13 px
  `fg-muted` text on a 19 px line). Clicking one fills the composer and focuses it.
- Feed: a grid of identical square cells (`minmax(260px, 1fr)` from `sm`, 160 below), newest first (`FeedGrid`).
  Every card keeps its cell in every state, so nothing resizes or reshuffles when a run completes: media cover the
  cell (the lightbox shows the whole frame), pending cards show a shimmer skeleton with model name + elapsed timer,
  and failed cards show as much of the provider error and prompt as the cell's height holds, with Retry and Details
  (the full text). The loading skeletons and the route fallback use the same cells. Assets and Favorites keep the
  masonry (each card at its real ratio). Hover overlay: Keep (heart) · Download · Animate (→ Video with this image as first frame) · Reuse prompt
  · Delete, plus one truncating info badge `"{model} · {params} · {cost}"`. A kept card shows a small accent heart badge.
- Composer chips: [⟨provider mark⟩ Nano Banana Pro ˅] [▭ 1:1] [◇ 1K] [− 1/4 +]. `+` adds reference images (up to the
  largest count any model takes; the picker dims models that cannot take what is attached).

## Video view (`/video`)
- Same empty block ("Your video runs land here") with three example shots.
- Feed: the same grid with identical 16:9 cells, video cards with inline `<video muted loop playsInline>` preview on
  hover, duration + resolution + cost in the badge. One line above it, always there so the grid never moves:
  "N rendering · usually 2–5 min" while clips render, the clip count otherwise.
- Composer chips: [⟨mark⟩ Seedance 2.5 ˅] [▭ 16:9] [⏱ 5s] [◇ 720p] [⫶ Sound] [− 1/4 +]. Duration opens a stepper +
  slider (ranges) or a list (fixed options) limited to the model's values; aspect ratio locks to the first frame for
  models that drop it on i2v; resolution is a list with per-option estimates; Sound is an accent toggle shown only for
  models with native audio; the count runs that many independent jobs. `+` opens a small menu: first frame, last
  frame (models with `caps.lastFrame`), style reference (unless the model rejects references). Dropped or pasted
  images fill those slots in that order. Image-to-video is implicit: a frame attached is the mode.
- Motion control (Kling 3.0 Motion Control, `caps.motionControl`): `+` offers "Character image" and "Reference
  video"; dropped images fill the character, dropped videos the reference. One chip replaces duration, aspect
  ratio, resolution and Sound: [Follow video ˅] / [Follow image ˅], with the reference video's limit (30 s / 10 s)
  in the menu. The clip length follows the reference video, so there is no estimate. The prompt is optional.

- **AI Prompt Editor**: in the video composer, a sparkle square under the `+` (same 33 px `rounded-control` button,
  6 px below it; tooltip "Prompt Editor: rewrite with AI, preview a frame"); row 2 keeps its options. It opens a dialog (`PromptEditorDialog`, 880 px): the prompt on the left in an
  editable field seeded from the composer, a "change" field with Rewrite (Write when the prompt is empty) and four
  quick changes as small chips (More cinematic, Add camera motion, More detail, Make it shorter); GPT-6 Luna's
  rewrite streams into the field, with Undo and a line naming the model and the real cost. On the right, a preview
  frame at the video's ratio (a portrait one is 300 px tall): GPT Image 2.5 Flare at low quality, with the first
  frame as a reference when one is attached, its cost, and a note that it is a quick look, not saved. Footer: Cancel
  and Use prompt (the only accent button), which puts the text in the composer. Both calls run on the OpenRouter key;
  without one, the key dialog opens and the action runs once the key is saved. Errors show verbatim under each half.
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
  run and press its heart to keep it here." A header line ("12 kept · 2 folders") carries New folder on the right.
- **Folders** take the first positions of the grid as square tiles (`rounded-card`, `surface-2`, 1 px `border`): a
  cover made of the folder's newest runs (one, a split, one big and two small, or a 2 × 2), the name with a folder
  glyph and the count over a bottom gradient, Rename / Delete as overlay icon buttons on hover. Tiles show newest first (a rename keeps the place).
  Clicking one opens the folder at `?folder=<id>` (so Back returns to All): a header with ← All, the name, the count,
  Rename and Delete, then only that folder's runs, paged on their own. A run is in at most one folder, and a filed run
  shows only inside it: All holds the folders and the kept runs in no folder. The header count totals both. Deleting
  a folder never deletes runs: they stay kept and come back to All.
- **Drag and drop.** In All, every card can be dragged onto a tile. While a drag is on, the tiles get a dashed accent
  edge and the one under the pointer an accent ring; dropping files the run there ("Moved to Travel"), so it leaves
  All, and makes that folder the heart's default.
- **The heart** (cards and the lightbox) keeps a run in one click, in the last destination picked (a folder, or All),
  and opens a small menu anchored to it: "Kept in Travel", a list (All, then the folders, the current one checked),
  New folder… (an inline field) and Remove from Favorites. On a kept run the heart opens the same menu, to move or
  remove it. A kept card's accent heart badge carries the folder's name.

## Key dialog and Settings
- **Key dialog** (`KeyDialog`, 400 px, `rounded-panel`, 20 px padding): one provider. "Add your OpenRouter key" /
  "Add your fal key" (16 px semibold), a 13 px `fg-subtle` line (why, when Generate opened it: "Kling 3.0 Motion
  Control runs on fal.", then that the key stays in this browser and only goes to that provider), a 34 px monospace
  password field on `inset` with a show / hide toggle, a "Use a dedicated key with a spend limit" hint (or the
  error in `danger` when the provider rejects the key), Get a key on the left and the primary button on the right:
  "Save and generate" when Generate opened it, "Save key" otherwise. The key is tested before it is saved; only a
  clear rejection blocks it. Footer: "All settings" opens the Settings dialog on Keys.
- **Settings** is a dialog (`SettingsDialog`, 880 px wide, up to 640 px tall, no separate page): a 208 px sidebar on
  `inset` with "Settings" and the sections Keys, Library, Notifications, About (36 px rows,
  `rounded-control`; the open one raised on `surface-2`), and the open section's cards on the right, shown flat
  (no card border or fill, sections separated by a divider). Below `sm` the sections become a scrolling row under the
  title. Keys: the OpenRouter key (masked key, Save / Test connection / Remove key, a Connected / Not set badge),
  then the fal key card. There is no credits breakdown (the key box shows the balance) and no default-model setting:
  each composer starts on the app's default and then remembers the last model picked. Old `/settings` links (`#fal`,
  `#providers`, `#library`…) open the dialog over the Image view.
- **fal key card**: the OpenRouter
  card's anatomy, titled "fal key" with a Connected / Not set badge, a line naming the fal-only models with a link to
  fal.ai/dashboard/keys, a monospace password field (`key_id:key_secret`), Save / Test connection / Remove key
  (confirm dialog). Below a divider, "Run models both providers offer on": a two-option segmented control, OpenRouter
  · fal (`surface-2` track, `rounded-control`, 4 px padding; 32 px options at `rounded-tag`, the selected one on
  `surface-3` with `fg` text; radio semantics, arrow keys move and select). OpenRouter by default; disabled, with a
  hint saying so, until both keys are saved.
- **Library card**: a usage line ("Using 1.2 GB of 60 GB the browser allows") over a thin bar (accent, `danger` from
  90 %), then two tiles, Images and Videos (count · size, files), with a reference-images line under them. Below a
  divider, "Protected from eviction" with a Yes / Not yet badge and a Protect button while it is not (Safari gets a
  note about the 7-day eviction). Then Backup: Export library… / Import… side by side; while an archive is written or
  read, a progress line ("Packing 12 / 40…", "Importing 3 / 40…") and a bar, with the other button disabled. Last,
  Delete everything (danger, confirm dialog) with a reminder that everything lives in this browser.
- **Notifications** ("Video ready" card): two rows, each a title, a `text-meta` hint and a switch on the right (36 × 20,
  `role="switch"`, an accent track when on). "Play a sound": a short synthesized ding (Web Audio, no file) when a
  video finishes, with a Preview text button. "Show a notification": a system notification ("Video ready", the
  model and the prompt, the app icon) that brings the tab forward and opens the video in the lightbox when clicked;
  turning it on asks for permission, a blocked or unsupported browser says so in the hint, and Send a test shows one.
  Both are off by default, stored in this browser (`higgsfree.videoAlerts`), and fire only in the tab that drove the
  job, so several tabs give one ding. They need the site open in a tab (a background tab is fine): this is the
  Notifications API, not Web Push, which would need a server. When both are on, the notification is silent.

## Motion & polish
- 150ms ease-out transitions for hover/active; popovers fade+scale 4%. Skeleton shimmer 1.6s.
- **Accent on load.** Every page load opens on the lime accent. Once the app is up and painted, the lime holds
  0.4 s more, then blends to green (`#5dfd8c`) over 1.2 s. The path is one continuous blend (OKLab, chroma kept up
  mid-way), spaced by perceptual distance and eased with smootherstep, so nothing jolts. It applies to the accent variables on `html` (`accent-shift`
  in `globals.css`), so every accent element shifts together. `data-accent-intro` in the static HTML holds the lime;
  Shell sets it to `play` after hydration and removes it at the end. That way a slow first paint never skips the
  lime. Transitions are off until it ends, so no element trails behind. Client-side navigation keeps the green.
  It also runs under reduced motion (a color fade, nothing moves). The nav logo's tile makes the same sweep, from the
  old brand lime (`#d0f81e`) to the brand green, through `--color-logo`; the glyph stays ink.
- Toasts (sonner, top-right so the fixed prompt bar never covers them, dark). Focus rings `ring-2 ring-accent/60`. All icon buttons have `aria-label`.
- Mobile: nav collapses to icons; video panel stacks above the canvas; prompt bar goes full-width.
