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
  returns a public `url` on `upload.apimart.ai`, kept 72 h. `/v1/uploads/videos` (MP4 / MOV / WebM, 50 MB) and
  `/v1/uploads/audios` exist too (documented, and since Nov 2026 they answer a keyless POST with 401 where an unknown
  upload path answers 404, read 27 Nov 2026), but the app does not use them: it uploads only images here.
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
  400 before a record is created. A video to edit cannot go to APIMart (the app uploads no videos here).
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
| `seedance15` | Seedance 1.5 Pro → `seedance-1-5-pro` (APIMart only) | `aspect_ratio` (16:9 with frames), `resolution`, `duration` 4–12, `audio`, `image_urls` [first, last] | references, an empty prompt |
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
| `gemini-omni12` | Gemini Omni Flash 1.2 → `gemini-omni-1.2-flash` | no `duration` (the prompt sets the length, about 3–10 s), `resolution` (`4k`), `aspect_ratio` (with frames too), `first_frame_image`, `last_frame_image`, references as `image_urls`; no `metadata.task` (APIMart picks the task) | an empty prompt, frames and references together, any length but the catalog's default (8 s, a placeholder) |
| `flux3` | FLUX.3 Video → `flux-3-video` | `duration` 5–20, `resolution` `hd` / `fhd`, `aspect_ratio` (`auto`), `image_urls` [first], `audio` | a last frame |
| `vidu` | Vidu Q4 → `viduq4-preview` | `first_frame_image`, `duration` 3–16, `resolution` (`2K`, `4K`), `audio` | no first frame |
| `magi2` | MAGI-2 → `magi-2` (every mode, picked by the inputs) | `duration` 4–30, `resolution` `1080p` (the only one), `generate_audio`, `aspect_ratio` (not with frames), `first_frame_image`, `last_frame_image`, references as `image_with_roles` (`reference_image`) with `omni_reference_task_type: "reference"` | an empty prompt (with frames too), frames and references together |

Most families need a prompt. Every family refuses a last frame without a first one, and style references
unless it takes them (Seedance, Wan 3.0, Kling 4.0, Gemini Omni Flash 1.2, MAGI-2). Reference videos and audio are
refused too: APIMart's models take them as public urls (`video_urls`, `audio_urls`), but the app uploads only
images here (`/v1/uploads/videos` and `/audios` were 404s in Oct 2026; they answer since Nov 2026 and are not wired
yet), so they run on kie.ai (docs/KIE.md).

MAGI-2 (`magi-2`), Sand AI's model, also runs on kie.ai (see [KIE.md](KIE.md)), which splits it into three models.
APIMart listed it on 27 Nov 2026; its doc page (`docs.apimart.ai/en/api-reference/videos/magi-2/generation.md`, read
that day) has text to video, image to video (a first frame and an optional last one) and reference to video (up to 10
reference images, 5 videos and 5 audio clips) on one model, the mode picked by the inputs. The app sends frames in their
own fields (`first_frame_image`, `last_frame_image`) and no ratio with them (APIMart's image to video follows the first
frame, and takes no 21:9), and reference images as `reference_image` roles with `omni_reference_task_type: "reference"`
(bare `image_urls` would be read as frames) and the ratio; the app sends 4 at most. A prompt (up to 15,000 characters) is
needed in every mode, unlike on kie, so a frame without one runs there. `duration` is 4–30 s (5 by default),
`resolution` only `1080p`, `generate_audio` on by default. Not sent: `seed`, `nsfw_check` (off by default), the
`audio` and `seconds` aliases, and reference videos and audio (`video_urls`, `audio_urls`), which go to kie.

## Image fields (`buildApimartImagePayload`)

