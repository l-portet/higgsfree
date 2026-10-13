# Contributing to Open Higgsfield

Thanks for helping. This is a small codebase with a few firm rules; read this once and you'll be
productive quickly.

## Setup

```bash
git clone <your fork>
cd open-higgsfield
pnpm install            # pnpm 11, Node >= 22.13 (needs node:sqlite)
cp .env.example .env    # optional, the key can also be entered in Settings
pnpm dev                # server :8787 + Vite :5173 (proxies /api and /media)
```

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (→ `dist/client`), `pnpm start`
(production: serves `dist/client` from the server), `pnpm format` / `pnpm format:check` (Prettier).

## Layout

```
src/
  shared/   types.ts (client ⇄ server contract) · models.ts (the model catalog)
  server/   Hono app, OpenRouter client, node:sqlite store, video poller, SSE
  client/   React + Vite + Tailwind v4 (Radix primitives, zustand, react-router)
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
- **No native dependencies.** `node:sqlite` and hand-rolled image header parsing are deliberate so
  the app installs anywhere Node 22 runs, including Alpine containers.
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
- Commit messages: imperative mood, present tense (`Add Kling 3.0 Standard`, `Fix SSE reconnect`).

## Before you open a PR

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

CI runs the same four commands on Node 22 and 26, plus a Docker image build. Please also:

- Describe what you tested manually (which model, which mode, dev or Docker).
- Add screenshots for UI changes (dark theme, 1400px-wide content area).
- Don't commit `data/`, `.env`, or generated media.

## Reporting bugs / requesting models

Use the issue templates: one for bugs, one for model requests. For bugs, include the
provider error text and the model slug; for models, include the OpenRouter slug and whatever
constraints you already know.

## License

By contributing you agree that your contributions are licensed under the MIT License.
