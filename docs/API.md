# Open Higgsfield server API contract

All endpoints are JSON unless noted. Errors use the `ApiError` shape from `src/shared/types.ts`:
`{ error: string, status: number, provider?: unknown }`: when OpenRouter returned a body, put it in
`provider` **verbatim** (their 400 messages list the supported values, e.g. "Supported resolutions: 480p, 720p").

Base URL in dev: Vite proxies `/api` and `/media` to `http://localhost:8787`.

## Request guards (no auth; the browser's same-origin policy is the perimeter)

Implemented in `src/server/security.ts`, applied before every route:

| Check | Applies to | Failure |
|---|---|---|
| `Host` hostname (port stripped, `[::1]` handled) must be in the allowed set: `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`, the host of `APP_URL`, plus `ALLOWED_HOSTS` (comma-separated). `ALLOWED_HOSTS=*` disables the check. Only the received `Host` counts: `X-Forwarded-Host` / `X-Forwarded-*` are never consulted, so a reverse proxy must pass the browser's `Host` through (nginx `proxy_set_header Host $host;`) and its public hostname must be allowed. | every request: `/api/*` (incl. `/api/health`), `/media/*`, the SPA | `403 {error:"Unrecognised Host"}` |
| Requests **with a body** must send `Content-Type: application/json` or `multipart/form-data` (blocks CORS "simple requests" such as `text/plain` POSTs, which browsers send without a preflight). Bodiless `DELETE` / `POST …/retry` are exempt. | `POST/PUT/PATCH/DELETE /api/*` | `415 {error:"Content-Type must be application/json"}` |
| `Sec-Fetch-Site`, if present, must be `same-origin`, `same-site` or `none`. | `POST/PUT/PATCH/DELETE /api/*` | `403` |
| `Origin`, if present, must have an allowed hostname (only hostnames are compared, never ports or schemes, so the Vite dev server on `:5173` proxying to `:8787` passes). | `POST/PUT/PATCH/DELETE /api/*` | `403 {error:"Origin not allowed"}` |

Every rejection logs one line (`security: 403 POST /api/generate/video: Host "…" is not allowed …`), never a body.
Every response carries `X-Content-Type-Options: nosniff`.

Body limits: `/api/upload` = 25 MB × 1.37 + 4 KB; `/api/generate/*` = `max(maxReferenceImages) × 25 MB × 1.37 + 64 KB`
(6 × 25 MB ≈ 206 MB with the current catalog; the 64 KB is headroom for the prompt and the other JSON
fields around the inline images); over the limit → `413` with a readable message.

Concurrency: `MAX_ACTIVE_JOBS` (default 8) caps pending + running generations across the instance.
`POST /api/generate/*` returns `429 {error:"Too many active generations (8). Wait for some to finish."}`
when `active + requested count` would exceed it (a batch of 4 is rejected as a whole). The check runs
twice: before any input is touched (fast failure) and again right before the records are inserted, after
the async upload / read-back of inputs, so concurrent requests cannot overshoot the ceiling together.

