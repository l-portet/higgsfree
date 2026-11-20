# Replicate integration

[Replicate](https://replicate.com/) is a provider like the others: with a Replicate API token, the models it serves
as **official models** can run there, and a run goes there whenever it is the cheapest (see
[Which provider runs a model](FAL.md#which-provider-runs-a-model)). Its list prices are mostly the model makers' own,
so it is rarely the cheapest; it is the cheapest today on Krea 2 Medium ($0.03 an image), and ties OpenRouter or fal
on FLUX.1 [schnell] and [dev], Runway Gen-4.5, Grok Imagine Video and FLUX.3 Video Draft.

**Unlike every provider but ByteDance, Replicate is not called from the browser.** Its API refuses browser calls, so
the browser sends them to this site's own server, which forwards each one. Everything below was read from Replicate's
docs (`replicate.com/docs`, `api.replicate.com/openapi.json`), its model pages, and probed without a key on
19 Nov 2026. **No run has been verified end to end with a real key yet.**

## Why a server

Probed with `curl` from a foreign origin (`Origin: https://probe.example`), no key:

| What | Result |
| --- | --- |
| Preflight, `POST /v1/predictions` and `POST /v1/models/<owner>/<name>/predictions` | 200, **no `Access-Control-Allow-Origin`**: a browser refuses to send the call |
| Preflight, `POST /v1/files` | 204 with allowed methods and headers, but **no `Access-Control-Allow-Origin`** either |
| The same preflights with `Origin: https://replicate.com` | `Access-Control-Allow-Origin: https://replicate.com`: the API answers its own site only |
| `GET https://replicate.delivery/…/out-0.webp` (a result file) | `Access-Control-Allow-Origin: *`: a browser can read results itself |

Every call carries `Authorization`, so every call is preflighted, and none passes. Results are the one thing a
browser may fetch.

## The pass-through (`src/server/replicate-proxy.ts`)

Mounted at `src/app/api/replicate/[...path]/route.ts` (Node runtime, `maxDuration = 120`). It is **not an open
proxy**: it forwards three calls to `https://api.replicate.com/v1` and nothing else.

| Browser → same origin | Server → Replicate |
| --- | --- |
| `POST /api/replicate/v1/models/<owner>/<name>/predictions` (JSON, ≤ 4 MB) | `POST …/models/<owner>/<name>/predictions` |
| `GET /api/replicate/v1/predictions/<id>` | `GET …/predictions/<id>` |
| `GET /api/replicate/v1/account` (the key test) | `GET …/account` |

- `<owner>` and `<name>` must each match `^[a-z0-9][a-z0-9_.-]{0,63}$`, `<id>` must match `^[a-z0-9]{8,64}$`
  (`src/shared/replicate-proxy.ts`), so nothing in them can change the upstream path.
- Anything else is refused before it leaves the server: 404 for any other path (versions, deployments, files,
  trainings, cancelling, listing), 405 for any other method, 400 for any query or a malformed name or id, 401 for a
  missing or non-`Bearer` key, 415 for a non-JSON body, 413 for a body over 4 MB (Vercel caps a function's request
  body at 4.5 MB).
- Only `Authorization` (and `Content-Type` on the submit) go upstream: no `Prefer`, no cookies, no other header.
- The key is read from the incoming `Authorization` header and used for that one upstream call. Nothing stores,
  caches or logs it: no module state, no `console` call, `cache: "no-store"` upstream and `Cache-Control: no-store`
  on every answer, fixed error messages (`502 UpstreamUnreachable`, `504 UpstreamTimeout`), redirects not followed.
- Replicate's status and body come back as they are (only `Content-Type` is copied from its headers), so its real
  errors reach the UI. One thing is removed: a prediction echoes its `input` (the images just sent, megabytes on
  every poll) and carries `logs`; both are dropped from a successful answer, since the browser needs neither.
- Finished files do not go through the server: the browser reads them from `replicate.delivery` (and its
  subdomains), without the key. The production CSP allows exactly those hosts for it.

The shared helpers of the two pass-throughs (reading a body up to a size, the `Bearer` check) are in
`src/server/pass-through.ts`.

## Client (`src/client/lib/replicate.ts`)

- `Authorization: Bearer <token>` (`r8_…`), sent only to the pass-through on the app's own origin
  (`assertReplicateOrigin` allows paths under `/api/replicate/v1/` and nothing else).
- `submit` creates a prediction on an official model (`POST …/models/<owner>/<name>/predictions` `{ input }`, no
  version, no `Prefer: wait`); the record stores `/api/replicate/v1/predictions/<id>` as its polling url.
- `prediction` reads `status`: `starting` and `processing` keep polling; `succeeded` takes the files from `output`
  (one url, a list, or an object of urls, depending on the model); `failed`, `canceled` and `aborted` end the run
  with Replicate's `error`.
- `download` fetches a result from Replicate's CDN. A url on any other host is never fetched: the run ends with the
  link (`ReplicateDownloadBlockedError`), which opens in a tab for about an hour (Replicate deletes API
  predictions' inputs and outputs after an hour).
- `testKey` reads `/account`. Replicate has no balance an API token can read, so the key menu says "On
  replicate.com" (the balance is at `replicate.com/account/billing`).
- A copy of the app with no server (a 404 or 405 that is not JSON) says "This copy of higgsfree has no server to
  pass Replicate calls on…".

## Errors

HTTP statuses with `{ title, detail, status }` (`application/problem+json`); `replicateMessage` keeps `detail`.
401 → "Replicate rejected the API token" ("Invalid Replicate key" in the key test), 402 → "Not enough Replicate
credit: …", 422 (an input the model refuses) → 400 with Replicate's own message, 429 → as it comes ("Request was
throttled…"). A failed prediction is HTTP 200 with `status: "failed"` and an `error` string.

## Inputs

Images (frames, style references, reference images, the image to upscale) go **inline, as data URIs**, which
Replicate takes wherever a model has a file input. There is no upload: Replicate's file API is closed to browsers
too, and passing uploads through the server would not lift the 4 MB limit. So:

- A whole request, images included, goes up to 4 MB; past it the app says so before sending.
- **No video and no audio as input**: video editors, video upscalers, motion control, and reference videos or audio
  are refused on Replicate ("Takes no video from here"), which sends the run to another provider. No such model has
  a Replicate route.
- Replicate's docs recommend data URIs for files under 1 MB; its own JavaScript client sends up to 10 MB that way.
  Larger images than 1 MB are untested here.

## Requests (`replicate-payloads.ts`)

Replicate has no shared input shape: every model names its own fields. Each routed model has an entry in
`REPLICATE_MODELS` (`src/shared/replicate-models.ts`) saying which field carries what and which values it accepts;
the builder sends only those, and refuses the rest with a 400, which sends the run elsewhere.

Images:

- `prompt`; reference images in the model's field, as a list (`image_input`, `input_images`, `image`) or one image
  (`input_image`), up to the model's limit.
- `resolution` (`1K`, `2K`, `4K`) on Nano Banana Pro and 2.
- `aspect_ratio` when one is picked. For the app's `auto`, GPT Image gets `auto`; the others get no ratio, and
  Replicate's default applies (`match_input_image` on Nano Banana and FLUX.1 Kontext, `1:1` elsewhere).
- GPT Image's `quality` is left at Replicate's default (`auto`); its `openai_api_key` field is never sent.
- Recraft Crisp Upscale takes the one image and nothing else.

Videos:

- `prompt` (required on Replicate: a frame alone is refused) and the model's fixed fields (Kling 3.0's `mode`,
  FLUX.3 Video Draft's `draft`).
- `duration` when the model lists lengths (a string on FLUX.3 Video); a length it does not make is refused.
- The resolution in the model's field and spelling (`resolution`, PixVerse's `quality`, MiniMax H3's `768P`,
  `4k`); Kling 3.0 has none (the tier is the resolution).
- The ratio with a prompt or references. With a frame it is left out, except where the model wants a word for
  "follow the frame" (`adaptive` on Seedance and MiniMax H3) or takes the ratio anyway (Veo 3.1, Runway Gen-4.5,
  Gemini Omni Flash 1.2).
- The audio switch where the model has one (`generate_audio`, PixVerse's `generate_audio_switch`).
- Frames in the model's fields (`image` / `last_frame_image`, `start_image` / `end_image`, `first_frame_image`…),
  or in one list on FLUX.3 Video and HappyHorse 1.1 (`images`). Frames and style references do not mix.
- Model rules: Veo 3.1 takes references on 8 s clips only; Gemini Omni Flash 1.2 makes up to 10 s between two
  frames; Grok Imagine 1.5 needs a first frame; Hailuo 2.3 makes 10 s at 768p only.

## Prices (`replicate-pricing.ts`)

From each model page's price tiers (read 19 Nov 2026): per image (by size on Nano Banana Pro and 2), per second of
video by resolution (dearer with sound on Veo 3.1, Kling 3.0 and PixVerse 6), or per clip (Hailuo 2.3). Seedance is
priced for runs with no video attached, the only ones sent from here. **Replicate's API does not say what a run
cost**, so nothing is recorded on the run: the estimate is all the app shows.

Worth knowing:

- Kling 3.0 costs twice as much on Replicate as on OpenRouter or fal ($0.168/s Standard, $0.224/s Pro, more with
  sound), so a run only goes there when Replicate is the only key.
- Most other prices equal OpenRouter's or fal's to the cent (Seedance 2.5, Veo 3.1, Kling 4.0, FLUX.3 Video,
  Hailuo 2.3, Runway Gen-4.5); a tie goes to the provider listed first, so Replicate runs those only when it is
  the one with a key.

## Models

37 catalog models have a `replicate` route (`replicate: { model, variant? }` in `models.ts`):

| Catalog model | Replicate model |
| --- | --- |
| Nano Banana Pro, 2, 2 Lite, 1 | `google/nano-banana-pro`, `-2`, `-2-lite`, `google/nano-banana` |
| GPT Image 2, GPT Image 1.5 | `openai/gpt-image-2`, `openai/gpt-image-1.5` |
| Krea 2 Large, Medium | `krea/krea-2-large`, `krea/krea-2-medium` (text to image) |
| FLUX.1 Kontext Pro, FLUX 1.1 Pro Ultra, FLUX.1 [dev], [schnell] | `black-forest-labs/flux-kontext-pro`, `flux-1.1-pro-ultra`, `flux-dev`, `flux-schnell` |
| Qwen Image Edit 2511 | `qwen/qwen-image-edit-2511` |
| Recraft Crisp Upscale | `recraft-ai/recraft-crisp-upscale` |
| Seedance 2.5, 2.0, 2.0 Fast, 2.0 Mini | `bytedance/seedance-2.5`, `-2.0`, `-2.0-fast`, `-2.0-mini` |
| MiniMax H3, Hailuo 2.3 | `minimax/h3`, `minimax/hailuo-2.3` |
| Kling 3.0 Standard, Pro | `kwaivgi/kling-v3-video` (`mode: standard` / `pro`) |
| Kling 4.0 | `kwaivgi/kling-v4.0` |
| Grok Imagine Video, 1.5 | `xai/grok-imagine-video`, `xai/grok-imagine-video-1.5` |
| Wan 3.0, 3.0 Prime | `alibaba/wan-3`, `alibaba/wan-3-prime` |
| Veo 3.1, Veo 3.1 Fast | `google/veo-3.1`, `google/veo-3.1-fast` |
| HappyHorse 1.0, 1.1 | `alibaba/happyhorse-1.0`, `alibaba/happyhorse-1.1` |
| Runway Gen-4.5 | `runwayml/gen-4.5` |
| Gemini Omni Flash 1.2 | `google/gemini-omni-1.2-flash` |
| PixVerse 6, 6 Max | `pixverse/pixverse-v6`, `pixverse/pixverse-v6-max` |
| FLUX.3 Video, FLUX.3 Video Draft | `black-forest-labs/flux-3` (`draft: true` for the draft) |

Not routed, though Replicate has them:

- **GPT Image 2.6 Flare and Sunburst** (`openai/gpt-image-2.6-flare`, `-sunburst`, $0.25 an image at `auto`): every
  other provider bills them by token, with no per-image price to compare, and a priced route beats unpriced ones, so
  this one would take every run.
- **Wan 2.7 and 2.6** (split into text and image models with different fields), **Kling O1** (which `mode` matches
  the catalog's model is not clear), **Luma Ray 3.2**, **LTX 2.3**, **Ideogram 4.5**, **Z-Image Turbo**, **Topaz**
  (billed per megapixel or with rules the table does not express yet), **Gemini Omni Flash 1.1** (Replicate's
  `google/gemini-omni-1.1` may not be the Flash).
- **Ideogram 4.6** (`ideogram-ai/ideogram-4-6`, read 20 Nov 2026: $0.06 an image at medium up to 2K, as on fal): added on
  fal only for now. Replicate takes up to 5 `images` and its own `size` (`auto`, `auto_2k`, `auto_4k`, `source` or an exact
  1K / 2K / 4K size), which no route spells yet.
- Anything that takes a video (see [Inputs](#inputs)), and MiniMax H3's reference images (public links only).

## Refreshing the list

A model's page embeds what the app needs, without a key: `https://replicate.com/<owner>/<name>` carries the input
schema (`dereferenced_openapi_schema.components.schemas.Input`, with each field's `enum`, `minimum`, `maximum`) and
the price tiers (`billingConfig.current_tiers`) in its `<script type="application/json">` blocks, and
`replicate:is_official` in a `<meta>` tag. `https://replicate.com/<owner>/<name>/llms.txt` lists the fields in plain
text. `https://replicate.com/collections/official` lists the official models. The API itself
(`GET /v1/models/<owner>/<name>`) needs a key.

## Not verified

No key was available, so none of this has run against Replicate:

- that official models accept multi-megabyte data URIs for every image field routed here;
- that results always come back on `replicate.delivery` (the API reference says files "will be represented as HTTPS
  URLs" and mentions passing `Authorization` to fetch them; the examples on every model page are plain
  `replicate.delivery` urls). A result anywhere else ends the run with its link instead of a download;
- each model's exact behaviour with the fields sent (the schemas were read, not exercised).
