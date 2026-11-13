# Contributing to higgsfree

Thanks for helping. This is a small codebase with a few firm rules; read this once and you'll be
productive quickly.

## Setup

```bash
git clone <your fork>
cd higgsfree
pnpm install                  # pnpm 11, Node >= 22
pnpm dev                      # Next.js on :3000; paste a key behind Add key
```

There is no server, database or secret to set up: the keys and the library live in the browser.
`cp .env.example .env.local` only matters if you want to change one of the three build-time values
(site url for social cards, OpenRouter base url for a proxy, app name for `X-Title`).

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test` (vitest), `pnpm build` (static export to
`out/`), `pnpm preview` (serves `out/`), `pnpm format` / `pnpm format:check` (Prettier).

## Layout

```
src/
  app/        Next.js App Router: the root layout (metadata, fonts, the production CSP), one thin
              client page per route, the error screens, and `/` redirecting to `/image` on the client
  shared/     types.ts (the UI ⇄ data-layer contract) · models.ts (the model catalog)
  client/
    lib/
      openrouter.ts   the OpenRouter client: headers, origin check, errors, the live model list
      payloads.ts     pure request-body builders (the verified shapes from docs/OPENROUTER.md)
      fal.ts          the fal client: `Key` auth, host check, run, queue, upload, download, key test
      fal-payloads.ts pure fal request builders: the app's options mapped onto each model's fields
      providers.ts    which provider runs a model (keys + preference) and the composer notice text
      catalog.ts      curated catalog merged with OpenRouter's live video and image catalogs
      settings.ts     the keys and the provider preference in localStorage
      video-meta.ts   sniffs uploaded reference videos (MP4, MOV, WebM)
      db/             IndexedDB (idb): schema, generations, media, folders (Favorites)
      engine/         job lifecycle: image batches, video submit / poll / download, Web Locks, steward;
                      provider.ts picks the provider and key for a run
      archive/        library export / import as a zip (zip.js): records, files and folders
      media-urls.ts   ref-counted object urls for media in the library
      live.ts         the change feed: every write is broadcast to the other tabs
      __tests__/      unit tests; fal.test.ts covers the fal builders, the provider choice and the
                      client's guards
    __tests__/        setup (Node + fake-indexeddb), the mock OpenRouter (fal included), the engine and
                      fal integration tests
    features/         one folder per view · components/ composer, ui, settings · store/ zustand
public/       icons, manifest, sample stills
docker/       nginx.conf for the static image
docs/         OPENROUTER.md, FAL.md (integration rules) · DESIGN.md (visual spec) · MODELS.md
              (catalog)
```

`src/shared/types.ts` is the single source of truth for the shapes the UI and the data layer exchange.
If you change one, change the type first, then both sides. Keep `src/shared` dependency-free.

## Rules of the road

- **Nothing that needs a server.** The site must build with `output: "export"`: no route handlers, no
  server actions, no `headers()` / `cookies()` / `redirect()` on the server, no `redirects` / `rewrites` /
  `headers` in `next.config.ts`, no proxy or middleware; `next/image` stays `unoptimized`. Anything that
  needs a runtime runs in the browser. CI checks that `out/` contains the expected pages.
- **Each key goes to one place.** Never log a key or store it anywhere but `higgsfree.apiKey` (OpenRouter)
  and `higgsfree.falKey` (fal). The OpenRouter key goes only to OpenRouter's origin
  (`assertProviderOrigin`), the fal key only to fal's API hosts (`assertFalOrigin`); fal's CDN and upload
  urls never get it. See [SECURITY.md](SECURITY.md).
- **Match `docs/OPENROUTER.md`, `docs/FAL.md` and `docs/DESIGN.md`.** They encode verified
  OpenRouter behaviour (HTTP 202 on video submit, `frame_images` for i2v, downloading results with
  the Bearer header, etc.), the fal rules (the `Key` header, the queue's own status urls, keyless CDN
  downloads) and the visual language. Don't "simplify" the integration rules. They were learned the
  hard way. If you find one is wrong, fix the doc in the same PR.
- **Surface provider errors verbatim.** OpenRouter's 400 bodies list the supported values; users
  need to see them.
- **Write to IndexedDB first, then publish.** Every status change lands in the database before it goes
  out over the BroadcastChannel, so a tab that missed an event can always re-read the truth. Anything two
  tabs could both do takes the job's Web Lock first (`tryWithJobLock`).
- **Nothing that compiles on install.** Image and MP4 headers are parsed by hand; the zip is zip.js on the
  main thread. The app has to install and build anywhere Node 22 runs, including Vercel's build image.
- **Cost honesty.** Estimates in the UI come from `estCostUsd` / `estCostPerSecUsd` in the
  catalog; the real number is `usage.cost` from OpenRouter and is what gets stored. fal reports no
  cost; fal-only models, models a provider lists no price for yet (GPT Image 2.6, Seedream 5.5 and Gemini Omni
  Flash 1.2 on APIMart, though kie.ai prices Seedream 5.5 and fal and kie.ai the latter), and models billed in tokens only (GPT Image 2.6
  Flare and Sunburst, on every provider; MiniMax H3 Image, on OpenRouter, fal and APIMart, though kie.ai prices it) carry no estimate rather than a guessed one. If you change an
  estimate, say where the number came from.

## Adding or updating a model

Edit `src/shared/models.ts` only. The picker, validation and cost estimate are all driven by
the catalog. Field-by-field guidance and the verification checklist are in
[docs/MODELS.md](docs/MODELS.md), including how to add a model on fal (a `fal` route, read from
the endpoint's OpenAPI schema). Set `verified: true` only after you've actually run the model
through the app end-to-end; otherwise leave it `false` and the UI will show a "best-effort" note.

Please run the model once and paste the measured `usage.cost` and any provider error bodies into
the PR description.

## Style

- TypeScript strict mode, ESM, 2-space indent, double quotes, semicolons, 100-column lines
  (`.prettierrc` / `.editorconfig` are checked in). Prettier is a dev dependency: run
  `pnpm format` before committing, or `pnpm format:check` to see what it would touch.
  Formatting is checked locally only (CI does not run it yet, since the tree is not fully
  formatted); please keep the diff of your PR limited to the files you actually changed.
- Small, focused PRs. One model addition or one feature per PR.
- Commit messages: imperative mood, present tense (`Add Kling 3.0 Standard`, `Fix feed reconnect`).

## Before you open a PR

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

CI runs the same four commands on Node 22 and 24, checks that `out/` contains the expected pages, and
builds the Docker image. Please also:

- Describe what you tested manually (which model, which mode, which browser).
- Add screenshots for UI changes (dark theme, 1400px-wide content area).
- Don't commit `.env*` files (other than `.env.example`), `out/`, or generated media.

## Reporting bugs / requesting models

Use the issue templates: one for bugs, one for model requests. For bugs, include the
provider error text and the model slug; for models, include the OpenRouter slug or the fal
endpoint id and whatever constraints you already know.

## License

By contributing you agree that your contributions are licensed under the Beerware License.