| Method | Path | Body / Query | Response | Notes |
|---|---|---|---|---|
| GET | `/api/health` | — | `HealthResponse` | |
| GET | `/api/settings` | — | `SettingsResponse` | Never returns the raw key. |
| PUT | `/api/settings` | `UpdateSettingsRequest` | `SettingsResponse` | `apiKey: ""` clears the DB key. Env key always wins. |
| POST | `/api/settings/test` | `{ apiKey?: string }` | `CreditsResponse` | Tests the given key (or the active one) against `GET /api/v1/key` + `/credits`. 401 → `{error:"Invalid API key"}`. |
| GET | `/api/credits` | — | `CreditsResponse` | Cached 30s. |
| GET | `/api/models` | — | `ModelsResponse` | Catalog from `src/shared/models.ts` (hidden models excluded) + live availability (cached 10 min, best-effort). `video` also carries **discovered** models: every slug in OpenRouter's `output_modalities=video` list that the catalog does not know, synthesized with conservative caps (`discovered: true`, `resolutions: []`, no price; see [MODELS.md](MODELS.md#discovered-models)). They follow the snapshot, so a new OpenRouter model appears within 10 minutes. `live` is omitted when no key is configured (nothing is fetched); after a failed refresh the previous snapshot is served and upstream is left alone for 60 s. |
| POST | `/api/generate/image` | `ImageGenerateRequest` | `GenerateResponse` | Returns `count` records immediately with `status:"pending"` sharing one `batchId`; server runs them in parallel and pushes updates over SSE. `aspectRatio` (except `auto`) and `size` must be in the model's catalog entry → 400 listing the allowed values. 429 over `MAX_ACTIVE_JOBS`. |
| POST | `/api/generate/video` | `VideoGenerateRequest` | `GenerateResponse` | Submits to OpenRouter `/videos` (expects **HTTP 202**), stores `providerJobId` + polling url, returns 1 pending record. Background poller updates it. `resolution` / `aspectRatio` must be in the catalog entry → 400 listing the allowed values (aspect ratio is not checked when it will be dropped on i2v; a model that lists no resolutions rejects any `resolution` with "does not accept a resolution"). `lastFrame` needs `caps.lastFrame`; `references` is rejected with 400 when `caps.references === false` (e.g. `FLUX.3 Video does not accept style references`). `audio` → `generate_audio` for audio-capable models. Discovered models (see `GET /api/models`) are accepted like catalog ones; the live snapshot is refreshed first if the slug is unknown. 429 over `MAX_ACTIVE_JOBS`. |
| GET | `/api/generations` | `ListGenerationsQuery` | `ListGenerationsResponse` | Newest first. `limit` default 60, max 200. |
| GET | `/api/generations/:id` | — | `Generation` | |
| DELETE | `/api/generations/:id` | — | `{ ok: true }` | Deletes the DB row, its output file, and any uploaded inputs (`/media/up_*` in `inputs.referenceImages/firstFrame/lastFrame`) that **no other generation still references**. Publishes `generation-deleted`. |
| POST | `/api/generations/:id/retry` | — | `GenerateResponse` | Re-submits with the same prompt/params/inputs (new id). If the original was `failed`, it is deleted after a **successful** re-submit and a `generation-deleted` event is published. `409 {error:"Generation is still running"}` while the record is `pending` / `running`. `400` when the catalog moved on since the record was made; the message names the saved value, e.g. `Saved resolution 4K is no longer supported by Seedance 2.5 (allowed: 480p, 720p). Generate a new one with the current options.` or `Seedance 9 (bytedance/seedance-9) is no longer available. Generate a new one with a current model.`; the record is left untouched. |
| POST | `/api/upload` | `multipart/form-data` field `file` **or** JSON `{ dataUrl }` | `UploadResponse` | Accepts png/jpg/webp ≤ 25 MB. Stores under `DATA_DIR/media/uploads/`. Returns dimensions. A malformed data URL (bad base64 / percent-encoding) → 400. |
| GET | `/media/:file` | — | file | `Cache-Control: public, max-age=31536000, immutable`. Correct `Content-Type`. Supports `Range` for video. Path-traversal safe. |
| GET | `/api/events` | — | `text/event-stream` | Emits `ServerEvent` JSON as `data:` lines: `hello` first, `generation` on every status change, `generation-deleted` on DELETE / retry-replace. Heartbeat comment every 15s. |

In production (`pnpm start`) the server also serves `dist/client` with SPA fallback to `index.html` for non-`/api`, non-`/media` routes.

## OpenRouter integration rules (verified; do not "simplify" these)

Headers on every call: `Authorization: Bearer <key>`, `Content-Type: application/json`,
`HTTP-Referer: $APP_URL`, `X-Title: $APP_NAME`.

### Images
- `endpoint: "chat"` models → `POST /api/v1/chat/completions` with
  `{ model, messages:[{role:"user", content}], modalities:["image","text"], image_config:{ aspect_ratio, image_size? } }`.
  - `content` is a string for text-to-image, or an array `[ {type:"text",text}, {type:"image_url", image_url:{url:dataUrl}}… ]` for image-to-image / references.
  - Omit `image_config.aspect_ratio` when the user picked `auto`. Only send `image_size` when the catalog says `supportsImageSize`.
  - Result: `choices[0].message.images[0].image_url.url` is a `data:image/...;base64,...` URL. Models may return >1 image; take `[0]`.
  - Actual cost: `usage.cost` if present.
- `endpoint: "images"` models (Krea, `openai/gpt-image-2`) → `POST /api/v1/images/generations` with
  `{ model, prompt, size?, image?: [dataUrl], input_fidelity?: "high" }` → `data[0].b64_json`.
  - For gpt-image-2 edits always send `input_fidelity: "high"`.
