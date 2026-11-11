# ByteDance integration

ByteDance is a sixth provider: its own model platform outside China, **BytePlus ModelArk**
([ai.byteplus.com/ark](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/model-list)), region `ap-southeast-1`
(Volcengine Ark is the China-only twin and is not used; `eu-west-1`, `https://ark.eu-west.bytepluses.com/api/v3`, has
none of the video models). With a ByteDance key, Seedance 2.5, 2.0, 2.0 Fast and 2.0 Mini can run there, and a run
goes there whenever it is the cheapest (see [Which provider runs a model](FAL.md#which-provider-runs-a-model)).
Everything below was read from ModelArk's docs (append `.md` to any docs url) and probed without a key, from curl and
from Chrome, on 11 Nov 2026. **No run has been verified end to end with a real key.**

It is the one provider the browser does not call directly: ModelArk refuses browser calls (see
[Why a server](#why-a-server)), so ByteDance calls go through a stateless pass-through on the app's own server. Every
other provider is still called from the browser only.

## Hosts and auth

- `Authorization: Bearer <ModelArk API key>`. The browser sends it only to the pass-through on its own origin
  (`/api/bytedance/v3/…`, `assertBytedanceOrigin`), which sends it only to `ark.ap-southeast.bytepluses.com`.
  Keys are made at [API keys](https://ai.byteplus.com/ark/region:ap-southeast-1/apikey); each model must also be
  activated for the account at [Activation](https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement). Seedance
  2.x is activated only with a balance over $30, a $30 savings plan or a Seedance resource pack.
- `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` `{ model, content, … }` → `{ id }`.
- `GET …/contents/generations/tasks/<id>` is polled (`queued`, `running`, then `succeeded`, `failed`, `expired` or
  `cancelled`); the record stores the pass-through's path for it as its polling url. Task ids look like
  `cgt-20250730114109-jfd6d`. A finished task has `content.video_url` (24 hours, and a Seedance 2.5 link takes 100
  downloads), `usage.completion_tokens`, `model` and `resolution`.
- `GET …/contents/generations/tasks?page_size=1` lists the key's tasks: the key test (free). An API key can read no
  balance on ModelArk (billing APIs need signed AK/SK requests), so the key button lists ByteDance as "In its console".
- Results are on ModelArk's TOS storage, `ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com` in
  every docs example, read without the key, through the pass-through. The browser itself only talks to its own
  origin for ByteDance, so the production CSP lists no ByteDance host.

## Why a server

Probed from Chrome on 11 Nov 2026, without a key:

- **Errors are unreadable.** The preflights of `POST` and `GET …/contents/generations/tasks[/<id>]` answer 200 with
  the origin echoed and `authorization, content-type` allowed, but the **error answers carry no
  `Access-Control-Allow-Origin`**: a 401 reached Chrome as a failed fetch with no status or message. Every ModelArk
  error (bad key, model not activated, invalid parameter, rate limit, a refused face) would read as nothing.
- **Images:** `POST /api/v3/images/generations` cannot be called from a browser with a key: its preflight answers 204
  with `Access-Control-Allow-Headers: Origin,Content-Length,Content-Type`, and Chrome blocks the request ("Request
  header field authorization is not allowed by Access-Control-Allow-Headers in preflight response").
- **Result files:** the bucket answers a preflight with 403 `CORSResponse: CORS is not enabled for this bucket`, and
  its `GET` answers have no `Access-Control-Allow-Origin`, so the browser cannot read a finished video to store it.

## The pass-through (`src/server/bytedance-proxy.ts`)

One route handler, `src/app/api/bytedance/[...path]/route.ts` (Node runtime, `maxDuration` 300 s), and an allowlist.
It is not an open proxy:

| The browser calls | The server calls |
| --- | --- |
| `POST /api/bytedance/v3/contents/generations/tasks` (JSON, up to 4 MB) | `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` |
| `GET /api/bytedance/v3/contents/generations/tasks?page_size=N` (N 1–100, no other query) | `GET …/contents/generations/tasks?page_size=N` |
| `GET /api/bytedance/v3/contents/generations/tasks/<id>` (`cgt-` + letters, digits, `-`, `_`) | `GET …/contents/generations/tasks/<id>` |
| `POST /api/bytedance/media` `{ "url": "…" }` (JSON) | `GET <url>`, only https on `ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com`, no key |

Anything else is answered by the server itself and never leaves it: another path 404, another method (`HEAD`,
`PUT`, `DELETE`, …) 405, another query or a malformed task id 400, no `Bearer` key 401, a body that is not JSON 415,
one over 4 MB 413 (Vercel refuses request bodies over 4.5 MB; ModelArk itself takes 64 MB). The media route takes no
other host (no wildcard, so no other bucket, no IP, no http, no port, no credentials in the url) and follows at most
3 redirects, each onto that same host; anything else is a 403 `HostNotAllowed` or a 502 `RedirectNotAllowed`.

- **The key** is read from the request's `Authorization` header and used for that one upstream call. It is never
  stored, cached or logged: no module state, no console output, `cache: "no-store"` upstream, `Cache-Control:
  no-store` on every answer, and failures are answered with fixed messages (never the caught error or a header).
  ModelArk never sees the browser's other headers (cookies, IP), only the key and the body.
- **Answers** keep ModelArk's status and body as they are (only `Content-Type` is copied from its headers), so
  `bytedance.ts` reads its real errors. ModelArk unreachable: 502 `UpstreamUnreachable`; no answer in 100 s: 504; a
  redirect from the API is not followed (502).
- **Files** stream through: nothing is buffered or written, and a streamed answer is not held to Vercel's 4.5 MB
  limit, only to the function's 300 s (Hobby's most; Pro can raise `maxDuration`). The answer is typed as the video
  or image it is (anything else becomes `application/octet-stream`) with `nosniff` and `Content-Security-Policy:
  default-src 'none'; sandbox`. A file host error keeps its status (403 for an expired link, 502 for a 5xx).
- **Hosting:** Vercel runs the route as a function with nothing to configure. `pnpm build && pnpm start` and the
  Docker image (Next's standalone server) run it too. A host that only serves files cannot: the client then says
  "This copy of higgsfree has no server to pass ByteDance calls on…" and ByteDance stays unavailable there.

The disclosure shown next to the key field, in Settings › Keys and in the key dialog (`KEY_VIA_SERVER`): "Unlike the
other providers, your ByteDance key is sent to the higgsfree server so it can call ByteDance's API (it blocks direct
browser calls). It is only used to forward your request and is never stored or logged."

## Errors

HTTP statuses with `{ error: { code, message, type } }`, passed on by the server as they are; `bytedance.ts` says
what to do for the codes that need the user:

| ModelArk | Message |
| --- | --- |
| 401 `AuthenticationError` | "ByteDance rejected the API key" ("Invalid ByteDance key" in the key test) |
| 404 `ModelNotOpen`, 403 `OperationDenied.ServiceNotOpen`, 404 `InvalidEndpointOrModel.NotFound` | "This model is not activated on the BytePlus account. Activate it at …/openManagement" |
| 403 `AccountOverdueError` | "The BytePlus account is overdue. Top it up in the BytePlus console." |
| `Input{Image,Video}SensitiveContentDetected.PrivacyInformation` | "ByteDance refused an input: it may show a real person, and Seedance 2.x takes no real faces." |
| anything else | ModelArk's message |
| nothing answered (offline, or the app's server down) | "Could not reach this site's server, which passes ByteDance calls on: check your connection" |
| a 404 / 405 that is not JSON (a host with no server) | "This copy of higgsfree has no server to pass ByteDance calls on (ModelArk refuses calls from a browser), so ByteDance can't run here" |

A failed task is HTTP 200 with `status: "failed"` and the same `error` object (Seedance 2.5 reports some parameter
problems only once the task runs: `InvalidParameter.TaskTypeConstraint`). `expired` and `cancelled` end the run too.
ModelArk charges only for videos it generates. A finished video whose url is not on the allowlisted bucket (or that
redirects off it) is never fetched: the run ends at once (`BytedanceDownloadBlockedError`, not retried, since each try
could spend one of the link's downloads) with the video's link in the error, to open in a tab within 24 hours, and
the cost ModelArk reported. A file host error or an unreachable host is retried like any other provider's.

## Requests (`bytedance-payloads.ts`)

`{ model, content, resolution, ratio, duration, generate_audio, watermark: false }`:

- `content`: `{ type: "text", text }` when there is a prompt, then the images as `{ type: "image_url", image_url:
  { url }, role }` with `role` `first_frame` / `last_frame`, or `reference_image` (style references: up to 30 on
  Seedance 2.5, 9 on the 2.0 series). Frames and references do not mix, and a last frame needs a first one.
- Images go **inline** as `data:image/<format>;base64,…` (format in lower case). ModelArk takes 300 to 6000 px a
  side, width over height from 0.4 to 2.5, under 30 MB each and 64 MB for the whole request; `inlineImage` checks
  those before sending. The pass-through takes a request of up to 4 MB (Vercel's limit), images included, so larger
  images are refused before anything is sent ("Try smaller images").
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
- Seedream 5.0 Pro (`dola-seedream-5-0-pro-260628`), 5.0 Flash (`dola-seedream-5-0-flash-260915`), 5.0 and 5.0 Lite
  (`seedream-5-0-260128`, `seedream-5-0-lite-260128`), 4.5 (`seedream-4-5-251128`) and 4.0 (`seedream-4-0-250828`) are on
  ModelArk (its model list, read 11 Nov 2026), and the pass-through would get around the image API's browser block,
  but none of them is in the curated catalog: they reach the app only as models discovered in OpenRouter's live
  catalog, which carry no routes. OpenRouter sells them at the same per-image prices ($0.045 / $0.09 Pro, $0.018
  Flash, $0.035 Lite, $0.04 4.5). So `POST /images/generations` is not on the pass-through's allowlist either.
- Seedream 5.5 (the catalog's only Seedream), SeedVR2 (image and video upscale) and ByteDance Video Upscaler: not on
  ModelArk.

## Unverified, and how to check with a real key

Needs a BytePlus account with a top-up over $30 (to activate Seedance 2.x), an API key in `ap-southeast-1`, and the
four Seedance models activated. Then, with only the ByteDance key set, run a 5 s Seedance 2.0 Mini text-to-video at
480p (about $0.18) on a deploy with the server (Vercel, `pnpm start` or Docker) and watch the console:

1. The submit and the poll: a task id comes back, and the task reaches `succeeded`.
2. The download: which host `content.video_url` is really on. If it is not
   `ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com`, the run ends with the link and that host
   needs adding to `BYTEDANCE_FILE_HOSTS` (only after checking it is ModelArk's own).
3. The key test in Settings, with a good key and a wrong one (a wrong one was checked keyless: ModelArk's 401
   `AuthenticationError` comes back through the server as it is).
4. A first frame of a real person, and a model that is not activated, to see the messages.
5. A long 4K Seedance 2.0 clip, to see it stream through within the function's 300 s.

Also unknown: the exact format of keys made after 17 Sep 2026 (the placeholder says "Your ModelArk API key").
