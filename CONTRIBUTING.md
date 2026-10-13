# Contributing to higgsfree

Thanks for helping. This is a small codebase with a few firm rules; read this once and you'll be
productive quickly.

## Setup

```bash
git clone <your fork>
cd higgsfree
pnpm install                  # pnpm 11, Node >= 22
cp .env.example .env.local    # optional, the key can also be entered in Settings
pnpm dev                      # Next.js on :3000, API included; data in ./data
```

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (production build, also emits
`.next/standalone` for Docker), `pnpm start`, `pnpm format` / `pnpm format:check` (Prettier).
`vercel env pull .env.local` after `vercel link` points local dev at a real Blob store and Turso database.

## Layout

```
src/
  app/      Next.js App Router: layout, one thin client page per route, error screens, and the
            route handlers that mount the Hono API at /api/* and /media/*
  shared/   types.ts (client ⇄ server contract) · models.ts (the model catalog)
  server/   Hono app, OpenRouter client, libSQL store (SQLite file or Turso), media store
            (local disk or Vercel Blob), job advancement + change feed
  client/   React + Tailwind v4 (Radix primitives, zustand); pages, components, stores
public/     icons, manifest, sample stills
docs/       API.md (endpoint contract) · DESIGN.md (visual spec) · MODELS.md (catalog)
```

`src/shared/types.ts` is the single source of truth for request/response shapes. If you change
an API, change the type first, then both sides. Keep `src/shared` dependency-free.

## Rules of the road

- **Match `docs/API.md` and `docs/DESIGN.md`.** They encode verified OpenRouter behaviour
  (HTTP 202 on video submit, `frame_images` for i2v, downloading results with the Bearer header,
  etc.) and the visual language. Don't "simplify" the integration rules. They were learned the
  hard way. If you find one is wrong, fix the doc in the same PR.
- **Never log or return the API key.** See [SECURITY.md](SECURITY.md).
- **Surface provider errors verbatim.** OpenRouter's 400 bodies list the supported values; users
  need to see them.
- **Nothing that compiles on install.** `@libsql/client` ships prebuilt bindings for the local
  `file:` database and talks plain HTTP/WebSocket to Turso; image and MP4 headers are parsed by
  hand. The app has to install and build anywhere Node 22 runs, including Vercel's build image.
- **Nothing that needs a resident process.** On Vercel every request is its own function: no
  in-memory state that must survive a request (caches are best-effort), no timers, no stream that
  stays open. Work that outlives a response goes through `runInBackground` (`waitUntil`), and
  anything two instances could both do takes the row's lease first (`claimGeneration`).
- **Cost honesty.** Estimates in the UI come from `estCostUsd` / `estCostPerSecUsd` in the
  catalog; the real number is `usage.cost` from OpenRouter and is what gets stored. If you change
  an estimate, say where the number came from.

## Adding or updating a model

Edit `src/shared/models.ts` only. The picker, validation and cost estimate are all driven by
the catalog. Field-by-field guidance and the verification checklist are in
[docs/MODELS.md](docs/MODELS.md). Set `verified: true` only after you've actually run the model
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

CI runs the same four commands on Node 22 and 24, plus a Docker image build. Please also:

- Describe what you tested manually (which model, which mode, local storage or Blob + Turso).
- Add screenshots for UI changes (dark theme, 1400px-wide content area).
- Don't commit `data/`, `.env`, or generated media.

## Reporting bugs / requesting models

Use the issue templates: one for bugs, one for model requests. For bugs, include the
provider error text and the model slug; for models, include the OpenRouter slug and whatever
constraints you already know.

## License

By contributing you agree that your contributions are licensed under the MIT License.
