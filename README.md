<p align="center">
  <img src="docs/brand/lockup-dark.svg" alt="" width="300">
</p>

<h1 align="center">higgsfree</h1>

<p align="center">Open-source AI image and video studio. Runs on your own OpenRouter key, entirely in your browser. A Next.js static site: one click on Vercel, or any host that serves files.</p>

<p align="center">
  <a href="https://github.com/l-portet/higgsfree/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/l-portet/higgsfree/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node 22+" src="https://img.shields.io/badge/node-22%2B-brightgreen">
</p>

<p align="center"><img src="docs/screenshots/image.png" alt="Image studio" width="880"></p>

## What it does

- **Image**: text to image and image to image with Nano Banana Pro, GPT-5.4 Image 2, Krea 2 and more, plus FLUX.1 Kontext, Ideogram 4.5 and other fal models with a fal key. Reference images, batches of four, 1K to 4K.
- **Video**: text to video and image to video with Seedance 2.5, Kling 3.0, Veo 3.1, MiniMax H3, Wan 3.0 and more. First and last frame, style references, native audio. With a fal key: Kling 3.0 Motion Control (your character, moving like a reference video), Gemini Omni Flash, Vidu Q4, PixVerse 6 and more.
- **Assets**: every generation with its prompt, settings and real cost. Search, download, reuse, animate an image into a video.
- **Favorites**: press the heart on any run to keep it in one place, with folders you create: drag runs onto a folder, or pick one from the heart's menu.
- **AI Prompt Editor** (video): ask GPT-6 Luna to rewrite your prompt ("more cinematic", "add rain"), preview a frame with GPT Image 2.5 Flare, then use it. Both run on your OpenRouter key and show what they cost.
- **Video ready alerts**: a ding and / or a system notification when a video finishes, switched on in Settings › Notifications. They work while the site is open in a tab, even in the background.
- **Your keys, your browser**: one OpenRouter key for every provider, billed at provider price, and an optional [fal](https://fal.ai) key for the models only fal has. The keys stay in this browser's localStorage, the library (every generation and its file) in its IndexedDB, and you can export it all as a zip any time. No account, no server, nothing in between.

## Quick start (local)

Requires Node 22+ and [pnpm](https://pnpm.io). Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).

```bash
git clone https://github.com/l-portet/higgsfree.git
cd higgsfree
pnpm install
pnpm dev
```

Open http://localhost:3000 and paste your key behind **Add key** (top right). That's it: there is no server to run, no database and no environment variable to set.

## fal (optional)

[fal](https://fal.ai) is a second provider, for models OpenRouter does not have: Kling 3.0 Motion Control (a character image plus a reference video, optional prompt; the character moves like the video, for as long as the video), Gemini Omni Flash 1.1, Kling O3 Pro, Vidu Q4, PixVerse 6, LTX 2.3, Luma Ray 3.2, FLUX.1 Kontext, Ideogram 4.5 and more.

- **Add a key** when you need it: pick a fal model and press Generate, and a small dialog asks for the fal key ("Save and generate" finishes the job). It is also in Settings › Keys, next to **Test connection** and **Remove key**. Get one at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).
- **Every model is listed, whatever keys you have.** Pick one whose provider has no key and a small notice above the prompt says which provider it runs on; Generate opens the key dialog for that provider. That goes both ways: a fal-only model with only an OpenRouter key, an OpenRouter-only model with only a fal key.
- **With both keys, every model works.** A few models are on both (Nano Banana Pro, Nano Banana 2, GPT Image 2, Seedance 2.5, Kling 3.0 Pro and Standard, MiniMax H3 and H3 Max). "Run models both providers offer on" in Settings › Keys picks who runs those, OpenRouter by default. A model only one provider has always runs there.
- **Both keys stay in this browser**, and each one is only sent to its own provider. A motion-control reference video is uploaded to fal's storage when you run it ([SECURITY.md](SECURITY.md) has what that means).
- fal publishes prices only to a signed-in key and returns no cost with a result, so fal-only models show no estimate and runs on fal record no cost.

The rules are in [docs/FAL.md](docs/FAL.md).

## Deploy anywhere

`pnpm build` writes a static site to `out/` (one HTML file per route plus the assets). Copy it to any static host:

- **Vercel**: import the repo at [vercel.com/new](https://vercel.com/new). Nothing to configure: Vercel runs the build and serves `out/`. The checked-in `vercel.json` only adds the `X-Content-Type-Options: nosniff` header.
- **Netlify, Cloudflare Pages, GitHub Pages**: build command `pnpm build`, publish directory `out`.
- **S3, nginx, any file server**: upload `out/`. Clean urls (`/image`) need the host to fall back to `image.html`; `docker/nginx.conf` shows the rule.

The host never sees your keys or your library: the browser talks to OpenRouter and fal directly and keeps everything else on your machine. [SECURITY.md](SECURITY.md) spells out what a hosted copy can and cannot see.

## Configuration

All optional, all read by `next build` only and inlined into the static site (see `.env.example`).

| Variable | Default | What it does |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Public url of the site, for social-card metadata. On Vercel it defaults to the production domain. |
| `NEXT_PUBLIC_OPENROUTER_BASE_URL` | `https://openrouter.ai` | Where OpenRouter calls go. Proxies only; the key and the Content-Security-Policy follow it. |
| `NEXT_PUBLIC_APP_NAME` | `higgsfree` | Sent to OpenRouter as `X-Title` for app attribution. |

## Your data

Everything lives in the browser profile you use the app in:

- **The OpenRouter key** is in localStorage (`higgsfree.apiKey`) and is only ever sent to openrouter.ai. **Remove key** in Settings › Keys deletes it.
- **The fal key**, if you add one, is in localStorage (`higgsfree.falKey`) and is only ever sent to fal's API hosts. **Remove key** in Settings › Keys deletes it. Which provider runs the models both offer is `higgsfree.preferredProvider`.
- **The library** (records, generated images and clips, reference images and videos) is in IndexedDB (database `higgsfree`). Media are displayed through object urls. Nothing is uploaded anywhere, except a motion-control reference video, which goes to fal's storage when you run it.

What follows from that:

- Clearing site data, a private window or another browser profile means an empty library and no keys. The same url in two browsers is two separate libraries.
- Browsers may evict site data when disk space runs low. After the first completed generation the app asks the browser for persistent storage; **Protect** in Settings › Library asks again if it was declined. Safari clears site data after 7 days without a visit unless the app is added to the Home Screen or Dock.
- Settings › Library shows usage against the browser's quota, counts and sizes, and has **Export library…** (a zip with every generation, its file and the reference images; streamed to a save dialog on Chromium, a plain download elsewhere), **Import…** (the same zip, into this or any other browser; records already present are skipped) and **Delete everything**. Export regularly.
- When the quota is full, a generation that finished is marked failed with its cost (OpenRouter has already charged). Export, delete older runs and retry.
- This is a clean break from the previous server-based version: a `data/` directory, a Blob store or a Turso database is not migrated.

## Models

Curated: 19 image models and 35 video models with their real limits (sizes, durations, resolutions, audio); 8 of the image models and 9 of the video models run only on fal. Full list in [docs/MODELS.md](docs/MODELS.md). To change names, featured models or descriptions, edit `src/shared/models.ts`.

The browser also reads OpenRouter's public model catalogs at startup, with or without a key (cached 10 minutes). Video options and prices follow what OpenRouter publishes, and any video or image model OpenRouter adds shows up on its own as an unverified entry; about 45 more image models are available that way today. Video models OpenRouter stops listing leave the picker, unless fal also has them. fal-only models do not depend on OpenRouter's catalogs.

Cost estimates are shown before you generate; the actual cost reported by OpenRouter is saved with each result. fal reports no cost, so fal-only models show no estimate and runs on fal record none.

## How it works

Next.js (App Router) with `output: "export"`: `next build` writes plain HTML, CSS and JS, and there is no server code at all. The pages are thin shells; the React client does everything.

- **OpenRouter** is called straight from the browser with your key (`src/client/lib/openrouter.ts`, request bodies in `payloads.ts`). OpenRouter allows cross-origin requests on every endpoint the app uses. Provider errors are kept verbatim so the supported values show on the card. The rules are in [docs/OPENROUTER.md](docs/OPENROUTER.md).
- **fal** is called straight from the browser too, with the fal key (`src/client/lib/fal.ts`, request bodies in `fal-payloads.ts`): images in one request to `fal.run`, videos through fal's queue, polled like OpenRouter's. Results come from fal's CDN without the key. With both keys, `providers.ts` picks who runs a model both offer. The rules are in [docs/FAL.md](docs/FAL.md).
- **Storage** is IndexedDB: a `generations` store for the records and a `media` store for the Blobs (`gen_abc.png`, `gen_abc.mp4`, `up_xyz.jpg`), shown through object urls.
- **Image jobs** are N parallel calls in the tab that submitted them. A call cannot be resumed: if that tab closes, the job is lost (OpenRouter still charges) and the next visit marks it failed as "Interrupted…" with a Retry button. The tab warns before unloading while images are in flight.
- **Video jobs** are submitted to `/api/v1/videos` (or fal's queue), then polled every 6 seconds by whichever open tab holds the job's Web Lock. The finished clip is downloaded straight into IndexedDB (with the key from OpenRouter, without it from fal's CDN). A steward in every tab adopts video jobs nobody is driving, so closing and reopening the app resumes polling. Jobs only advance while a tab is open; nothing runs when the site is closed.
- At most 8 generations are active at once per browser.
- **Tabs** stay in sync over a BroadcastChannel: every write to IndexedDB is published to the other open tabs.
- **Export** is a zip (`manifest.json`, `generations.json`, `media/<id>`) written with zip.js; import reads the same format.

## Self-hosting with Docker

The image is `nginx:alpine` serving `out/`. No volumes, no environment: the container holds nothing of yours.

```bash
docker compose up -d   # http://localhost:3000 (set PORT to change the host port)
```

## Development

```bash
pnpm dev        # Next.js dev server on :3000
pnpm build      # static export to out/
pnpm preview    # serve out/ locally
pnpm test       # vitest in Node with fake-indexeddb; the engine runs against a mocked OpenRouter and fal
pnpm typecheck
pnpm lint
```

Docs: [OpenRouter integration](docs/OPENROUTER.md), [fal integration](docs/FAL.md), [models](docs/MODELS.md), [design](docs/DESIGN.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md).

## Brand assets

The mark (a looped script F, black on a green tile), the lockups and the app icons live in
[docs/brand/](docs/brand/), traced from the original artwork in `docs/brand/logo-source.png`. Sizes,
clear space and colour rules are in [docs/brand/BRAND.md](docs/brand/BRAND.md). Use the files as
they are: no recolouring, no effects, no stretching.

## License

MIT. higgsfree is an independent project and is not affiliated with Higgsfield AI. Provider names and logos identify the model providers and belong to their owners.