All send `n: 1` and reference images as `image_urls` (uploaded urls; the model pages say strings, though the
upload page's example shows `{ url }` objects).

| Family | Models | Fields |
|---|---|---|
| `gemini` | Nano Banana Pro, 2, 2 Lite, Nano Banana → `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-lite-image-ext`, `gemini-2.5-flash-image-preview` | `size` (the ratio, `auto` allowed), `resolution` 1K / 2K / 4K, up to 14 references |
| `gpt-image-2` | GPT Image 2, 2.6, 2.6 Flare, 2.6 Sunburst → `gpt-image-2`, `gpt-image-2.6`, `gpt-image-2.6-flare`, `gpt-image-2.6-sunburst` | `size`, `resolution` `1k` / `2k` / `4k`, up to 15 references (2.6, 2.6 Flare and 2.6 Sunburst take 16; the app sends 8 at most) |
| `flux-kontext` | FLUX.1 Kontext Pro → `flux-kontext-pro` | `size`, `output_format: "png"`, up to 4 references |
| `z-image` | Z-Image Turbo → `z-image-turbo` | `size` (`auto` becomes 1:1), `resolution: "1K"`, `prompt_extend: false` (it doubles the price) |
| `seedream` | Seedream 5.5 → `seedream-5-5` | `size` (the ratio, with `resolution` `1K` / `2K`; for `auto`, the size alone and no `resolution`), up to 10 references (the app sends 8 at most) |
| `minimax-h3-image` | MiniMax H3 Image → `minimax-h3-image` | `size` (the ratio, `auto` allowed), `resolution` `1K` / `2K` / `4K` (always sent: the default is 4K), up to 16 references (the app sends 8 at most) |

GPT Image 2.6 (`gpt-image-2.6`) runs on APIMart only. Its model page (read 30 Oct 2026) lists GPT Image 2's
fields, with ratios `auto`, 1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4, 4:5, 5:4 (no 21:9, which its catalog entry
leaves out) and text to image and edits in one model, so it shares the `gpt-image-2` builder. `quality`
(`auto` by default), `output_format` and `background` are not sent: APIMart's defaults apply. Neither
APIMart's price catalog nor the model page priced it on 30 Oct 2026: it has no estimate rather than a guessed
one, and the price test lists it as unpriced.

GPT Image 2.6 Flare (`gpt-image-2.6-flare`) and Sunburst (`gpt-image-2.6-sunburst`) are also on OpenRouter and
fal. APIMart's GPT-Image-2.6 page (read 5 Nov 2026) names both, with the same fields: `size` (the ratio, 21:9
included, `auto` by default), `resolution`, up to 16 `image_urls`, so they share the `gpt-image-2` builder.
`quality` (`auto` by default), `complexity`, `output_format` and `background` are not sent. APIMart's price
catalog bills them per million tokens with no per-image price: no estimate, and the price test lists them as
unpriced.

Seedream 5.5 (`seedream-5-5`) runs on APIMart, kie.ai (see [KIE.md](KIE.md)), OpenRouter and fal. APIMart now
names it `seedream-5-5` (its model page called it `seedream-5.5` on 5 Nov 2026; on 13 Nov its pricing API answered
`model_not_found` for that name). Its doc page (`docs.apimart.ai/en/api-reference/images/seedream-5-5/generation.md`,
read 13 Nov 2026) has text to image and edits in one model, with up to 10 `image_urls` (public urls or data URIs, 30 MiB
and 36 MP each); `n` takes only 1. `size` is a tier (`1K`, `1.5K` or `2K`; the model picks the ratio), a ratio with
`resolution` (uppercase), or a size in pixels. `size: "auto"` means 2K whatever `resolution` says, so for `auto` the
app sends the tier alone as `size`, without `resolution`. The app lists 1K and 2K: APIMart's 1.5K is not an
`ImageSize` and there is no 3K or 4K. It also leaves out the ratios 2:1 and 1:2 (the app has no such option) and
sizes in pixels. APIMart has no 4:5 nor 5:4, which the model takes on OpenRouter and fal: those are refused here and
run there. Not sent, so APIMart's defaults apply: `output_format` (`png`), `background` (`auto`; `transparent`, with
or without references, needs PNG), `layer_decomposition` (`false`; it splits one reference into a base image and
transparent layers, up to `layer_decomposition_options.max_images`, with `size` only `auto`, 1K, 1.5K or 2K and an
optional prompt), `optimize_prompt_options` (only `standard`, which cannot be turned off), `watermark` (`false`) and
`nsfw_check` (`false`). Results are kept 3 days. Its price is under [Cost estimates](#cost-estimates).

MiniMax H3 Image (`minimax-h3-image`) also runs on OpenRouter, fal and kie.ai (see [KIE.md](KIE.md)). Its doc page
(`docs.apimart.ai/en/api-reference/images/minimax-h3-image/generation.md`, read 13 Nov 2026) has text to image and
edits in one model: `image_urls` (up to 16; JPG, PNG, WebP or HEIC, 64 MB each, sides 128 to 8192 px) switches it to
editing. `size` is `auto` (the model picks the ratio) or any ratio from 1:3 to 3:1, so every one the app has;
`resolution` is `1K`, `2K` or `4K` (about 1, 4.2 and 16 MP) and is always sent, since APIMart's default is 4K, about
three times the price. The prompt takes 1 to 32,000 characters, and `n` up to 10 (the app sends 1). Not sent, so
APIMart's defaults apply: `size` in pixels (which excludes `resolution`), `prompt_optimizer` (on; it can be turned
off on text to image only), `output_format` (`jpeg`), `output_compression` (95), `watermark` (`false`) and
`nsfw_check` (`false`). The catalog bills it per million tokens ($2.14 / $1.43 / $3.57 input text / input image /
output image at Gold, 13 Nov 2026); its per-size figures ($0.024 at 1K or 2K, $0.08 at 4K) are only what APIMart
holds while the task runs (`precharge_hold`). So it has no estimate rather than a guessed one, the price test lists
it as unpriced, and with a kie.ai key the run goes to kie, which has a price. The Highspeed variant
(`minimax-h3-image-highspeed`) is not wired.

