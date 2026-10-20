# fal integration (verified rules)

fal ([fal.ai](https://fal.ai)) is the second provider, next to OpenRouter. It serves models OpenRouter
does not have (Kling 3.0 Motion Control, Gemini Omni Flash, Vidu, PixVerse and more) and a few that both
offer. The browser talks to fal directly, like it does to OpenRouter: the client is
`src/client/lib/fal.ts`, the request bodies are built in `src/client/lib/fal-payloads.ts`, the provider
choice lives in `src/client/lib/providers.ts` and `src/client/lib/engine/provider.ts`, and jobs share the
lifecycle in `src/client/lib/engine/` with OpenRouter's. Every fal endpoint below allows cross-origin
requests.

These rules are what the code does and what `src/client/__tests__/fal.integration.test.ts` and
`src/client/lib/__tests__/fal.test.ts` check against a mocked fal (`src/client/__tests__/mock-openrouter.ts`).
No fal route is marked `verified` yet ([MODELS.md](MODELS.md#fal-models)). Keep this page exact: if fal
turns out to behave differently, fix the code and this page in the same PR.

## Which provider runs a model

- A model is on OpenRouter unless it is `offOpenRouter`, on fal when it has a `fal` route, on kie.ai with a
  `kie` route and on APIMart with an `apimart` route (`modelProviders`, in that order). Every model is listed in the picker
  whichever keys are set.
- Only providers with a stored key that can take the request count (a provider refuses what its payload
  builder throws on: fal and style references, kie and a clip shorter than the model takes there…). None:
  the model cannot run. One: that one runs it. Several:
  - **Videos go to the cheapest** (`quoteVideo` in `src/client/lib/video-cost.ts`, used by the composer for
    the price it shows and by the engine to route the run, so the two agree). Each provider is priced for
    the request as it stands: OpenRouter from the live catalog (its no-audio price when Sound is off), fal
    from `FAL_PRICES`, kie.ai from `KIE_PRICES` ([KIE.md](KIE.md)) and APIMart from `APIMART_PRICES`
    ([APIMART.md](APIMART.md)) for the endpoint or model the inputs pick, all for the duration, resolution
    and audio sent. Prices within half a cent are a tie: the
    preferred provider if it is among the cheapest, else the first of them.
  - **Images go to the preferred one** among them (`quoteImage` in `src/client/lib/image-cost.ts`), else
    the first (OpenRouter, fal, kie.ai, APIMart).
  - The preference (`higgsfree.preferredProvider`, OpenRouter by default, any of the four) also decides a
    video whose price is not known yet (an edit before its video's length is).
- The provider is chosen when the job is submitted and saved on the record (`Generation.provider`).
  Polling, resume and the download use that provider and its key, re-read every tick, whatever the
  preference says later. A record made before fal support has no `provider` and counts as OpenRouter.
  Retry chooses again from the keys, the prices and the preference at that moment.
- No usable key: the submit is a 401 and nothing is created. The message is the composer notice
  (`providerNotice`), e.g. "Kling 3.0 Motion Control runs on fal. Add a fal key in Settings to use it.",
  "Vidu Q4 needs a fal or kie.ai key. Add one in Settings to use it." or "Krea 2 Large runs on OpenRouter.
  Add an OpenRouter key in Settings to use it.". With no key at
  all, a model OpenRouter serves gets "No OpenRouter key configured. Add one in Settings."

## Hosts and auth

| Host | Used for | Key |
|---|---|:-:|
| `https://fal.run` | `POST /<endpoint>`: run a job and get the result in the same request (images) | ✓ |
| `https://queue.fal.run` | `POST /<endpoint>`: queue a job, then its status and result urls (videos) | ✓ |
| `https://rest.fal.ai` | `POST /storage/upload/initiate` (uploads) | ✓ |
| `https://api.fal.ai` | `GET /v1/models/pricing` (key test) | ✓ |
| the urls fal returns for files | output downloads and the presigned upload `PUT` | – |

Keyed calls send `Authorization: Key <fal key>` and `Content-Type: application/json`, nothing else. The
hosts are fixed in `fal.ts`; there is no build-time setting for them.

The key goes to those four hosts only. Every keyed url, including the `status_url` fal hands back and
the result url derived from it, must be `https:` on one of them; anything else is refused before the
request is made (`assertFalOrigin` throws `FalOriginError`, "Refusing to send the fal key to <host>"),
which ends a video job for good. File urls (outputs, the upload target) are fetched without the key and
only checked for `https:`.

## Errors

Every failure is an `ApiClientError` (`src/client/lib/errors.ts`) with fal's body kept in `provider`.

- 401 or 403 becomes a 401, "fal rejected the API key" (the key test says "Invalid fal key").
- Any other non-2xx keeps fal's status. The message is read from the body (`falMessage`): `detail` as a
  string, `detail` as a list of `{ loc, msg }` (each written `loc: msg` with `body` dropped from `loc`,
  joined with `; `, e.g. "prompt: too long"), then `message`, `error.message`, or `error` as a string.
  Without one: "fal returned HTTP <status>".
- Nothing answered (offline, CORS): status 0, "fal unreachable". A 2xx whose body is not a JSON object:
  502, "fal returned a non-JSON response".
- In a video job, a 400, 404 or 422, or a url off fal's hosts, ends the job. Everything else, 401 and
  403 included, is retried on the next tick: the key may have just been rotated. No fal key stored means
  wait.
- An image call is not retried: any error fails the record with fal's message verbatim.

Timeouts: 10 min for an image run, 90 s for a queue submit, 30 s per status poll, 60 s for a result,
30 s for an upload initiate, 10 min for the upload `PUT`, 10 min for a file download, 15 s for the key
test.

## Images

- `POST https://fal.run/<endpoint>` with the input as the JSON body. fal answers when the image is done:
  `{ images: [{ url, content_type }] }`. No `images[0].url` is a 502, "fal returned no image".
- The endpoint is the route's `edit` when reference images are attached, otherwise `textToImage`. A
  model without the one it needs is a 400 ("… on fal does not take reference images", "… needs at least
  one reference image").
- `images[0].url` is downloaded from fal's CDN **without the key**, then sniffed like every other image
  (PNG / JPEG / WebP, width and height from the header) and stored as `gen_<id>.<ext>`.
- fal reports no cost: the record has no `costUsd`.
- Batches (one call per image, in parallel), the 10 minute limit and the rule that an image call cannot
  be resumed are the same as OpenRouter's ([OPENROUTER.md](OPENROUTER.md#images)).

### Image fields (`buildFalImagePayload`)

The model's `fal` route (`FalImageRoute`) says how each option is spelled.

- `prompt`, then the route's fixed `extra` fields.
- References are data URLs built from the library right before the call: `image_urls: [...]`
  (`refs: "image_urls"`) or `image_url` with the first one only (`refs: "image_url"`).
- Aspect ratio, only when it is not `auto` and the model lists it:
  - `aspect: "aspect_ratio"` → `aspect_ratio: "16:9"`.
  - `aspect: "image_size"` → `image_size`: the model's own `imageSizes` value if it has one (GPT Image
    1.5: `"1536x1024"`), else fal's preset (`1:1` `square_hd`, `4:3` `landscape_4_3`, `3:4`
    `portrait_4_3`, `16:9` `landscape_16_9`, `9:16` `portrait_16_9`), else an explicit
    `{ width, height }` of about one megapixel in multiples of 64 (`2:3` 832×1216, `3:2` 1216×832, `4:5`
    896×1152, `5:4` 1152×896, `21:9` 1536×640).
  - No `aspect`: never sent.
- `resolution: "1K" | "2K" | "4K"` only when the route has `resolution: true`, the model has
  `supportsImageSize` and lists the size (Nano Banana Pro, Nano Banana 2).

## Videos

- Submit: `POST https://queue.fal.run/<endpoint>` with the input as the JSON body →
  `{ request_id, status_url, response_url, … }`. A missing `request_id` or `status_url` is a 502. The
  record becomes `running` with `providerJobId = request_id` and `pollingUrl = status_url`.
- fal's status and result urls use only the app's owner/alias, not the full endpoint id: a job submitted
  to `fal-ai/kling-video/v3/pro/motion-control` is polled at
  `https://queue.fal.run/fal-ai/kling-video/requests/<id>/status`. The app uses the url fal returns and
  never builds one from the endpoint. The result url is the status url without `/status`
  (`responseUrlFor`); the submit's `response_url` is not stored.
- Poll `GET <status_url>` with the key every **6 s** from the tab holding the job's lock. `status` is
  upper-cased; a missing one counts as `IN_QUEUE`.
  - `IN_QUEUE`, `IN_PROGRESS`: keep polling.
  - `COMPLETED` with an `error`: fail with that text verbatim.
  - `COMPLETED`: `GET <result url>` with the key → `{ video: { url } }`. No url: "fal reported
    completion but returned no video url".
  - Anything else: keep polling (warned once in the console).
- Download `video.url` from the CDN **without the key**, read whole with `response.blob()`, typed
  `video/mp4`, width / height / duration read from the `moov` box, stored as `gen_<id>.mp4` in the same
  IndexedDB transaction that marks the record completed. A failed download is retried on the next tick
  unless it is permanent; a full storage quota fails the record.
- fal reports no cost: `costUsd` stays empty.
- The rest is OpenRouter's lifecycle ([OPENROUTER.md](OPENROUTER.md#videos)): the Web Lock taken before
  the record exists, the 45 minute timeout, the steward that adopts a video with a polling url after its
  tab closed (`engine/resume.ts`; for fal the polling url is the status url), and deletes that abort the
  run.

### Video fields (`buildFalVideoPayload`)

The model's `fal` route (`FalVideoRoute`) names the endpoints and spells the options. Only what was sent
is stored in the record's `params`.

- The endpoint is `imageToVideo` when a first or last frame is attached, otherwise `textToVideo`. A model
  without the one it needs is a 400 ("… on fal does not take a first frame", "… on fal needs a first
  frame"). A route with `firstLastFrameToVideo` (FLUX.3 Video Draft) sends a job with a last frame there
  instead; it needs the first frame too ("… on fal needs a first frame with the last frame").
- `prompt` (trimmed, sent even when empty), then the route's `extra` fields (MiniMax H3 Max:
  `prompt_expansion_mode: "balanced"`).
- `duration` is snapped to the catalog's values (`snapDuration`), then written as the route says:
  `"number"` → `5`, `"string"` → `"5"`, `"seconds"` → `"5s"`. No `duration` on the route: not sent.
- Frames are data URLs. The first frame goes in `imageField` (`image_url` by default, `start_image_url`
  for Kling 3.0 Pro and Standard), the last frame in `end_image_url`, only with `endImage: true`
  (otherwise a 400). On the `firstLastFrameToVideo` endpoint they are `start_image_url` and
  `end_image_url`.
- `aspect_ratio`: `aspect: "always"` sends it with or without a frame, `aspect: "text"` only for
  text-to-video, no `aspect` never. `omitAspectRatioOnI2v` still drops it when a frame is attached.
- `resolution`: the requested one if the model lists it, else the model's default, mapped through
  `resolutions` (`480p` → `"480P"` on MiniMax H3 Max, `4K` → `"4k"` on Gemini Omni Flash, `2K` / `4K` →
  `"1440p"` / `"2160p"` on LTX 2.3). No map, or a resolution the map does not list: not sent.
- Audio: only for a model with `caps.audio`, a route `audio` field and a value the user set, as
  `generate_audio` or `generate_audio_switch` (PixVerse). MiniMax H3 has audio but no field on fal, so
  the toggle is not sent there.
- Style references are not sent to fal. A run that has them is a 400 before anything is created ("… on
  fal does not take style references. Remove them, or prefer OpenRouter in Settings.").

### Motion control

Kling 3.0 Motion Control (Pro and Standard) copies the movement of a reference video onto a character
image. These models have `caps.motionControl: true` and only a `motionControl` endpoint.

- The character image (`inputs.firstFrame`) and the reference video (`inputs.motionVideo`) are required
  (a 400 otherwise); the prompt is optional. `orientation` (`VideoParams.orientation`) is `video` (the
  default: the character follows the video's orientation) or `image`.
- Input: `{ image_url: <character data URL>, video_url: <uploaded file url>, character_orientation }`,
  plus `prompt` when it is not empty after trimming. Duration, resolution and aspect ratio are not sent.
- fal's limits on the reference video: at least 3 s, at most 30 s with `video` and 10 s with `image`
  (`MOTION_VIDEO_LIMITS` in `engine/video.ts`). The app checks an MP4 or MOV against them before
  uploading, reading the length from its `moov` box, and refuses with a 400 ("The reference video is
  12 s. Kling 3.0 Motion Control takes up to 10 s when following the image. Switch to Follow video for
  up to 30 s."). A WebM, or a file whose length cannot be read, is left to fal.
- The clip is as long as the reference video. The record is created with `params.duration: 0`; when the
  clip lands, its duration is read from the MP4 header and stored, rounded to the second.
- The reference video is uploaded at every submit, right before the queue call, so a retry uploads it
  again.

### Video editing

Editors (`caps.videoEdit`, the `edit` endpoint) change a video from a prompt; see
[MODELS.md](MODELS.md#video-editing) for the list.

- The video (`inputs.sourceVideo`: an upload, or another record's output) and a non-empty prompt are
  required (a 400 otherwise). Frames, style references and a motion video are refused.
- Input: `{ prompt, video_url: <uploaded file url> }`, plus `resolution` when the route maps the
  requested one (or the model's default): `4K` → `"4k"` on Gemini Omni Flash, `480p` / `720p` on Grok
  Imagine, `720p` / `1080p` on Wan 2.7. Kling O3 Edit (the video's own resolution) and FLUX Video Edit
  (720p) send none. Duration, aspect ratio and audio are never sent.
- The model's limits on the video (`editSource`) are checked before uploading, reading the length from
  the MP4 / MOV `moov` box: "The video is 12 s. Wan 2.7 Edit takes up to 10 s.", "The video is 64 MB.
  FLUX Video Edit takes up to 50 MB.". Grok Imagine keeps the first 8 s of a longer video instead
  (`truncates`), so any length goes. A WebM, or a length that cannot be read, is left to fal.
- As with motion control, the record is created with `params.duration: 0` and gets the clip's length
  when it lands, and the video is uploaded again at every submit.

## Uploads

Only videos are uploaded: the motion-control reference video and the video to edit. Images (frames,
references) travel inline as data URLs in the request body.

1. The video is first stored in the library: `uploadVideo` (`src/client/lib/api.ts`) takes MP4, MOV and
   WebM up to 90 MB, sniffed with `video-meta.ts` (an `ftyp` box, brand `qt  ` for MOV; the EBML magic
   for WebM; the declared type is not trusted), and stores it as `up_<id>.mp4|mov|webm`.
2. At submit: `POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3` with the key and
   `{ content_type, file_name }` (the media id) → `{ upload_url, file_url }`. Either missing: 502.
3. `PUT <upload_url>` with the bytes and the `Content-Type`, **without the key** (a presigned url, which
   must be `https:`). A non-2xx is a 502, "fal upload failed (HTTP …)".
4. `file_url` goes in `video_url`. It is a public url: anyone who has it can fetch the video.

Uploads above 90 MB go through fal's multipart flow, which the app does not implement, so the library
refuses bigger videos and `fal.upload` refuses them again (413).

## Key test

`GET https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/flux/schnell` with the key (15 s), the
cheapest authenticated call. A 2xx means fal accepted the key; 401 / 403 is "Invalid fal key".
**Test connection** in Settings › Keys tests the pasted key without saving it, or the saved one.

## Settings

- The fal key is stored in localStorage under `higgsfree.falKey`, the preference under
  `higgsfree.preferredProvider` (`"openrouter"` unless it is `"fal"`). Both survive "Reset local
  settings" (`PROTECTED_STORAGE_KEYS`). The key is only ever shown masked (first 9 and last 4
  characters).
- Settings › Keys (the Settings dialog, `src/client/components/settings/ProvidersCard.tsx`): paste,
  Save, Test connection, Remove key, and "Run models both providers offer on" OpenRouter / fal, which
  can only be changed once both keys are saved.
- Generate never stays blocked by a missing key: it opens the key dialog for the provider the model
  needs (`useKeyGate`), which tests the key, saves it and starts the generation ("Save and generate").

## Catalog

- fal-only models are curated in `src/shared/models.ts` (`offOpenRouter: true`, ids `fal/<name>`) and never
  looked up in OpenRouter's catalogs: `src/client/lib/catalog.ts` keeps them whatever OpenRouter lists.
- A curated video model with a `fal` route that OpenRouter stops listing stays, marked `offOpenRouter`. One
  without a fal route leaves the picker, as before.
- Image models are not re-marked: a curated image model OpenRouter stops listing stays as it is.
- The app reads no catalog from fal. fal-only models use their curated options; a model both offer takes
  OpenRouter's live options, mapped through its fal route.

## Cost estimates

The composer estimates a run on fal from fal's list prices, not the catalog's (those are OpenRouter's).

- `FAL_PRICES` (`src/shared/fal-prices.ts`) has a price for every endpoint a route names, read from the
  endpoint's page (`fal.ai/models/<endpoint>/llms.txt`) on 15 Oct 2026; a test checks it covers every
  endpoint, size and resolution the catalog offers. fal's pricing API needs a key and gives one unit
  price per endpoint, without the tiers below, so the app does not read it.
- A price is per second of video (one rate, or one per resolution; a higher one with audio on, as on
  Kling and PixVerse; a promotional rate up to a date, as on Vidu Q4 and FLUX.3 Max), per image (by size, or by the
  output size the ratio asks for, as on GPT Image), or per started megapixel of 1024 x 1024 (FLUX.1
  [dev] and [schnell], Z-Image, Qwen).
- `estimateFalImageCost` / `estimateFalVideoCost` (`src/client/lib/fal-pricing.ts`) build the payload
  the run would send and price it: the endpoint the frames pick (Luma and FLUX.3 Video Draft differ by
  endpoint), the resolution and duration sent, audio on unless turned off. A request the builder refuses
  has no estimate.
- Motion control is priced by the reference video's length, read by the browser when the video is
  added. A video brought back from a draft has no known length, so no estimate.
- Video editing is priced by the video's length too (up to 8 s on Grok Imagine, which keeps no more),
  at the resolution sent. A video handed over with **Edit video** brings its length from its record.
  Grok Imagine's price counts the input second as well ($0.05 / $0.07 per output second plus $0.01).
- Quality and size defaults are fal's (GPT Image at high, Ideogram at medium); GPT Image edits also pay
  for their input images, which the estimate leaves out.

## Known gaps

- **Runs on fal record no cost.** fal returns none with a result; only the estimate before the run
  says what it should cost.
- **Style references are not sent to fal.** A video with style references is refused on fal; prefer
  OpenRouter in Settings for it.
- **No multipart uploads.** Videos above 90 MB are refused.
- **The upload `PUT` host is assumed to be fal's CDN.** It is whatever `upload_url` fal returns, checked
  only for `https:` since it carries no key. The production CSP allows `fal.media`, `*.fal.media` and
  `storage.googleapis.com` for uploads and downloads; a target anywhere else would be blocked by the
  browser.
- **Cancel is best effort.** Deleting a running fal video stops polling and sends `PUT …/requests/<id>/cancel`;
  fal may still finish (and bill) a job that was already processing. Images run synchronously and are not cancelled.
