# OpenRouter integration (verified rules; do not simplify)

Everything here was learned by running the models through the app. Keep it exact. The browser talks to
OpenRouter directly: the client is `src/client/lib/openrouter.ts`, the request bodies are built in
`src/client/lib/payloads.ts`, and the job lifecycle lives in `src/client/lib/engine/`. OpenRouter allows
cross-origin requests from any page on every endpoint below, including the `Authorization`, `HTTP-Referer`
and `X-Title` headers, which is what makes a server unnecessary.

## Headers

On every call: `Authorization: Bearer <key>`, `Content-Type: application/json`,
`HTTP-Referer: <location.origin>`, `X-Title: <NEXT_PUBLIC_APP_NAME, default higgsfree>`.

The key goes to one origin only. Every url (the API base, a `polling_url`, a content url) is resolved
against `NEXT_PUBLIC_OPENROUTER_BASE_URL` (default `https://openrouter.ai`) and anything on another origin is
refused before the request is made (`assertProviderOrigin` throws `ForeignOriginError`, which ends the job
for good: "Refusing to send the API key to <host>").

## Errors

Every non-2xx becomes an `ApiClientError` (`src/client/lib/errors.ts`): `status` is OpenRouter's own,
`error` a readable message, and `provider` the response body **verbatim**. Their 400 bodies list the
supported values (e.g. "Supported resolutions: 480p, 720p") and the UI shows them on the card. A 401 stays a
401 with the message "OpenRouter rejected the API key" (the key test reports it as "Invalid API key").
Status 0 means nothing answered (offline, CORS) or local storage is unavailable. A 2xx whose body is not
JSON is a 502.

Request timeouts: 6 min for an image call (the record itself times out after 10 min), 90 s for a video submit, 30 s per poll, 15 s for credits,
20 s per model list.

## Images

- `endpoint: "chat"` models → `POST /api/v1/chat/completions` with
  `{ model, messages:[{role:"user", content}], modalities:["image","text"], image_config?:{ aspect_ratio?, image_size? }, usage:{ include:true } }`.
  - `content` is a string for text-to-image, or an array
    `[ {type:"text",text}, {type:"image_url", image_url:{url:dataUrl}}… ]` for image-to-image / references.
    The data URLs are built from the Blobs in the IndexedDB `media` store right before the call
    (`engine/inputs.ts`); a reference that is no longer in the library is a 400 naming it.
  - Omit `image_config.aspect_ratio` when the user picked `auto`. Only send `image_size` when the catalog
    says `supportsImageSize`. Omit `image_config` altogether when both are absent.
  - `usage: { include: true }` asks for `usage.cost` in the response. That is the actual cost; store it
    when present.
  - Result: `choices[0].message.images[0].image_url.url` is a `data:image/...;base64,...` URL. Models may
    return >1 image; take `[0]`. No image plus a text `content` is a refusal: fail with that text
    ("Model returned no image: …"). A body with an `error` field is a 502.
- `endpoint: "images"` models (Krea 2, `openai/gpt-image-2`) → `POST /api/v1/images/generations` with
  `{ model, prompt, size?, image?: [dataUrl…], input_fidelity?: "high" }` → `data[0].b64_json`.
  - `size` only when the model lists more than one aspect ratio and the user did not pick `auto`
    (`1:1` → `1024x1024`, `2:3` → `1024x1536`, `3:2` → `1536x1024`). Krea is 1:1 only and gets no `size`.
  - With reference images always send `input_fidelity: "high"` (gpt-image-2 edits).
- Batches: `count` requests at once (`Promise.allSettled`), each its own `Generation` sharing a `batchId`;
  at most 4 per batch, 8 reference images, 8000 prompt characters.
- The result is **sniffed**, never trusted: PNG `89 50 4E 47`, JPEG `FF D8`, WebP `RIFF….WEBP`
  (`image-meta.ts`); width and height come from the header (PNG bytes 16–24, JPEG SOF, WebP
  VP8/VP8L/VP8X), no native deps. Anything else fails with "Provider returned data that is not a PNG, JPEG
  or WebP image". The Blob is stored as `gen_<id>.<ext>` in the same IndexedDB transaction that marks the
  record completed, so a deleted record never leaves a file behind.
- An image call cannot be resumed. It runs in the tab that submitted it, which warns before unloading
  while calls are in flight. If the tab closes anyway, the steward in the next tab (or the next visit)
  marks the record failed with "Interrupted: the page running this image was closed. The provider may still
  have charged for it." and offers Retry. Re-running it automatically could bill twice, so the app never
  does.

## Videos

