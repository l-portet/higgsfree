# ByteDance integration

ByteDance is a sixth provider: its own model platform outside China, **BytePlus ModelArk**
([ai.byteplus.com/ark](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/model-list)), region `ap-southeast-1`
(Volcengine Ark is the China-only twin and is not used; `eu-west-1` has none of the video models). With a ByteDance
key, Seedance 2.5, 2.0, 2.0 Fast and 2.0 Mini can run there, and a run goes there whenever it is the cheapest (see
[Which provider runs a model](FAL.md#which-provider-runs-a-model)). Everything below was read from ModelArk's docs
(append `.md` to any docs url) and probed without a key, from curl and from Chrome, on 11 Nov 2026. **No run has been
verified end to end with a real key, and the probes say a browser may not get the video back** (see CORS below).

## Hosts and auth

- `Authorization: Bearer <ModelArk API key>`, sent only to `ark.ap-southeast.bytepluses.com` (`assertBytedanceOrigin`).
  Keys are made at [API keys](https://ai.byteplus.com/ark/region:ap-southeast-1/apikey); each model must also be
  activated for the account at [Activation](https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement). Seedance
  2.x is activated only with a balance over $30, a $30 savings plan or a Seedance resource pack.
- `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` `{ model, content, … }` → `{ id }`.
- `GET …/contents/generations/tasks/<id>` is polled (`queued`, `running`, then `succeeded`, `failed`, `expired` or
  `cancelled`); the record stores that url as its polling url. A finished task has `content.video_url` (24 hours,
  and a Seedance 2.5 link takes 100 downloads), `usage.completion_tokens`, `model` and `resolution`.
- `GET …/contents/generations/tasks?page_size=1` lists the key's tasks: the key test (free). An API key can read no
  balance on ModelArk (billing APIs need signed AK/SK requests), so the key button lists ByteDance as "In its console".
- Results are on ModelArk's TOS storage, `ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com` in
  every docs example, read without the key. The production CSP allows `ark.ap-southeast.bytepluses.com` and
  `*.tos-ap-southeast-1.volces.com` in `connect-src`; nothing else is needed (videos play from `blob:` urls).

### CORS (probed 11 Nov 2026)

- **Video tasks:** the preflights of `POST` and `GET …/contents/generations/tasks[/<id>]` answer 200 with the
  origin echoed, credentials, and `authorization, content-type` allowed. But the **error answers carry no
  `Access-Control-Allow-Origin`**: a 401 to any of them reached Chrome as "No 'Access-Control-Allow-Origin' header",
  a failed fetch with no status or message. So every ModelArk error (bad key, model not activated, invalid parameter,
  rate limit) reads in the browser as "ByteDance request failed: check the key, and that the model is activated in
  the BytePlus console". Whether *successful* answers carry the header could not be checked without a key.
- **Images:** `POST /api/v3/images/generations` cannot be called from a browser with a key: its preflight answers 204
  with `Access-Control-Allow-Headers: Origin,Content-Length,Content-Type`, and Chrome blocks the request ("Request
  header field authorization is not allowed by Access-Control-Allow-Headers in preflight response"). That is why no
  image model has a ByteDance route.
- **Result files:** the bucket answers a preflight with 403 `CORSResponse: CORS is not enabled for this bucket`, and
  its `GET` answers have no `Access-Control-Allow-Origin`. The app reads a finished video with `fetch()` to store it
  in the library, so **the download will likely be blocked**, unless real results come from another host than the
  docs show. A blocked download ends the run at once (`BytedanceDownloadBlockedError`, not retried, since each try
  would spend one of the link's downloads) with the video's link in the error, to open in a tab within 24 hours, and
  the cost ModelArk reported.

## Errors

HTTP statuses with `{ error: { code, message, type } }`, readable only where CORS allows (see above); `bytedance.ts`
says what to do for the codes that need the user:

| ModelArk | Message |
| --- | --- |
| 401 `AuthenticationError` | "ByteDance rejected the API key" ("Invalid ByteDance key" in the key test) |
| 404 `ModelNotOpen`, 403 `OperationDenied.ServiceNotOpen`, 404 `InvalidEndpointOrModel.NotFound` | "This model is not activated on the BytePlus account. Activate it at …/openManagement" |
| 403 `AccountOverdueError` | "The BytePlus account is overdue. Top it up in the BytePlus console." |
| `Input{Image,Video}SensitiveContentDetected.PrivacyInformation` | "ByteDance refused an input: it may show a real person, and Seedance 2.x takes no real faces." |
| anything else | ModelArk's message |
| no readable answer (a CORS-blocked error, or offline) | "ByteDance request failed: check the key, and that the model is activated in the BytePlus console" |

A failed task is HTTP 200 with `status: "failed"` and the same `error` object (Seedance 2.5 reports some parameter
problems only once the task runs: `InvalidParameter.TaskTypeConstraint`). `expired` and `cancelled` end the run too.
ModelArk charges only for videos it generates, so a run whose download is blocked is still billed.

## Requests (`bytedance-payloads.ts`)

`{ model, content, resolution, ratio, duration, generate_audio, watermark: false }`:

- `content`: `{ type: "text", text }` when there is a prompt, then the images as `{ type: "image_url", image_url:
  { url }, role }` with `role` `first_frame` / `last_frame`, or `reference_image` (style references: up to 30 on
  Seedance 2.5, 9 on the 2.0 series). Frames and references do not mix, and a last frame needs a first one.
- Images go **inline** as `data:image/<format>;base64,…` (format in lower case). ModelArk takes 300 to 6000 px a
  side, width over height from 0.4 to 2.5, under 30 MB each and 64 MB for the whole request; `inlineImage` checks
  those before sending, since the browser cannot read ModelArk's refusal.
- `resolution`: `480p`, `720p`, `1080p` (2.5 and 2.0), `4k` (2.0 only; the app's `4K`).
- `ratio` (`16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `21:9`) with a prompt or references; never with a frame (the
  frame sets the shape, `adaptive`, which is all Seedance 2.5 takes then). `9:21`, `3:2` and `2:3` are refused.
- `duration`: whole seconds, 4–30 on Seedance 2.5, 4–15 on the 2.0 series.
- `generate_audio`: the Sound switch (on by default). `watermark: false` always (videos default to none, but images
  would get one).

Refused with a 400 (the run goes to another provider): **videos** (to edit, or as references), because ModelArk takes
a video by public link or asset id only, never inline, and the browser has no public link to give; **reference
audio**, which the app sends to kie.ai only (ModelArk would take WAV or MP3 inline: a possible follow-up). Never sent:
`seed`, `draft`, `return_last_frame`, `service_tier` (`flex` is not offered on Seedance 2.x), `priority`,
`omni_reference_task_type`, `callback_url`.

## Prices (`src/shared/bytedance-prices.ts`, `bytedance-pricing.ts`)

ModelArk bills tokens: (input video seconds + output seconds) × width × height × 24 / 1024, at a USD rate per
million tokens. The width and height are the ones its API reference lists for the resolution and ratio
(`BYTEDANCE_FRAMES`: 2.5 renders 480p 16:9 at 854 × 480, the 2.0 series at 864 × 496); a frame leaves the shape
to the image, so it is priced at 16:9. These reproduce ModelArk's price examples to the cent. Each run records
`usage.completion_tokens` × the rate.

| Model (id) | 480p / 720p | 1080p | 4K | With a video input (not sent from here) |
| --- | --- | --- | --- | --- |
| Seedance 2.5 (`dreamina-seedance-2-5-260628`) | $10.70 | $11.70 | – | $6.40 / $7.00 |
| Seedance 2.0 (`dreamina-seedance-2-0-260128`) | $7.00 | $7.70 | $4.00 | $4.30 / $4.70 / $2.40 |
| Seedance 2.0 Fast (`dreamina-seedance-2-0-fast-260128`) | $5.60 | – | – | $3.30 |
| Seedance 2.0 Mini (`dreamina-seedance-2-0-mini-260615`) | $3.50 | – | – | $2.10 |

With a video input, a minimum token count also applies (in ModelArk's Lark tables); the app never sends one.

What 5 s at 16:9 costs on each provider today (USD; the app's estimates):

| Model | | ByteDance | OpenRouter | fal | kie.ai | APIMart | Revana |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Seedance 2.5 | 480p | 0.514 | 0.514 | 1.323 | 0.700 | 0.480 | **0.450** |
| | 720p | 1.156 | 1.155 | 2.838 | 1.575 | 1.080 | **1.050** |
| Seedance 2.0 | 480p | 0.352 | 0.337 ¹ | – | 0.475 | **0.330** | 0.400 |
| | 720p | 0.756 | 0.756 | – | 1.025 | **0.710** | 0.750 |
| | 1080p | 1.871 | 1.871 | – | 2.550 | **1.772** | 2.000 |
| | 4K | 3.888 | 3.888 | – | 5.200 | **3.610** | 4.150 |
| Seedance 2.0 Fast | 480p | 0.281 | 0.202 | – | 0.292 | **0.199** | 0.250 |
| | 720p | 0.605 | 0.454 | – | 0.620 | **0.428** | 0.550 |
| Seedance 2.0 Mini | 480p | 0.176 | 0.168 ¹ | – | 0.095 | **0.091** | 0.150 |
| | 720p | 0.378 | 0.378 | – | 0.205 | **0.195** | 0.250 |

¹ OpenRouter charges ModelArk's own per-token rates for Seedance (but $4.20 rather than $5.60 for 2.0 Fast); the
app's OpenRouter estimate prices 480p at 854 × 480 for every Seedance, so it reads low for the 2.0 series.

So ByteDance is never the cheapest when every key is set: it ties OpenRouter (a tie goes to OpenRouter, first in
the order) and APIMart or Revana undercut both. It wins when those keys are missing: Seedance 2.5 and 2.0 against fal
and kie.ai, Seedance 2.0 at 480p, 1080p and 4K against Revana, and style references, which fal does not take.

## Models

Four catalog models have a `bytedance` route (`bytedance: { model }` in `models.ts`): Seedance 2.5, 2.0, 2.0 Fast
and 2.0 Mini, with the ids above. Each keeps the app's options (the live OpenRouter catalog's), and the builder refuses
what ModelArk does not take (1080p on Fast, 9:21). Not routed:

- Seedance 1.5 Pro (`seedance-1-5-pro-251215`): retires on 11 Nov 2026. Seedance 1.0 Pro and Pro Fast: not in the
  catalog.
- Seedream 5.0 Pro, Flash and Lite, 4.5 and 4.0: ModelArk's image API takes no key from a browser (above). OpenRouter
  sells the same models at the same per-image prices ($0.045 / $0.09 Pro, $0.018 Flash, $0.035 Lite, $0.04 4.5).
- Seedream 5.5, SeedVR2 (image and video upscale) and ByteDance Video Upscaler: not on ModelArk.

## Unverified, and how to check with a real key

Needs a BytePlus account with a top-up over $30 (to activate Seedance 2.x), an API key in `ap-southeast-1`, and the
four Seedance models activated. Then, with only the ByteDance key set, run a 5 s Seedance 2.0 Mini text-to-video at
480p (about $0.18) and watch the console:

1. The submit: does the `POST` answer reach the page (a task id), or fail like the errors do? If it fails, ModelArk's
   success answers carry no CORS headers either, and ByteDance cannot run from a browser at all.
2. The poll: same question for `GET …/tasks/<id>`.
3. The download: which host `content.video_url` is on, and whether the browser may read it. If not, the run ends
   with the link (as designed) and the library cannot store ModelArk's videos.
4. The key test in Settings, with a good key and a wrong one.
5. A first frame of a real person, and a model that is not activated, to see what a browser shows.

Also unknown: the exact format of keys made after 17 Sep 2026 (the placeholder says "Your ModelArk API key").
