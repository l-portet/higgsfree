# APIMart integration

APIMart is a fourth provider: with an APIMart key, the models it serves can run there. It is often the
cheapest (Veo 3.1 at $1.00 an 8 s clip, Seedance, Wan, Kling 3.0, PixVerse, Gemini Omni Flash, and images
like Nano Banana Pro at $0.03), so with a key a video goes there whenever that is so (see
[Which provider runs a model](FAL.md#which-provider-runs-a-model)). Everything below was read from APIMart's
docs (`docs.apimart.ai`, every page as `.md`) and probed without a key in Chrome, Firefox and WebKit on
20 Oct 2026. No run has been verified end to end with a real key yet.

## Hosts and auth

- `Authorization: Bearer <APIMart key>` (`sk-…`), sent only to `api.apimart.ai` (`assertApimartOrigin`).
- `POST https://api.apimart.ai/v1/videos/generations` and `/v1/images/generations` with `{ model, prompt, … }`
  → `{ data: [{ task_id }] }`. Every image and video is a task.
- `GET https://api.apimart.ai/v1/tasks/<id>` is polled; the record stores that url as its polling url.
- `GET https://api.apimart.ai/v1/balance` returns the key's `remain_balance` in USD (−1: unlimited): the key
  test (Settings shows it).
- `POST https://api.apimart.ai/v1/uploads/images` (multipart `file`, JPEG / PNG / WebP / GIF, up to 20 MB)
  returns a public `url` on `upload.apimart.ai`, kept 72 h. There is no upload for videos.
- Results come from `upload.apimart.ai`, fetched without the key.
- Every endpoint answers `access-control-allow-origin: *` with `access-control-allow-headers: *` (the
  `Authorization` header passes through that wildcard in every engine today, which the Fetch spec does not
  require; a browser that starts enforcing it would block APIMart). The production CSP allows
  `api.apimart.ai` and `upload.apimart.ai`.
- APIMart's own price catalog (`/api/pricing/models/all`) sends no CORS header, so the prices are bundled.

## Errors

HTTP statuses with `{ error: { message, type } }`; `apimart.ts` keeps the message. 401 → "APIMart rejected the
API key" ("Invalid APIMart key" in the key test), 402 (and PixVerse's 403 `quota_not_enough`) → 402 "Not enough
APIMart balance: …", 422 → 400, the rest as they come. A failed task is HTTP 200 with `status: "failed"` and
`error.message`, shown verbatim; APIMart refunds it.

## Jobs

kie.ai and APIMart share one shape in the engine (`task-providers.ts`): inputs uploaded first, a submit that
returns a task id, the task url polled until the result urls are there.

- Frames and reference images are uploaded at submit (`/v1/uploads/images`), then the task is submitted. The
  payload is built once before anything exists with placeholder urls, so a request APIMart cannot take is a
  400 before a record is created. A video to edit cannot go to APIMart (no video upload).
- Poll every 6 s (videos, under the job's lock and resumable) or inline (images). `pending`, `submitted`,
  `processing`, `in_progress` keep polling; `completed` reads `result.videos[0].url[0]` (or `images`: each
  `url` is an array); `failed` / `cancelled` end the job. An unknown status keeps polling.
- **The cost is recorded**: the task's `cost` (USD) becomes the record's `costUsd`.
- Results expire (24–72 h, `expires_at`); the app downloads them at once.

## Video fields (`buildApimartVideoPayload`)

| Family | Models (catalog → APIMart) | Fields | Refuses |
|---|---|---|---|
| `veo` | Veo 3.1, Fast, Lite → `veo3.1-quality`, `veo3.1-fast`, `veo3.1-lite` | `duration: 8`, `aspect_ratio`, `resolution` 720p / 1080p / `4k`, frames as `image_urls` [first, last] with `generation_type: "frame"` | other durations, sound off (always on), frames on Lite |
| `seedance` | Seedance 2.5, 2.0, 2.0 Fast, 2.0 Mini → `seedance-2.5`, `seedance-2.0`, `-fast`, `-mini` | `size` (`adaptive` when no ratio is sent), `resolution` (`4k`), `duration`, `generate_audio`, `image_with_roles` (`first_frame`, `last_frame`, `reference_image`) | frames and references together |
| `seedance15` | Seedance 1.5 Pro → `seedance-1-5-pro` | `aspect_ratio`, `resolution`, `duration` 4–12, `audio`, `image_urls` [first, last] | references |
| `minimax-h3` | MiniMax H3, H3 Max → `MiniMax-H3`, `MiniMax-H3-Max` | `resolution` `2K` / `768P` / `480P` / `1080P`, `duration`, `aspect_ratio` (text-to-video), `first_frame_image`, `last_frame_image` | sound off on H3, an empty prompt |
| `hailuo23` | Hailuo 2.3 → `MiniMax-Hailuo-2.3` | `resolution` 768p / 1080p, `duration` 6 / 10, `first_frame_image` | 10 s at 1080p |
| `wan3` | Wan 3.0, Prime → `wan3.0-video`, `wan3.0-video-prime` | `resolution` `480P`–`1080P`, `size` (`adaptive`), `duration` 2–30, `audio`, `image_with_roles` | frames and references together |
| `wan27` | Wan 2.7 → `wan2.7` | `image_urls` [first, last], `resolution` `720P` / `1080P`, `duration`, `size` (text-to-video) | |
| `wan26` | Wan 2.6 → `wan2.6` | `image_urls` [first], `aspect_ratio` (text-to-video), `resolution`, `duration` 5 / 10 / 15, `audio` | a last frame |
| `kling` | Kling 3.0 Pro / Standard → `kling-v3` (`mode` `pro` / `std`), Kling O1 → `kling-video-o1` (`std`) | `mode`, `duration`, `aspect_ratio`, `audio` (v3), `image_urls` [first, last] (v3) or `image_with_roles` (O1) | references |
| `kling4` | Kling 4.0 → `kling-v4` | `duration` 3–30, `resolution` 720p / 1080p, `aspect_ratio` (not with frames), `image_urls` [first, last], references as `image_with_roles` (`reference_image`); no `mode` and no sound field (always on; `audio: false` is a 400) | an empty prompt without frames, frames and references together |
| `pixverse` | PixVerse 6 → `pixverse-v6` | `resolution`, `duration`, `audio`, `size` (text-to-video), `image_urls` [first] or `first_frame_image` + `last_frame_image` (5 or 8 s) | |
| `pixverse-max` | PixVerse 6 Max → `pixverse-v6-max` | `resolution`, `duration` 1–15, `audio`, `aspect_ratio` (text-to-video; not `size`), `image_urls` [first]; the prompt is optional with a frame | a last frame, an empty prompt without a frame |
| `gemini-omni` | Gemini Omni Flash 1.1 → `gemini-omni-1.1-flash-ext` | `duration` 4 / 6 / 8 / 10, `resolution` (`4k`), `aspect_ratio`, `generation_type: "frame"` + `image_urls` [first] | a last frame, other durations |
| `gemini-omni12` | Gemini Omni Flash 1.2 → `gemini-omni-1.2-flash` | no `duration` (the prompt sets the length, about 3–10 s), `resolution` (`4k`), `aspect_ratio` (with frames too), `first_frame_image`, `last_frame_image`, references as `image_urls`; no `metadata.task` (APIMart picks the task) | an empty prompt, frames and references together |
| `flux3` | FLUX.3 Video → `flux-3-video` | `duration` 5–20, `resolution` `hd` / `fhd`, `aspect_ratio` (`auto`), `image_urls` [first], `audio` | a last frame |
| `vidu` | Vidu Q4 → `viduq4-preview` | `first_frame_image`, `duration` 3–16, `resolution` (`2K`, `4K`), `audio` | no first frame |

Most families need a prompt. Every family refuses a last frame without a first one, and style references
unless it takes them (Seedance, Wan 3.0, Kling 4.0, Gemini Omni Flash 1.2). Reference videos and audio are
refused too: APIMart's models take them as public urls (`video_urls`, `audio_urls`), but it only uploads images
(`/v1/uploads/videos` and `/audios` are 404s, Oct 2026), so they run on kie.ai (docs/KIE.md).

## Image fields (`buildApimartImagePayload`)

All send `n: 1` and reference images as `image_urls` (uploaded urls; the model pages say strings, though the
upload page's example shows `{ url }` objects).

| Family | Models | Fields |
|---|---|---|
| `gemini` | Nano Banana Pro, 2, 2 Lite, Nano Banana → `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-lite-image-ext`, `gemini-2.5-flash-image-preview` | `size` (the ratio, `auto` allowed), `resolution` 1K / 2K / 4K, up to 14 references |
| `gpt-image-2` | GPT Image 2, 2.6, 2.6 Flare → `gpt-image-2`, `gpt-image-2.6`, `gpt-image-2.6-flare` | `size`, `resolution` `1k` / `2k` / `4k`, up to 15 references (2.6 and 2.6 Flare take 16; the app sends 8 at most) |
| `flux-kontext` | FLUX.1 Kontext Pro → `flux-kontext-pro` | `size`, `output_format: "png"`, up to 4 references |
| `z-image` | Z-Image Turbo → `z-image-turbo` | `size` (`auto` becomes 1:1), `resolution: "1K"`, `prompt_extend: false` (it doubles the price) |

GPT Image 2.6 (`gpt-image-2.6`) runs on APIMart only. Its model page (read 30 Oct 2026) lists GPT Image 2's
fields, with ratios `auto`, 1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4, 4:5, 5:4 (no 21:9, which its catalog entry
leaves out) and text to image and edits in one model, so it shares the `gpt-image-2` builder. `quality`
(`auto` by default), `output_format` and `background` are not sent: APIMart's defaults apply. Neither
APIMart's price catalog nor the model page priced it on 30 Oct 2026: it has no estimate rather than a guessed
one, and the price test lists it as unpriced.

GPT Image 2.6 Flare (`gpt-image-2.6-flare`) is also on OpenRouter and fal. APIMart's GPT-Image-2.6 page (read
5 Nov 2026) names it, beside Sunburst (not listed), with the same fields: `size` (the ratio, 21:9 included,
`auto` by default), `resolution`, up to 16 `image_urls`, so it shares the `gpt-image-2` builder. `quality`
(`auto` by default), `complexity`, `output_format` and `background` are not sent. The page is marked an
integration preview ("not yet live"), so a run may be refused until it opens. APIMart's price catalog bills
it per million tokens with no per-image price: no estimate, and the price test lists it as unpriced.

## Cost estimates

`APIMART_PRICES` (`src/shared/apimart-prices.ts`) has APIMart's price in USD for every model a route sends to,
from its public catalog on 20 Oct 2026 (Kling 4.0 on 22 Oct, PixVerse 6 Max on 26 Oct); a test checks every route is priced and every price is used. They are
the **Gold tier**, the "current price" APIMart shows (80% of its list price): a Platinum or Diamond account
pays 5–10% less. A price is per second (one rate or per resolution, a higher one with sound for Kling 3.0 and
PixVerse), per clip (Veo, 8 s; Gemini Omni Flash 1.1 by length), or per image (by size). The shared estimator
(`list-pricing.ts`) prices the payload the run would send.

The exceptions are Gemini Omni Flash 1.2 (`gemini-omni-1.2-flash`) and GPT Image 2.6 (`gpt-image-2.6`), which
neither the catalog nor their model pages priced on 30 Oct 2026, and GPT Image 2.6 Flare (`gpt-image-2.6-flare`),
which the catalog bills in tokens only (5 Nov 2026): they have no estimate rather than a guessed one, and the
test lists them as unpriced.

## Known gaps

- **Not verified end to end.** The shapes come from APIMart's docs and its answers to keyless probes; the docs
  disagree with themselves in places (the `image_urls` item shape, result lifetimes). APIMart's message is
  shown verbatim on the card.
- **The account tier is not known.** Estimates use Gold prices; the recorded cost is what was charged.
- **No video inputs.** Video editing and motion control never go to APIMart.
- **Gemini Omni Flash 1.2 has no length or price to show.** The prompt sets the clip's length (the 8 s in the
  composer is a placeholder), and APIMart lists no price for it yet; the recorded cost is still right.
- **Veo is 8 s only** on the models used here (APIMart's per-second "official" Veo channels are not wired).
- **Real faces on Seedance** need APIMart's asset library, which the app does not use; such a run may be refused.
- **GPT Image 2.6 and 2.6 Flare have no price to show.** APIMart lists none for 2.6 and bills Flare in tokens; the
  recorded cost is still right.