- `POST /api/v1/videos` with
  `{ model, prompt, duration, aspect_ratio?, resolution?, frame_images?, input_references?, generate_audio? }`.
  - `duration` is **snapped** to the nearest value the catalog allows for the model (`snapDuration` in
    `src/shared/models.ts`) before it is sent; the value actually used is what gets stored with the
    generation.
  - **Submit returns HTTP 202** (accept 200 and 202). Body: `{ id, polling_url, status:"pending" }`.
    A missing `id` or `polling_url` is a 502.
  - `generate_audio: boolean` toggles the native audio track (OpenRouter defaults to on for audio-capable
    models). Send it **only** when the catalog says `caps.audio` **and** the request set `audio`
    explicitly; never send it to silent models.
  - Image-to-video MUST use
    `frame_images: [{ type:"image_url", image_url:{ url:dataUrl }, frame_type:"first_frame"|"last_frame" }]`.
    A top-level `image` field is silently ignored.
  - `input_references: [{ type:"image_url", image_url:{url} }]` for style/character refs without locking
    a frame. Never sent to models with `caps.references: false` (the request is rejected first with a
    400).
  - If the model has `omitAspectRatioOnI2v` and any `frame_images` are present, **do not send
    `aspect_ratio`** (Seedance returns 400 otherwise).
  - Only send `resolution` if the model lists it; some models accept only one value (Hailuo 3 → `2K`).
    A model that lists none (discovered models) never gets one.
  - Frames and references are media ids in the library (an upload, or another record's output). They are
    read from IndexedDB and converted to data URLs right before the submit.
- The record is `pending` until the 202 arrives, then `running` with `providerJobId` and the polling url.
  The submitting tab takes the job's Web Lock (`higgsfree:job:<id>`) **before** the record exists and keeps
  it for the whole poll loop, so a pending video without a polling url whose lock is free can only be a
  submit that died with its tab.
- Poll `polling_url` (absolute; if relative, resolve against the base; **it must be on openrouter.ai**)
  every **6 s** from the tab holding the lock. Response:
  `{ status, unsigned_urls?: string[], urls?: string[], usage?: { cost }, error?|message? }`.
  - `pending | queued | processing | running | in_progress | starting` keep polling;
    `completed | succeeded | success | done` finish; `failed | error | errored | cancelled | canceled |
    rejected` fail with the provider's error text **verbatim**. An unknown status with an `error` fails;
    without one it keeps polling (warned once in the console).
  - A poll that fails with 400, 404 or 422, or a url on a foreign origin, ends the job. 401 / 403 are transient
    (the key may have just been rotated): keep polling with whatever key is stored, re-read every tick;
    no key means wait. Network errors are retried on the next tick.
  - On `completed`: download `unsigned_urls[0] ?? urls[0]` **with the Bearer header** (a plain fetch
    returns 401). The body is read as a stream that aborts after 60 s without a chunk or 30 min in total,
    collected with `response.blob()`, typed `video/mp4` and stored as `gen_<id>.mp4` in the same IndexedDB
    transaction that marks the record completed. Width / height / duration come from the `moov` box via
    bounded `Blob.slice` reads (`parseMp4MetaFromRanges`), never the whole file. Set `output`,
    `costUsd = usage.cost`, `elapsedMs`, `completedAt`. A download error that is not permanent is retried
    on the next tick; a full storage quota fails the record and keeps the cost ("Generated (cost $…) but
    couldn't be saved.").
  - Moderation is async: a 202 can still fail minutes later; never mark completed before the poll says so.
  - **45 minutes** after the record was created without a terminal status: "Timed out waiting for
    provider".
- A tab that becomes visible polls every job it drives at once instead of waiting out the interval.
- Resuming (`engine/resume.ts`): a steward in every open tab runs at boot, every 30 s and whenever the
  tab becomes visible. For every `pending` / `running` record whose lock is free it adopts a video that
  has a polling url (polling continues from this tab), fails a video without one ("Interrupted before the
  provider accepted the job."), or fails an image (see above). Web Locks release when a tab closes, crashes
  or is discarded, so a job is never driven twice and never orphaned while a tab is open. Nothing runs
  when no tab is open. Without Web Locks (an insecure context such as plain http on a LAN address) the app
  assumes it is the only tab.
- Deleting a record aborts the run in the tab that drives it (every other tab hears about it over the
  BroadcastChannel); a result that lands for a deleted record is discarded, never written.

## Credits
- `GET /api/v1/credits` → `{ data: { total_credits, total_usage } }`.
- `GET /api/v1/key` → `{ data: { label, limit, usage, is_free_tier } }`.
- Fetched together, cached 30 s per key (`credits.ts`). "Test connection" in Settings › Keys (and the key dialog's check before saving) bypasses the cache and
  can test a pasted key without saving it.

## Live model catalog
Two public catalogs, fetched by the browser at startup with or without a key (the key is sent when
there is one):
- `GET /api/v1/videos/models` → per model `supported_durations`, `supported_resolutions`,
  `supported_aspect_ratios`, `supported_frame_images` (`first_frame`, `last_frame`),
  `generate_audio` and `pricing_skus`. A model with no durations (editing, upscaling, avatars) is
  hidden. Unknown values (`8K`, `5:4`) are dropped; resolutions are matched case-insensitively.
- `GET /api/v1/images/models` → per model `supported_parameters` as typed descriptors
  (`{ type: "enum", values }`, `{ type: "range", min, max }`, `{ type: "boolean" }`; an absent key
  means unsupported) and `architecture.output_modalities`. Every model here is served by the
  native `POST /api/v1/images`.

`live.available` (what the picker marks unavailable) is the union of both lists. Video prices come
from `pricing_skus` (`src/client/lib/catalog.ts` `perSecondUsd`): a with-audio SKU wins because
audio is on by default, then the per-resolution one, then text-to-video, then cents SKUs (÷ 100),
then a flat per-second price. Per-token SKUs (`video_tokens*`, Seedance) are converted at width ×
height × 24 / 1024 tokens a second for a 16:9 frame.

The snapshot is cached for 10 minutes in memory and mirrored to localStorage
(`higgsfree.live-models`, `version: 2`; an older shape is ignored) so a new tab or a reload reuses it;
concurrent callers share one in-flight fetch. If either list fails, keep the previous snapshot (or
none), since a partial one would drop models, and do not ask again for 60 s (`LIVE_RETRY_MS`). A
failed refresh must never break the picker: the curated catalog always renders.

## Native images API
Discovered image models (anything in `/api/v1/images/models` without a curated entry) use
`POST /api/v1/images` with `{ model, prompt, aspect_ratio?, resolution?, input_references? }`:
- `aspect_ratio` only when the user did not pick `auto` and the model lists it.
- `resolution` (1K / 2K / 4K) only when the catalog lists `resolution` for the model.
- `input_references: [{ type: "image_url", image_url: { url: dataUrl } }]` for reference images.
- Response `{ data: [{ b64_json, media_type }], usage: { cost } }`; `data[0].b64_json` is decoded
  and sniffed like every other image. A body with an `error` field is a 502.

## Prompt editor (video composer)

Two calls, both with the user's key, neither saved to the library (`src/client/lib/prompt-editor.ts` builds the
bodies, `api.rewriteVideoPrompt` / `api.previewVideoFrame` make the calls):
- Rewrite: `POST /api/v1/chat/completions` with
  `{ model: "openai/gpt-6-luna", messages: [system, user], stream: true, max_tokens: 2500, reasoning: { effort: "low", exclude: true }, usage: { include: true } }`.
  The reply is server-sent events: `data: {json}` lines with `choices[0].delta.content`, `:` keep-alive comments,
  `usage.cost` in the last chunk, then `data: [DONE]`. An `error` chunk mid-stream is a 502 with OpenRouter's
  message; a non-2xx before the stream is the usual `ApiClientError`. A reply that is not `text/event-stream`
  (a buffering proxy) is read whole. `chatText` in `openrouter.ts`; 90 s timeout.
- Preview: the native images API with `{ model: "openai/gpt-image-2.5-flare", prompt, aspect_ratio, quality: "low",
  input_references? }` (`quality` is in that model's catalog entry). The video's ratio when Flare lists it, else
  the closest; the first frame as the one reference when attached.
- Recreate video: the same streamed chat call with `model: "google/gemini-4-argon"`, `max_tokens: 4000` (a detailed
  description of up to ~300 words, every spoken line quoted word for word) and a user message in parts,
  `[{ type: "text", text }, { type: "video_url", video_url: { url: dataUrl, processing: "static" } }]`. The clip
  goes inline as a base64 data URL (OpenRouter only passes http(s) video urls to a few providers, and Gemini on
  AI Studio takes YouTube links only); the file is sniffed first (`video-meta.ts`: MP4, QuickTime, WebM) and
  capped at 15 MB (Gemini's inline request limit is 20 MB). The data URL's type is `video/mp4`, `video/webm` or
  `video/mov`: OpenRouter and Gemini both spell QuickTime that way, not `video/quicktime`. `processing: "static"`
  is Gemini's one-pass mode for short clips (`agentic` navigates long ones). 4 min timeout.
