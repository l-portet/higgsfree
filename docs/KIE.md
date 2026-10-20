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
  uploaded with the base64 endpoint and the video to edit with the stream endpoint, into `higgsfree/` (kie
  deletes uploads after 24 h). Then `createTask`; `data.taskId` is the record's `providerJobId`.
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
| `seedance` | Seedance 2.5, 2.0, 2.0 Fast, 2.0 Mini → `bytedance/seedance-2-5`, `-2`, `-2-fast`, `-2-mini` | `first_frame_url`, `last_frame_url`, `reference_image_urls`, `generate_audio`, `resolution`, `duration`, `aspect_ratio` (`adaptive` when none is sent) | frames and references together, a prompt under 3 characters, 9:21 |
| `minimax-h3` | MiniMax H3 → `minimax-h3/text-to-video` / `image-to-video` | `aspect_ratio` (text-to-video), `first_frame_url`, `last_frame_url`, `resolution` `768P` / `2K`, `duration` 4–15 | sound off, an empty prompt |
| `wan3` | Wan 3.0, Prime → `wan/3-0-video`, `wan/3-0-video-prime` | `first_frame_url`, `last_frame_url`, `reference_image_urls`, `resolution` `480P`–`1080P`, `aspect_ratio` (`adaptive`), `audio`, `duration` 2–30 | frames and references together |
| `wan27` | Wan 2.7 → `wan/2-7-text-to-video` / `image-to-video` | `ratio` (text-to-video), `first_frame_url`, `last_frame_url`, `resolution`, `duration` 2–15 | an empty prompt |
| `grok` | Grok Imagine Video → `grok-imagine/text-to-video` / `image-to-video` | `aspect_ratio`, `mode: "normal"`, `duration` (a string with a frame), `resolution`, `image_urls` [first] | clips under 6 s, 4:3 / 3:4, a last frame |
| `grok15` | Grok Imagine 1.5 → `grok-imagine-video-1-5-preview` | `image_urls` [first], `aspect_ratio` (`auto`), `resolution`, `duration` 1–15 | a last frame; 1080p has no listed price, so it is never picked over a priced provider |
| `gemini-omni` | Gemini Omni Flash 1.1 → `google/gemini-omni-flash-1-1` | `duration` "4" / "6" / "8" / "10", `aspect_ratio`, `resolution` (`4k`), `first_frame_url`, `last_frame_url` | other durations, an empty prompt |
| `pixverse` | PixVerse 6 → `pixverse-v6/text-to-video` / `image-to-video` | `aspect_ratio` (text-to-video), `quality`, `duration`, `generate_audio_switch`, `image_urls` [first] | a prompt under 3 characters, a last frame |
| `vidu` | Vidu Q4 → `vidu-q4/image-to-video` | `image_url`, `duration` 3–16, `resolution` (`2k`, `4k`), `audio` | no first frame, a last frame |
| `wan27-edit` | Wan 2.7 Edit → `wan/2-7-videoedit` | `video_url` (stream upload), `resolution` | |

Every family also refuses style references unless it takes them (Seedance, Wan 3.0), and a last frame without a
first one.

## Image fields (`buildKieImagePayload`)

| Family | Models | Fields |
|---|---|---|
| `nano-banana-2` | Nano Banana Pro → `nano-banana-pro`, Nano Banana 2 → `nano-banana-2` | `aspect_ratio`, `resolution` 1K / 2K / 4K, `image_input` (≤ 8), `output_format: "png"` |
| `nano-banana` | Nano Banana → `google/nano-banana`, `google/nano-banana-edit` with references | `aspect_ratio`, `image_urls` (≤ 10), `output_format: "png"` |
| `nano-banana-lite` | Nano Banana 2 Lite → `nano-banana-2-lite` | `aspect_ratio` (required; `auto` allowed), `image_urls` |
| `gpt-image-2` | GPT Image 2 → `gpt-image-2-text-to-image`, `gpt-image-2-image-to-image` | `aspect_ratio`, `resolution`, `input_urls` (≤ 16) |
| `flux-kontext` | FLUX.1 Kontext Pro → `flux1-kontext`, `model: "flux-kontext-pro"` | `aspect_ratio` (not `auto`, no 3:2 / 2:3), `input_image` (one reference) |
| `z-image` | Z-Image Turbo → `z-image` | `aspect_ratio` (required: `auto` becomes 1:1) |

An image goes to the preferred provider among those with a key that can take the request (`quoteImage`):
with kie preferred, a FLUX.1 Kontext run at 3:2 still goes to fal.

## Cost estimates

`KIE_PRICES` (`src/shared/kie-prices.ts`) has kie's list price in credits ($0.005 each) for every model a
route sends to, read from kie's pricing page (`kie.ai/pricing`, backed by the public
`POST api.kie.ai/client/v1/model-pricing/page`) on 20 Oct 2026; a test checks every route is priced and
every price is used. A price is per second (one rate or per resolution, a higher one with sound for Kling 3.0
and PixVerse), per clip (Veo, whatever its length: not verified for 4 and 6 s; Gemini Omni Flash, by length),
or per image (by size). `estimateKieVideoCost` / `estimateKieImageCost` build the payload the run would send
and price it, so the estimate follows the model id, tier, resolution, duration and sound sent.

## Known gaps

- **Not verified end to end.** The shapes come from kie's docs and its 401 answers; the first real runs may
  find a field kie spells differently. kie's message is shown verbatim on the card.
- **No cancel.** A deleted job may still finish on kie and be charged.
- **Uploads are public.** Inputs sent to kie are public urls for 24 h (see [SECURITY.md](../SECURITY.md)).
- **Veo's price for 4 and 6 s** is assumed to be the 8 s one, since kie lists one price per clip.
