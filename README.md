<p align="center">
  <img src="docs/brand/lockup-dark.svg" alt="" width="300">
</p>

<h1 align="center">higgsfree</h1>

<p align="center">Open-source AI image and video studio. Runs on your own OpenRouter key. Next.js, one-click on Vercel, or self-hosted.</p>

<p align="center">
  <a href="https://github.com/l-portet/higgsfree/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/l-portet/higgsfree/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node 22+" src="https://img.shields.io/badge/node-22%2B-brightgreen">
</p>

<p align="center"><img src="docs/screenshots/image.png" alt="Image studio" width="880"></p>

## What it does

- **Image**: text to image and image to image with Nano Banana Pro, GPT-5.4 Image 2, Krea 2 and more. Reference images, batches of four, 1K to 4K.
- **Video**: text to video and image to video with Seedance 2.5, Kling 3.0, Veo 3.1, Sora 2 Pro, Hailuo 3, Wan 3.0 and more. First and last frame, style references, native audio.
- **Assets**: every generation with its prompt, settings and real cost. Search, download, reuse, animate an image into a video.
- **Your key, your storage**: one OpenRouter key for every provider, billed at provider price. Media and history live in storage you own: a folder on your machine, or your own Vercel Blob store and Turso database.

## Quick start (local)

Requires Node 22+ and [pnpm](https://pnpm.io). Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).

```bash
git clone https://github.com/l-portet/higgsfree.git
cd higgsfree
pnpm install
pnpm dev
```

Open http://localhost:3000 and paste your key in **Settings**. Or put it in a `.env.local` file first:

```bash
cp .env.example .env.local   # set OPENROUTER_API_KEY
```

With no storage configured, everything (a SQLite database and the generated media) goes to `./data`. Nothing else to install.

## Deploy to Vercel

The app is a Next.js project; the API lives in route handlers and runs on Node.js functions. Vercel's filesystem is read-only, so media go to a **Vercel Blob** store and records to a **Turso** (libSQL) database. Both come from the Vercel dashboard or CLI and inject their environment variables into the project:

```bash
vercel link                                      # or import the repo at vercel.com/new
vercel blob create-store higgsfree-media         # a *public* store → BLOB_READ_WRITE_TOKEN
vercel integration add tursocloud/database       # → TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
vercel env add OPENROUTER_API_KEY production     # optional; the Settings page works too
vercel deploy --prod                             # or push to the connected Git repo
```

Then **turn on Deployment Protection** (Project → Settings → Deployment Protection → Vercel Authentication, free on every plan). The app has no login of its own, and anyone who can open it can spend your credits. See [Access control](#access-control).

`vercel env pull .env.local` makes `pnpm dev` use the same Blob store and database as the deployment.

Notes:

- The blob store must be **public**: the browser loads generated images and videos straight from it.
- Uploads go from the browser directly to Blob (Vercel functions cap request bodies at 4.5 MB; the 25 MB reference-image limit still applies).
- Image generation finishes in the background of the request that started it, inside the function's `maxDuration` (300 s on Hobby, raise to 800 on Pro in `src/app/api/[[...route]]/route.ts`). Video jobs are polled whenever a tab is open: the browser asks for updates every few seconds and each of those requests moves running jobs along, so a clip is picked up as soon as you look at the app again.
- Custom domains need no configuration: on Vercel the app trusts the hostname it was reached on.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `OPENROUTER_API_KEY` | | Your key. Optional if you enter it in Settings. The env var wins when both exist. |
| `BLOB_READ_WRITE_TOKEN` | | Vercel Blob token (public store). When set, media are stored there instead of `DATA_DIR`. Required on Vercel. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | | Turso / libSQL database. When unset, a SQLite file under `DATA_DIR` is used. Required on Vercel. |
| `DATA_DIR` | `./data` | Local storage: the SQLite database and generated media. Keep it persistent. |
| `ALLOWED_HOSTS` | | Extra hostnames allowed to open the app, comma-separated (LAN IP, Tailscale name). `*` disables the check. Not needed on Vercel. |
| `MAX_ACTIVE_JOBS` | `8` | Maximum generations running at once. |
| `APP_URL`, `APP_NAME` | | Sent to OpenRouter for attribution and used for social cards. The host of `APP_URL` is always an allowed hostname. On Vercel `APP_URL` defaults to the production domain. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai` | Where OpenRouter calls go. Only for proxies and the integration tests. |

## Access control

There is no login. Anyone who can reach the app can spend your credits, so put something in front of it:

- **On Vercel**: Deployment Protection. *Vercel Authentication* limits access to members of your Vercel team (free). *Password Protection* (Pro) or *Vercel Passport* (Enterprise) are the alternatives for people outside the team.
- **Self-hosted**: keep it on `localhost`, a private network (LAN, Tailscale), or behind a reverse proxy that adds authentication. The Docker Compose file publishes the port on the host's loopback only.

The server also enforces the browser's same-origin rules (`Host`, `Origin` and `Content-Type` checks), so a random website cannot drive the API from a visitor's browser. Details in [SECURITY.md](SECURITY.md).

### Behind a reverse proxy (self-hosted)

The server checks the `Host` header it receives (never `X-Forwarded-*`), so the proxy has to pass the browser's `Host` through and that hostname has to be allowed:

```nginx
server {
    listen 443 ssl;
    server_name studio.example.com;
    # ... your auth (auth_basic, oauth2-proxy, ...) and TLS here ...
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;            # keep the browser's Host header
        proxy_http_version 1.1;
    }
}
```

```bash
ALLOWED_HOSTS=studio.example.com   # or set APP_URL=https://studio.example.com
```

Caddy and Traefik forward `Host` unchanged by default.

## Models

11 image models and 25 video models with their real limits (sizes, durations, resolutions, audio). Full list in [docs/MODELS.md](docs/MODELS.md). To add one, edit `src/shared/models.ts`.

New video models OpenRouter lists show up on their own within 10 minutes (the live model list is cached that long) as unverified entries with conservative limits and no price estimate; the real cost is recorded on the result.

Cost estimates are shown before you generate; the actual cost reported by OpenRouter is saved with each result.

## How it works

Next.js (App Router) with a React client and a [Hono](https://hono.dev) API mounted under `/api/*` as a route handler. Records live in libSQL (a SQLite file locally, Turso on Vercel); media in a folder locally or in Vercel Blob. No native build steps.

Image requests go to OpenRouter's chat and image endpoints and keep running after the response (`waitUntil`). Video jobs are submitted to `/api/v1/videos`; the browser polls `GET /api/events` every few seconds for changes, and each poll also polls OpenRouter for running clips (one request at a time per job, with a lease in the database) and streams finished clips into storage without buffering them. Results reach every open tab through the same change feed.

## Self-hosting with Docker

The image runs the standalone Next.js server with local storage in a `/data` volume:

```bash
cp .env.example .env   # set OPENROUTER_API_KEY
docker compose up -d   # http://localhost:3000, data in ./data
```

## Development

```bash
pnpm dev        # Next.js on :3000 (API included)
pnpm test       # vitest
pnpm typecheck
pnpm lint
pnpm build      # production build (also emits .next/standalone for Docker)
```

Docs: [API](docs/API.md), [design](docs/DESIGN.md), [models](docs/MODELS.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md).

## Brand assets

The mark (a looped script F, black on a lime tile), the lockups and the app icons live in
[docs/brand/](docs/brand/), traced from the original artwork in `docs/brand/logo-source.png`. Sizes,
clear space and colour rules are in [docs/brand/BRAND.md](docs/brand/BRAND.md). Use the files as
they are: no recolouring, no effects, no stretching.

## License

MIT. higgsfree is an independent project and is not affiliated with Higgsfield AI. Provider names and logos identify the model providers and belong to their owners.
