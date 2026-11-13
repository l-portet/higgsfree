# kie.ai integration

kie.ai is a third provider: with a kie key, the models it serves can run there. It is often the cheapest
(Veo 3.1, Kling 3.0, MiniMax H3, Wan, Grok Imagine, Gemini Omni Flash, Nano Banana Pro), so with a key a
video goes there whenever that is so (see [Which provider runs a model](FAL.md#which-provider-runs-a-model)).
Everything below was read from kie's docs (`docs.kie.ai`, every page as `.md`) and probed without a key on
20 Oct 2026. No run has been verified end to end with a real key yet.

## Hosts and auth

- `Authorization: Bearer <kie key>`, sent only to `api.kie.ai` and `kieai.redpandaai.co` (`assertKieOrigin`;
  anything else is refused before the key leaves).
- `POST https://api.kie.ai/api/v1/jobs/createTask { model, input }` creates every image and video task.
- `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=` is polled; the record stores that url as its
  polling url.
- `GET https://api.kie.ai/api/v1/chat/credit` returns the balance in credits: the key test (Settings shows
  it, as credits and dollars).
- `POST https://kieai.redpandaai.co/api/file-base64-upload` (images, as their data URL) and
  `/api/file-stream-upload` (multipart `file` + `uploadPath`, videos) return a public `downloadUrl`.
- Results come from kie's CDN (`tempfile.aiquickdraw.com`, `file.aiquickdraw.com`), fetched without the key.
- All of them allow cross-origin requests (probed: preflights reflect the origin with
  `authorization, content-type`; responses and the CDN send `access-control-allow-origin: *`). The fetches
  use the default credentials mode. A key restricted to an IP whitelist cannot work from a browser.
- The production CSP allows `api.kie.ai`, `kieai.redpandaai.co` and `*.aiquickdraw.com`.

## Errors

kie answers HTTP 200 and puts the outcome in the body: `{ code, msg, data }`. `kie.ts` maps `code`:
401 / 403 → 401 "kie.ai rejected the API key" ("Invalid kie.ai key" in the key test), 402 → 402 "Not enough
kie.ai credits: …", 400 / 404 / 422 → 400 with kie's `msg`, 429 kept, 455 (maintenance) → 503, anything else →
502 with `msg`. A poll that comes back 400 ends the job, like a 400 from the other providers.

## Jobs

- kie.ai and APIMart share one shape in the engine (`task-providers.ts`). Inputs first: kie takes images and videos by url only, so at submit each frame and reference image is
  uploaded with the base64 endpoint and the video to edit, reference videos and reference audio with the stream
  endpoint, into `higgsfree/` (kie deletes uploads after 24 h). Then `createTask`; `data.taskId` is the record's `providerJobId`.
- The payload is built once before anything exists with placeholder urls, so a request kie cannot take is a
  400 before a record is created, and again at submit with the uploaded urls.
- Poll `recordInfo` every 6 s (videos, under the job's lock and resumable like the others) or inline (images,
  within the image timeout). `state`: `waiting`, `queuing`, `generating` keep polling; `success` reads
  `resultJson` (a JSON string): `resultUrls`, else `result_urls`, else Veo's `data.result_urls`; `fail` ends
  with `failMsg` verbatim. An unknown state keeps polling.
- **The cost is recorded**: `creditsConsumed` × $0.005 on the finished task becomes the record's `costUsd`.
- Results live 14 days on kie's CDN; the app downloads them at once, as for every provider.
- No cancel: kie documents none, so deleting a running kie job only stops polling.

## Video fields (`buildKieVideoPayload`)

kie names its fields differently for every model family, so a route (`KieVideoRoute` in the catalog) names the
family, the createTask model ids (a separate image-to-video id where kie splits them) and a tier. A request the
family cannot take throws a 400 whose message is what the price tooltip shows ("Takes clips of 6–30 s").

| Family | Models (catalog → kie) | Fields | Refuses |
|---|---|---|---|
| `veo` | Veo 3.1, Fast, Lite → `veo-3-1`, tier in `model` (`veo3`, `veo3_fast`, `veo3_lite`) | `generation_type` TEXT_2_VIDEO / FIRST_AND_LAST_FRAMES_2_VIDEO, `image_urls` [first, last], `aspect_ratio` (`Auto` with frames), `resolution` 720p / 1080p / `4k`, `duration` | sound off (always on), durations other than 4 / 6 / 8 |
| `kling3` | Kling 3.0 Pro / Standard → `kling-3.0/video`, `mode` `pro` (1080p) / `std` (720p) | `sound`, `duration` as a string, `image_urls` [first, last], `aspect_ratio` (text-to-video), `multi_shots: false` | references |
| `kling4` | Kling 4.0 → `kling-4.0/reference-to-video` (text-to-video, style references), `kling-4.0/keyframe-to-video` (frames) | `duration` 3–30, `resolution` 720p / 1080p, `aspect_ratio` (not with frames), `image_urls` (references), `first_frame_url`, `last_frame_url`; no sound field (always on) | an empty prompt, frames and references together |
| `seedance` | Seedance 2.5, 2.0, 2.0 Fast, 2.0 Mini → `bytedance/seedance-2-5`, `-2`, `-2-fast`, `-2-mini` | `first_frame_url`, `last_frame_url`, `reference_image_urls`, `generate_audio`, `resolution`, `duration`, `aspect_ratio` (`adaptive` when none is sent) | frames and references together, a prompt under 3 characters, 9:21 |
| `minimax-h3` | MiniMax H3 → `minimax-h3/text-to-video` / `image-to-video` | `aspect_ratio` (text-to-video), `first_frame_url`, `last_frame_url`, `resolution` `768P` / `2K`, `duration` 4–15 | sound off, an empty prompt |
| `wan3` | Wan 3.0, Prime → `wan/3-0-video`, `wan/3-0-video-prime` | `first_frame_url`, `last_frame_url`, `reference_image_urls`, `resolution` `480P`–`1080P`, `aspect_ratio` (`adaptive`), `audio`, `duration` 2–30 | frames and references together |
| `wan27` | Wan 2.7 → `wan/2-7-text-to-video` / `image-to-video` | `ratio` (text-to-video), `first_frame_url`, `last_frame_url`, `resolution`, `duration` 2–15 | an empty prompt |
| `grok` | Grok Imagine Video → `grok-imagine/text-to-video` / `image-to-video` | `aspect_ratio`, `mode: "normal"`, `duration` (a string with a frame), `resolution`, `image_urls` [first] | clips under 6 s, 4:3 / 3:4, a last frame |
| `grok15` | Grok Imagine 1.5 → `grok-imagine-video-1-5-preview` | `image_urls` [first], `aspect_ratio` (`auto`), `resolution`, `duration` 1–15 | a last frame; 1080p has no listed price, so it is never picked over a priced provider |
| `gemini-omni` | Gemini Omni Flash 1.1 → `google/gemini-omni-flash-1-1` | `duration` "4" / "6" / "8" / "10", `aspect_ratio`, `resolution` (`4k`), `first_frame_url`, `last_frame_url` | other durations, an empty prompt |
| `gemini-omni12` | Gemini Omni Flash 1.2 → `google/gemini-omni-flash-1-2` | `duration` 3–15 as a number (3–10 with a last frame), `aspect_ratio` (with a frame too), `resolution` (`4k`), `first_frame_url`, `last_frame_url`, `image_urls` (references, ≤ 6) | an empty prompt, frames and references together, over 10 s between two frames |
| `pixverse` | PixVerse 6 → `pixverse-v6/text-to-video` / `image-to-video`, PixVerse 6 Max → `pixverse-v6-max/text-to-video` / `image-to-video` | `aspect_ratio` (text-to-video), `quality`, `duration`, `generate_audio_switch`, `image_urls` [first] | a prompt under 3 characters (6 Max: an empty prompt), a last frame |
| `vidu` | Vidu Q4 → `vidu-q4/image-to-video` | `image_url`, `duration` 3–16, `resolution` (`2k`, `4k`), `audio` | no first frame, a last frame |
| `wan27-edit` | Wan 2.7 Edit → `wan/2-7-videoedit` | `video_url` (stream upload), `resolution` | |

Every family also refuses style references unless it takes them (Seedance, Wan 3.0, Kling 4.0, Gemini Omni Flash 1.2), and a
last frame without a first one.

Gemini Omni Flash 1.2 (read 10 Nov 2026) takes one of four modes per request: text or reference images, a first frame,
a first and a last frame, or a video edit (`video_list`). Unlike 1.1 its `duration` is a number, 3–15 s, and 3–10 s with
a last frame; it has no `audio_ids` or `character_ids`. The ratio goes with a frame too, since kie defaults it to 16:9.
Not sent: `seeds`, `aspect_ratio: "auto"`, 360p (the app has none) and `video_list`, since the model is not a video
editor in the app.

**Reference videos and audio** (`caps.mediaReferences`), never with frames. kie.ai is the only provider that runs them
(fal and OpenRouter refuse them in `video-cost.ts`, APIMart has no upload for them):

| Family | Videos | Audio | Notes |
|---|---|---|---|
| `wan3` | `reference_video_urls`, ≤ 5, 1–15 s each, 15 s in all, MP4 / MOV ≤ 100 MB | `reference_audio_urls`, ≤ 5, 15 s in all, MP3 / WAV ≤ 15 MB | audio alone is fine; reference videos + `duration` ≤ 30 s; billed on output + reference-video seconds at the usual rate |
| `seedance` | `reference_video_urls`, ≤ 3 (2.5: ≤ 10), 2–15 s each, 15 s in all (2.5: 30 s), ≤ 50 MB (2.5: 200 MB) | `reference_audio_urls`, same counts and totals, ≤ 15 MB | audio needs an image or a video with it (not on 2.5); billed on output + reference-video seconds at the lower "with video input" rate |
| `kling4` | `video_urls` on `reference-to-video`, ≤ 5, 2–30 s each | none (kie only takes a voice to copy, `voices[]`) | billed like Seedance, at the "with video input" rate (output + input seconds, assumed from the other providers' docs) |

The prompt can name them: `Image1`, `Video1`, `Audio1` (Wan 3.0), `@Image1`, `@Video1`, `@Audio1` (Seedance),
`@image_1`, `@video_1` (Kling 4.0).

## Image fields (`buildKieImagePayload`)

| Family | Models | Fields |
|---|---|---|
| `nano-banana-2` | Nano Banana Pro → `nano-banana-pro`, Nano Banana 2 → `nano-banana-2` | `aspect_ratio`, `resolution` 1K / 2K / 4K, `image_input` (≤ 8), `output_format: "png"` |
| `nano-banana` | Nano Banana → `google/nano-banana`, `google/nano-banana-edit` with references | `aspect_ratio`, `image_urls` (≤ 10), `output_format: "png"` |
| `nano-banana-lite` | Nano Banana 2 Lite → `nano-banana-2-lite` | `aspect_ratio` (required; `auto` allowed), `image_urls` |
| `gpt-image-2` | GPT Image 2 → `gpt-image-2-text-to-image`, `gpt-image-2-image-to-image`; GPT Image 2.6 Flare → `gpt-image-2-6/flare-text-to-image`, `gpt-image-2-6/flare-image-to-image`; GPT Image 2.6 Sunburst → `gpt-image-2-6/sunburst-text-to-image`, `gpt-image-2-6/sunburst-image-to-image` | `aspect_ratio`, `resolution`, `input_urls` (≤ 16) |
| `gpt-image-economy` | GPT Image 2.6 Economy → `gpt-image-2-6/economy-text-to-image`, `gpt-image-2-6/economy-image-to-image` | `aspect_ratio` (no 3:4), `input_urls` (≤ 16), no `resolution` |
| `seedream` | Seedream 5.5 → `seedream/5-5-text-to-image`, `seedream/5-5-image-to-image` | `aspect_ratio` (`auto` on edits only: 1:1 is sent for it on text to image), `size` 1K / 2K, `image_urls` (≤ 10) |
| `minimax-h3-image` | MiniMax H3 Image → `minimax-h3/text-to-image`, `minimax-h3/image-edit` | `aspect_ratio` (`auto` allowed), `resolution` 1K / 2K / 4K, `image_urls` (≤ 16) |
| `flux-kontext` | FLUX.1 Kontext Pro → `flux1-kontext`, `model: "flux-kontext-pro"` | `aspect_ratio` (not `auto`, no 3:2 / 2:3), `input_image` (one reference) |
| `z-image` | Z-Image Turbo → `z-image` | `aspect_ratio` (required: `auto` becomes 1:1) |

The doc pages of GPT Image 2.6 Flare and Sunburst, two each (read 6 Nov 2026), give them GPT Image 2's fields, with
`aspect_ratio` `auto` by default and 2:1, 1:2, 9:21, 3:1 and 1:3 besides the ones the app has, `resolution` 1K / 2K / 4K
and up to 16 `input_urls` (JPEG, PNG or WebP, 30 MB each). Their sizes follow OpenRouter's catalog, so the app sends 1K
and does not list 2K or 4K, and at most 8 references. `background`, `output_format` and the GIF fields (`frame_count`,
`frame_duration_ms`) are not sent: kie's defaults apply.

GPT Image 2.6 Economy, the cost-efficient variant, is its own family and runs on kie only. Its two doc pages (read
6 Nov 2026) say it generates at 1K only and list no `resolution`, and their schemas allow no field they do not list, so
none is sent. `aspect_ratio` is `auto` by default, or 1:1, 16:9, 9:16, 3:2, 2:3, 21:9 or 4:3, and `input_urls` takes up
to 16 images (JPEG, PNG or WebP, 30 MB each), of which the app sends at most 8. `background`, `output_format` (`png` by
default; `gif` too on text to image) and text to image's GIF fields (`frame_count`, `frame_duration_ms`) are not sent.

Seedream 5.5 runs on kie, OpenRouter, fal and APIMart. Its two doc pages (read 11 Nov 2026) give text to image a required
`aspect_ratio` with no `auto` (1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9), so the app sends 1:1 for `auto` there; image
to image takes `auto` too, as its default. 4:5 and 5:4, which OpenRouter and fal take, are refused here, so they run there. `size` is 1K, 1.5K or 2K (`2K` by default); the app lists 1K and 2K, the
sizes it shares with APIMart. Image to image takes 1 to 10 `image_urls` (JPEG, PNG or WebP, 10 MB each), of which the
app sends at most 8. Both want a prompt of 5 to 5,000 characters; a shorter one is left for kie to refuse, since the
estimate is built without the prompt. `output_format` (`png` by default), `background` (`auto` by default; `transparent`
with PNG) and `nsfw_checker` are not sent, and the layer decomposition model (`seedream/5-5-layer-decomposition`) is not
wired.

MiniMax H3 Image runs on kie, OpenRouter, fal and APIMart. Its two doc pages (read 12 Nov 2026) take `aspect_ratio` (`auto` by
default, or every other ratio the app has) and `resolution` (1K, 2K or 4K, about 1, 4 and 16 MP; `2K` by default) on both
models. `auto` is the prompt rewriter's pick on text to image and the first reference's ratio on an edit. The edit model
takes 1 to 16 `image_urls` (JPG, PNG, WebP, HEIC or BMP, 20 MB and 64 MP each), of which the app sends at most 8. Both want a
prompt of 1 to 5,000 characters. `seed`, `expand_prompt` (on by default), `output_format` (`png` by default) and the
custom `width` / `height` (which exclude `aspect_ratio` and `resolution`) are not sent.

An image goes to the cheapest provider with a key that can take the request (`quoteImage`), or to the one
picked in the composer: picked onto kie, a FLUX.1 Kontext run at 3:2 still goes to fal.

## Cost estimates

`KIE_PRICES` (`src/shared/kie-prices.ts`) has kie's list price in credits ($0.005 each) for every model a
route sends to, read from kie's pricing page (`kie.ai/pricing`, backed by the public
`POST api.kie.ai/client/v1/model-pricing/page`) on 20 Oct 2026 (Kling 4.0 on 22 Oct, PixVerse 6 Max on 26 Oct, GPT Image 2.6 Economy on 6 Nov, Gemini Omni Flash 1.2 on 10 Nov, Seedream 5.5 on 11 Nov, MiniMax H3 Image on 12 Nov); a test checks every route is priced and
every price is used. A price is per second (one rate or per resolution, a higher one with sound for Kling 3.0
and PixVerse), per clip (Veo, whatever its length: not verified for 4 and 6 s; Gemini Omni Flash 1.1, by length),
or per image (by size; Seedream 5.5's and MiniMax H3 Image's edits also bill each reference image). `estimateKieVideoCost` / `estimateKieImageCost` build the payload the run would send
and price it, so the estimate follows the model id, tier, resolution, duration and sound sent.

The exceptions are GPT Image 2.6 Flare and Sunburst (6 Nov 2026), which kie bills per million tokens at the same rates,
with no per-image price: in credits, 900 text input, 225 cached text input, 1,440 image input, 360 cached image input,
5,400 image output. They have no estimate rather than a guessed one, and the test lists them as unpriced. GPT Image 2.6
Economy is not one of them: 5 credits ($0.025) an image, with or without references. Seedream 5.5 costs 3.6 credits
($0.018) an image at 1K (and 1.5K) and 6.3 ($0.0315) at 2K, the same on both models, plus 1.44 ($0.0072) for each
reference image on an edit (`inputImageAmount`), under OpenRouter's ($0.02 / $0.035, + $0.008 a reference) and fal's, so
with a kie.ai key it runs on kie. MiniMax H3 Image costs 1.8 credits ($0.009) at 1K or 2K and 5.5
($0.0275) at 4K, the same on both models, plus 0.5 ($0.0025) for each reference image on an edit. OpenRouter, fal
and APIMart bill it in tokens with no per-image price, so with a kie.ai key it runs on kie.

## Known gaps

- **Not verified end to end.** The shapes come from kie's docs and its 401 answers; the first real runs may
  find a field kie spells differently. kie's message is shown verbatim on the card.
- **No cancel.** A deleted job may still finish on kie and be charged.
- **Uploads are public.** Inputs sent to kie are public urls for 24 h (see [SECURITY.md](../SECURITY.md)).
- **Veo's price for 4 and 6 s** is assumed to be the 8 s one, since kie lists one price per clip.
- **GPT Image 2.6 Flare and Sunburst have no price to show**, since kie bills them in tokens. The recorded cost comes
  from the task's `creditsConsumed`.