## Cost estimates

`APIMART_PRICES` (`src/shared/apimart-prices.ts`) has APIMart's price in USD for every model a route sends to,
from its public catalog on 20 Oct 2026 (Kling 4.0 on 22 Oct, PixVerse 6 Max on 26 Oct, MAGI-2 on 27 Nov); a test checks every route is priced and every price is used. They are
the **Gold tier**, the "current price" APIMart shows (80% of its list price; 65% for Seedream 5.5; the list price
itself for MAGI-2): a Platinum or Diamond account pays 5–10% less. A price is per second (one rate or per resolution, a higher one with sound for
Kling 3.0 and PixVerse), per clip (Veo, 8 s; Gemini Omni Flash 1.1 by length), or per image (by size; Seedream 5.5
also bills each reference image). The shared estimator (`list-pricing.ts`) prices the payload the run would send.

Seedream 5.5 (`seedream-5-5`, read 13 Nov 2026) costs $0.013 an image at 1K (and 1.5K) and $0.02275 at 2K, plus
$0.0052 for each reference image, the first included (`inputImageAmount`). The catalog lists only the image prices;
the reference fee is `input_image_paid_price` in `api.apimart.ai/api/pricing/model?model=seedream-5-5`, the
per-model price the model page's estimate reads. It is the cheapest of Seedream 5.5's four providers, so with an
APIMart key it runs here.

MAGI-2 (`magi-2`, read 27 Nov 2026 from the catalog and `api.apimart.ai/api/pricing/model?model=magi-2`) costs $0.08 a
second at Gold, one rate (the catalog's `default` tier) for its one resolution, 1080p, with or without sound. Its
entry has no `input_material_prices` (Grok Imagine's has a per-image and per-second input fee) and the per-model API no
input fee, so reference images add nothing. kie.ai bills $0.088, so with both keys APIMart runs it, except what only
kie takes (reference videos and audio, a frame without a prompt).

The exceptions are Gemini Omni Flash 1.2 (`gemini-omni-1.2-flash`) and GPT Image 2.6 (`gpt-image-2.6`), which
neither the catalog nor their model pages priced on 30 Oct 2026, and GPT Image 2.6 Flare (`gpt-image-2.6-flare`) and Sunburst (`gpt-image-2.6-sunburst`),
which the catalog bills in tokens only (5 Nov 2026), as it does MiniMax H3 Image (`minimax-h3-image`, 13 Nov 2026):
they have no estimate rather than a guessed one, and the test lists them as unpriced. Seedance 1.5 Pro (`seedance-1-5-pro`), on APIMart only since OpenRouter retired it, keeps
its 20 Oct price: the catalog no longer lists it (12 Nov 2026), though its doc page still does.

## Known gaps

- **Not verified end to end.** The shapes come from APIMart's docs and its answers to keyless probes; the docs
  disagree with themselves in places (the `image_urls` item shape, result lifetimes). APIMart's message is
  shown verbatim on the card.
- **The account tier is not known.** Estimates use Gold prices; the recorded cost is what was charged.
- **No video or audio inputs.** Video editing, motion control and reference videos and audio never go to APIMart,
  though its models take them by url and it has had `/v1/uploads/videos` and `/audios` since Nov 2026 (not wired:
  the engine sends every run with reference videos or audio to kie.ai, and the composer asks for a kie.ai key).
- **Gemini Omni Flash 1.2 has no length or price to show.** The prompt sets the clip's length, so it runs here only
  at the composer's default 8 s, a placeholder; any other length goes to fal or kie.ai. APIMart lists no price for it
  yet, so with a kie.ai key too it goes to kie (which also takes style references), and with a fal key to fal unless
  it has style references; the recorded cost is still right.
- **Veo is 8 s only** on the models used here (APIMart's per-second "official" Veo channels are not wired).
- **Real faces on Seedance** need APIMart's asset library, which the app does not use; such a run may be refused.
- **GPT Image 2.6, 2.6 Flare and 2.6 Sunburst have no price to show.** APIMart lists none for 2.6 and bills Flare
  and Sunburst in tokens; the recorded cost is still right.
- **MiniMax H3 Image has no price to show.** APIMart bills it in tokens, so with a kie.ai key it goes to kie, and
  otherwise to the first of OpenRouter, fal and APIMart with a key (unless picked); the recorded cost is still right.
- **Seedream 5.5 does text to image and edits only.** Transparent backgrounds and layer decomposition are not wired.
