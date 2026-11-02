# Revana integration

Revana ([revana.si](https://revana.si/)) is a fifth provider: one key and one request shape for many image and
video models, routed by Revana across its own suppliers. With a Revana key, the models it serves can run there, and
a run goes there whenever it is the cheapest (see [Which provider runs a model](FAL.md#which-provider-runs-a-model)).
It is the cheapest today on, among others, MiniMax H3 ($0.04/s at 2K), Kling O1, Gemini Omni Flash 1.1 and some
Nano Banana sizes. Everything below was read from Revana's docs (`revana.si/docs`, `/openapi.json`) and probed
without a key on 2 Nov 2026. No run has been verified end to end with a real key yet.

## Hosts and auth

- `Authorization: Bearer <Revana key>` (`sr_live_…`), sent only to `api.revana.si` (`assertRevanaOrigin`).
- `POST https://api.revana.si/v1/generations` `{ model, input }` → a generation `{ id, status: "queued" }`.
- `GET https://api.revana.si/v1/generations/<id>` is polled (`queued`, `running`, `succeeded`, `failed`); the
  record stores that url as its polling url.
- A result is `output.urls[n]`, Revana's own `/v1/generations/<id>/content` link: read with the key, it answers a
  302 to a short-lived file url, which the browser follows without the key.
- `GET https://api.revana.si/v1/balance` returns `available_usd`: the key test (Settings shows it).
- `POST https://api.revana.si/v1/uploads` `{ content_type, bytes, filename }` returns a presigned `upload_url`
  (Cloudflare R2) to `PUT` the bytes to with exactly its `upload_headers`, and `url`, a keyless
  `api.revana.si` link kept 14 days that is passed as the input. Images up to 30 MB, videos 50 MB, audio 15 MB.
- `api.revana.si` answers `access-control-allow-origin: *` and allows the `authorization` header. The production
  CSP allows `api.revana.si` and `*.r2.cloudflarestorage.com` (uploads, and where results redirect).
- Not verified without a key: that the R2 upload and result hosts send CORS headers to other origins. If they do
  not, uploads (frames, references, edits) and downloads fail with a network error.

## Errors

HTTP statuses with `{ error: { code, message } }`; `revana.ts` keeps the message. 401 → "Revana rejected the API
key" ("Invalid Revana key" in the key test), 402 → "Not enough Revana credit: …", 422 (`invalid_input`,
`max_cost_exceeded`) → 400, the rest as they come. A failed generation is HTTP 200 with `status: "failed"` and an
`error.message` written to show as is; Revana charges nothing for it.

## Requests (`revana-payloads.ts`)

One input for every model: `prompt`, `image_url` (first frame, or the image to upscale), `end_image_url`,
`image_urls` (references), `video_url` (the clip to edit), `resolution`, `aspect_ratio`, `duration`, `audio`;
Seedance 2.5 also takes `video_urls` and `audio_urls` (reference media). Revana refuses unknown fields and values
before charging, so the builder sends only what the model's entry in `REVANA_MODELS` (`src/shared/revana-models.ts`,
from `revana.si/data/models.json`) offers, and refuses the rest with a 400, which sends the run to another provider:

- `duration` only when the model lists durations (and never for an edit, which keeps the clip's length).
- `resolution` as Revana spells it (FLUX.3 Video: `hd`, `fhd`).
- `aspect_ratio` for a prompt alone (a frame sets the shape); a model with no list takes 16:9 only.
- `audio` when the model offers sound.
- Frames and references do not mix; reference videos and audio go to Seedance 2.5 only.

## Prices (`revana-pricing.ts`)

Bundled from `models.json` (read 1 Nov 2026): per second (video), per image or per job, one amount or keyed by
resolution, with `+audio` (sound on) and `+video_input` (a video attached: its seconds and the clip's are billed)
rates. These are the cheapest route's prices; when Revana falls back to a dearer route the charge can be higher
(up to what it holds), and each run records what Revana charged (`cost_usd`).

## Models

36 catalog models have a `revana` route (`revana: { model }` in `models.ts`): Nano Banana Pro, 2, 2 Lite and 1,
GPT Image 2, FLUX.1 Kontext Pro, Z-Image Turbo, Recraft Crisp Upscale; Seedance 2.5, 2.0, 2.0 Fast and 2.0 Mini,
MiniMax H3 and H3 Max, Hailuo 2.3, Kling 3.0 Standard, 3.0 Turbo, 4.0 and O1, FLUX.3 Video, Grok Imagine Video and
1.5, Wan 3.0, 3.0 Prime, 2.7, 2.6 and 2.7 Edit, Veo 3.1, Fast and Lite, HappyHorse 1.0 and 1.1, Gemini Omni Flash
1.1, PixVerse 6 and 6 Max, Vidu Q4. Kling 3.0 Pro is not routed (Revana's one Kling 3.0 renders Standard's 720p),
nor motion control (Revana's input for it is not documented).
