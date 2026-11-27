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

There is no database or secret to set up: the keys and the library live in the browser (`pnpm dev` also serves the
two server routes, the ByteDance and Replicate pass-throughs).
`cp .env.example .env.local` only matters if you want to change one of the three build-time values
(site url for social cards, OpenRouter base url for a proxy, app name for `X-Title`).

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test` (vitest), `pnpm build` (prerendered pages plus the
ByteDance and Replicate pass-throughs, in `.next/`), `pnpm start` / `pnpm preview` (serve that build), `pnpm format` /
`pnpm format:check` (Prettier).

## Layout

```
src/
  app/        Next.js App Router: the root layout (metadata, fonts, the production CSP), one thin
              client page per route, the error screens, and `/` redirecting to `/image` on the client;
              api/bytedance/[...path]/route.ts and api/replicate/[...path]/route.ts mount the pass-throughs
  server/     bytedance-proxy.ts and replicate-proxy.ts: the only server code, stateless pass-throughs to
              ByteDance's ModelArk and to Replicate (an allowlist of calls each; the key used once, never stored
              or logged) · pass-through.ts (what the two share) · __tests__/
  shared/     types.ts (the UI ⇄ data-layer contract) · models.ts (the model catalog) ·
              bytedance-proxy.ts, replicate-proxy.ts (what each pass-through allows, shared by the client and
              the server) · replicate-models.ts (each Replicate model's fields and prices)
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
docs/         OPENROUTER.md, FAL.md (integration rules) · DESIGN.md (visual spec) · MODELS.md
              (catalog)
```

`src/shared/types.ts` is the single source of truth for the shapes the UI and the data layer exchange.
If you change one, change the type first, then both sides. Keep `src/shared` dependency-free.

## Rules of the road

- **Nothing else that needs a server.** The exceptions are the ByteDance and Replicate pass-throughs
  (`src/server/bytedance-proxy.ts`, `src/server/replicate-proxy.ts`), because ModelArk and Replicate refuse browser
  calls; each forwards only an allowlist of calls and never stores, caches or logs a key or a request. Every other provider stays in the browser, and so does
  everything else: no other route handlers, no server actions, no `headers()` / `cookies()` / `redirect()` on the
  server, no `redirects` / `rewrites` in `next.config.ts`, no proxy or middleware; every page stays prerendered
  (`○` in the build output) and `next/image` stays `unoptimized`. Don't widen a pass-through's allowlist (paths,
  methods, queries, file hosts) without a test, and never add logging to one. CI starts the built server and checks
  that the pages answer and that the pass-through refuses what it should.
- **Each key goes to one place.** Never log a key or store it anywhere but its own localStorage entry
  (`higgsfree.apiKey` for OpenRouter, `higgsfree.falKey` for fal, and so on). The OpenRouter key goes only to
  OpenRouter's origin (`assertProviderOrigin`), the fal key only to fal's API hosts (`assertFalOrigin`); fal's CDN
  and upload urls never get it. The ByteDance key goes only to the pass-through on the app's own origin
  (`assertBytedanceOrigin`), which sends it only to ModelArk's API host; the Replicate key likewise
  (`assertReplicateOrigin`), on to `api.replicate.com` only. See [SECURITY.md](SECURITY.md).
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
  cost; fal-only models, models a provider lists no price for yet (GPT Image 2.6 and Gemini Omni Flash 1.2 on
  APIMart, though fal and kie.ai price the latter), and models billed in tokens only (GPT Image 2.6
  Flare and Sunburst, on every provider; MiniMax H3 Image, on OpenRouter, fal and APIMart, though kie.ai prices it;
  MAI-Image-2.7, on OpenRouter and fal), and sizes a
  provider prices only in part (Kling Image 4.0 at 4K on fal, which lists its 2K price only, though kie.ai prices it) carry no estimate rather than a guessed one. An
  estimate that can fall short says so (Ideogram 4.6's `auto` edits on fal, billed at fal's above-2K rate when the source
  image is larger than 2048 × 2048 in area). Reference videos count only where the provider bills them: kie.ai adds their
  length to the clip's for Seedance, Wan 3.0 and Kling 4.0, and nothing for MAGI-2, whose reference files are free (APIMart,
  which bills MAGI-2's output only too, gets no reference videos from the app). If you change an estimate, say where the
  number came from.

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

CI runs the same four commands on Node 22 and 24, starts the built server for a smoke test (the pages, and
what the ByteDance and Replicate pass-throughs refuse), and builds the Docker image. Please also:

- Describe what you tested manually (which model, which mode, which browser).
- Add screenshots for UI changes (dark theme, 1400px-wide content area).
- Don't commit `.env*` files (other than `.env.example`), `.next/`, or generated media.

## Reporting bugs / requesting models

Use the issue templates: one for bugs, one for model requests. For bugs, include the
provider error text and the model slug; for models, include the OpenRouter slug or the fal
endpoint id and whatever constraints you already know.

## License

By contributing you agree that your contributions are licensed under the Beerware License.