- Batches: run `count` requests concurrently (`Promise.allSettled`); each is its own `Generation`.
- Detect the real image format from magic bytes (PNG `89 50 4E 47`, JPEG `FF D8`, WebP `RIFF….WEBP`) and read width/height from the header (PNG bytes 16–24, JPEG SOF, WebP VP8/VP8L/VP8X); no native deps.

### Videos
- `POST /api/v1/videos` with `{ model, prompt, duration, aspect_ratio?, resolution?, frame_images?, input_references?, generate_audio? }`.
  - `duration` is **snapped** to the nearest value the catalog allows for the model (`snapDuration` in `src/shared/models.ts`) before it is sent; the value actually used is what gets stored with the generation.
  - **Submit returns HTTP 202** (accept 200 and 202). Body: `{ id, polling_url, status:"pending" }`.
  - `generate_audio: boolean` toggles the native audio track (OpenRouter defaults to on for audio-capable models). Send it **only** when the catalog says `caps.audio` **and** the request set `audio` explicitly; never send it to silent models.
  - Image-to-video MUST use `frame_images: [{ type:"image_url", image_url:{ url:dataUrl }, frame_type:"first_frame"|"last_frame" }]`. A top-level `image` field is silently ignored.
  - `input_references: [{ type:"image_url", image_url:{url} }]` for style/character refs without locking a frame. Never sent to models with `caps.references: false` (the request is rejected first).
  - If the model has `omitAspectRatioOnI2v` and any `frame_images` are present, **do not send `aspect_ratio`** (Seedance returns 400 otherwise).
  - Only send `resolution` if the model lists it; some models accept only one value (Hailuo 3 → `2K`).
  - Read uploaded `/media/...` inputs from disk and convert to data URLs before sending.
- Poll `polling_url` (absolute; if relative, resolve against `https://openrouter.ai`) every **6s** per pending job. Response: `{ status: "pending"|"in_progress"|"processing"|"completed"|"failed", unsigned_urls?: string[], urls?: string[], usage?: { cost }, error?|message? }`.
  - On `completed`: download `unsigned_urls[0] ?? urls[0]` **with the Bearer header** (raw fetch returns 401). The body is **streamed** to `DATA_DIR/media/.gen_<id>.<pid>.part` (`stream/promises.pipeline` → `createWriteStream`; never `arrayBuffer()`, a 4K clip must not sit in RAM), then renamed to `gen_<id>.mp4`. Width / height / duration come from the `moov` box read from the file with bounded reads (`parseMp4MetaFromFile`). Set `output`, `costUsd = usage.cost`, `elapsedMs`, `completedAt`.
  - On `failed`: store the provider's error text verbatim.
  - Moderation is async: a 202 can still fail minutes later; never mark completed before the poll says so.
- On server boot, first delete temp files a previous process left behind (`.gen_<id>.<pid>.part` downloads and `<file>.<pid>.tmp` atomic writes under `media/` and `media/uploads/`, only when older than 5 s), then resume polling for every generation still `pending`/`running` that has a polling url. Jobs older than 45 min with no completion → `failed` ("Timed out waiting for provider").

### Credits
- `GET /api/v1/credits` → `{ data: { total_credits, total_usage } }`.
- `GET /api/v1/key` → `{ data: { label, limit, usage, is_free_tier } }`.

### Live model availability
`live.available` on `GET /api/models` is the **union** of three lists (cached 10 min):
- `GET /api/v1/models?output_modalities=image` → chat-endpoint image models (and, today, the images-endpoint ones too).
- `GET /api/v1/images/models` → everything served by `/images/generations` (Krea 2 ×3, `openai/gpt-image-2`). These are **not** in the unfiltered `GET /api/v1/models`, which is why the old "filter `/models` by `output_modalities`" approach marked them unavailable.
- `GET /api/v1/models?output_modalities=video` → video slugs. For this list `id`, `name`, `description` and `architecture.input_modalities` are kept (missing fields tolerated) so `src/server/catalog.ts` can synthesize a discovered model for every slug that is not in `VIDEO_MODELS`.

All three are `{ data: [{ id, … }] }`. If any of the three fails, keep the previous snapshot (or omit `live`), since a partial union would wrongly mark models unavailable, and do not ask again for 60 s (`LIVE_RETRY_MS`), otherwise every page load re-issues all three requests. Without a configured key nothing is fetched at all. Failure to fetch must not break `/api/models`.
