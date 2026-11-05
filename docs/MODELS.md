# Models

The model list comes from two places, merged in the browser by
[`src/client/lib/catalog.ts`](../src/client/lib/catalog.ts):

- **OpenRouter's live catalogs**, `GET /api/v1/videos/models` and `GET /api/v1/images/models`
  (public, no key), read at startup and cached 10 minutes. They give each model's options
  (durations, resolutions, aspect ratios, frames, audio, reference images) and the video prices.
- **The curated catalog** in [`src/shared/models.ts`](../src/shared/models.ts): display names,
  featured order, badges, descriptions, the quirks OpenRouter does not publish, the verified
  image routes, and every model's fal route. It is also what the app shows until the live catalog
  arrives, or when it cannot.

The picker, the option chips, request validation and the cost estimate all read the merged list.
The tables below are the curated catalog as OpenRouter listed it on 14 Oct 2026; see
[Live catalog and discovered models](#live-catalog-and-discovered-models) for what changes at
runtime. Models that run on fal, only there or as well, are listed under [fal models](#fal-models).

Curated today: 22 image models (8 of them fal-only, 1 [on APIMart only](#apimart-only-image-models)) and 49 video models, of which 47 are offered
(17 fal-only, 2 [on kie.ai or APIMart only](#kieai-and-apimart-only), 7 of the 47 are
[video editors](#video-editing)) and 2 are hidden.

**Legend**

- `✓` supported · `–` not supported · `?` unknown (video "Real faces": `✗` = known to reject
  recognisable human faces on image-to-video)
- **Verified** `✓` = this exact slug and payload shape has been run end-to-end through the app and
  the option ranges are known to be accepted. `–` = the slug is live on OpenRouter but the ranges
  are best-effort; the UI says so, and if the provider rejects a value its 400 body is shown
  verbatim (it usually lists the supported values).
- Costs are **estimates** (`estCostUsd` / `estCostPerSecUsd`). The real number is `usage.cost`
  from OpenRouter, recorded on every generation. Runs on fal are estimated from fal's own prices
  instead ([fal models](#fal-models)).

## Image models

`chat` = `POST /api/v1/chat/completions` with `modalities: ["image","text"]` and `image_config`;
`images` = `POST /api/v1/images/generations`; `native` = `POST /api/v1/images`, with the options
OpenRouter's image catalog lists. "all 11" aspect ratios = `auto`, 1:1, 3:4, 4:3, 2:3,
3:2, 9:16, 16:9, 5:4, 4:5, 21:9. `*` = the model ignores `image_config.image_size`
(`supportsImageSize: false`); output is whatever the provider's default is, listed as 1K.

| Model | OpenRouter slug | Endpoint | t2i | i2i (max refs) | Sizes | Aspect ratios | Est. cost / image | Verified |
|---|---|---|:-:|:-:|---|---|---|:-:|
| **Nano Banana Pro** <sub>PRO</sub> | `google/gemini-3-pro-image` | `chat` | ✓ | ✓ (6) | 1K / 2K / 4K | all 11 | 1K $0.134 · 2K $0.134 · 4K $0.24 | ✓ |
| **Nano Banana 2** <sub>NEW</sub> | `google/gemini-3.1-flash-image` | `chat` | ✓ | ✓ (6) | 1K / 2K | all 11 | 1K $0.045 · 2K $0.045 | – |
| **Nano Banana 2 Lite** <sub>FAST</sub> | `google/gemini-3.1-flash-lite-image` | `chat` | ✓ | ✓ (4) | 1K * | all 11 | 1K $0.02 | – |
| **Nano Banana** <sub>FAST</sub> | `google/gemini-2.5-flash-image` | `chat` | ✓ | ✓ (4) | 1K * | all 11 | 1K $0.039 | ✓ |
| **GPT-5.4 Image 2** <sub>NEW</sub> | `openai/gpt-5.4-image-2` | `chat` | ✓ | ✓ (4) | 1K / 2K | all 11 | 1K $0.12 · 2K $0.20 | ✓ |
| **GPT-5 Image** | `openai/gpt-5-image` | `chat` | ✓ | ✓ (4) | 1K * | all 11 | 1K $0.10 | – |
| **GPT-5 Image Mini** <sub>FAST</sub> | `openai/gpt-5-image-mini` | `chat` | ✓ | ✓ (4) | 1K * | all 11 | 1K $0.03 | – |
| **GPT Image 2** <sub>PRO</sub> | `openai/gpt-image-2` | `images` | ✓ | ✓ (1) | 1K * | 1:1, 2:3, 3:2 | 1K $0.17 | ✓ |
| **GPT Image 2.6 Flare** <sub>NEW</sub> <sub>FAST</sub> | `openai/gpt-image-2.6-flare` | `native` | ✓ | ✓ (8) | 1K * | auto, 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9 | none ¹ | – |
| **GPT Image 2.6 Sunburst** <sub>NEW</sub> <sub>PRO</sub> | `openai/gpt-image-2.6-sunburst` | `native` | ✓ | ✓ (8) | 1K * | auto, 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9 | none ¹ | – |
| **Krea 2 Large** | `krea/krea-2-large` | `images` | ✓ | – | 1K * | 1:1 | 1K $0.06 | ✓ |
| **Krea 2 Medium** | `krea/krea-2-medium` | `images` | ✓ | – | 1K * | 1:1 | 1K $0.04 | – |
| **Krea 2 Turbo** <sub>FAST</sub> | `krea/krea-2-medium-turbo` | `images` | ✓ | – | 1K * | 1:1 | 1K $0.02 | – |

¹ OpenAI's two GPT Image 2.6 tiers (4 Nov 2026), Flare for speed and Sunburst for detail, on OpenRouter, fal
and APIMart ([models on both](#models-on-both)). They are the curated `native` models: their ratios, sizes and
reference count come from OpenRouter's image catalog once it arrives (the values here are the catalog's on
5 Nov 2026: no `resolution`, 16 references, which the app caps at 8). `quality` (auto to max) and `background`
are left at OpenRouter's defaults. All three providers bill them in tokens and give no per-image price, so
there is no estimate; the cost of each run is recorded.

Every other image model OpenRouter lists (Nano Banana 2.1, Seedream 5, FLUX.3, Qwen Image 3,
GPT Image 2.5, Recraft, MAI Image and more; about 45 on 14 Oct 2026) is offered as a discovered
model through the native `POST /api/v1/images` (`endpoint: "native"`). See
[Live catalog and discovered models](#live-catalog-and-discovered-models).

Not on OpenRouter: the [fal-only image models](#fal-only-image-models), and GPT Image 2.6, which runs on
APIMart only (see [APIMart-only image models](#apimart-only-image-models)); GPT Image 2.6 Flare and Sunburst,
above, are separate models.

Default image model: **Nano Banana Pro** (`google/gemini-3-pro-image`). Each composer starts there, then remembers the last model picked.

## Video models

On OpenRouter, video models go through the async `POST /api/v1/videos` endpoint (HTTP 202 on
submit, then polling). `†` = `omitAspectRatioOnI2v`: the model rejects `aspect_ratio` on image-to-video, so the
app omits it and the output follows the input frame. **Last frame** = accepts a
`frame_type: "last_frame"` anchor. **Audio** = accepts `generate_audio` (a native track you can
turn off). Durations are in seconds; a range means every integer step in it is allowed.

Options and prices are OpenRouter's catalog on 14 Oct 2026; the app uses the live values at
runtime. Costs assume audio on, which is OpenRouter's default. Seedance is priced per video token,
converted at width × height × 24 fps / 1024 tokens a second for a 16:9 frame. The order is the
picker's: featured first, following Higgsfield's lineup where OpenRouter has the model.

| Model | OpenRouter slug | t2v | i2v | Last frame | Audio | Real faces | Resolutions | Durations (s) | Aspect ratios | Est. cost / second | Verified |
|---|---|:-:|:-:|:-:|:-:|:-:|---|---|---|---|:-:|
| **Seedance 2.5** <sub>NEW</sub> | `bytedance/seedance-2.5` | ✓ | ✓ | ✓ | ✓ | ✗ | 480p / 720p (default 720p) | 4–30 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 † | 480p $0.103 · 720p $0.231 | ✓ |
| **Seedance 2.0** <sub>PRO</sub> | `bytedance/seedance-2.0` | ✓ | ✓ | ✓ | ✓ | ✗ | 480p / 720p / 1080p / 4K (default 1080p) | 4–15 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 9:21 † | 480p $0.0673 · 720p $0.151 · 1080p $0.374 · 4K $0.778 | ✓ |
| **Seedance 2.0 Fast** <sub>FAST</sub> | `bytedance/seedance-2.0-fast` | ✓ | ✓ | ✓ | ✓ | ✗ | 480p / 720p (default 720p) | 4–15 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 9:21 † | 480p $0.0404 · 720p $0.0907 | – |
| **Seedance 2.0 Mini** <sub>FAST</sub> | `bytedance/seedance-2.0-mini` | ✓ | ✓ | ✓ | ✓ | ✗ | 480p / 720p (default 720p) | 4–15 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 9:21 † | 480p $0.0336 · 720p $0.0756 | – |
| **MiniMax H3** | `minimax/hailuo-3` | ✓ | ✓ | ✓ | ✓ | ✓ | 2K (default 2K) | 5–15 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 | 2K $0.13 | ✓ |
| **MiniMax H3 Max** | `minimax/hailuo-3-max` | ✓ | ✓ | ✓ | – | ? | 480p / 768p (default 768p) | 5–15 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 | 480p $0.05 · 768p $0.08 | ✓ |
| **Kling 3.0 Pro** <sub>PRO</sub> | `kwaivgi/kling-v3.0-pro` | ✓ | ✓ | ✓ | ✓ | ✓ | 720p (default 720p) | 3–15 (default 5) | 16:9, 1:1, 9:16 | 720p $0.168 | ✓ |
| **FLUX.3 Video** ¹ | `black-forest-labs/flux-3-video` | ✓ | ✓ | ✓ | ✓ | ? | 720p / 1080p (default 1080p) | 5–20 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 | 720p $0.17 · 1080p $0.29 | – |
| **Grok Imagine 1.5 Lite** <sub>NEW</sub> <sub>FAST</sub> | `x-ai/grok-imagine-video-1.5-lite` | ✓ | ✓ | – | – | ? | 480p / 720p / 1080p (default 720p) | 1–15 (default 5) | 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 | 480p $0.02 · 720p $0.03 · 1080p $0.14 | – |
| **Grok Imagine 1.5** | `x-ai/grok-imagine-video-1.5` | ✓ | ✓ | – | – | ? | 480p / 720p / 1080p (default 480p) | 1–15 (default 6) | 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 | 480p $0.08 · 720p $0.14 · 1080p $0.25 | ✓ |
| **Wan 3.0** | `alibaba/wan-3.0` | ✓ | ✓ | – | ✓ | ? | 480p / 720p / 1080p (default 1080p) | 2–30 (default 5) | 16:9, 4:3, 1:1, 3:4, 9:16 | 480p $0.05 · 720p $0.1 · 1080p $0.2 | – |
| **Veo 3.1** <sub>PRO</sub> | `google/veo-3.1` | ✓ | ✓ | ✓ | ✓ | ? | 720p / 1080p / 4K (default 1080p) | 4, 6, 8 (default 8) | 16:9, 9:16 | 720p $0.4 · 1080p $0.4 · 4K $0.6 | ✓ |
| **Veo 3.1 Fast** <sub>FAST</sub> | `google/veo-3.1-fast` | ✓ | ✓ | ✓ | ✓ | ? | 720p / 1080p / 4K (default 1080p) | 4, 6, 8 (default 8) | 16:9, 9:16 | 720p $0.1 · 1080p $0.12 · 4K $0.3 | – |
| **Veo 3.1 Lite** <sub>FAST</sub> | `google/veo-3.1-lite` | ✓ | ✓ | ✓ | ✓ | ? | 720p / 1080p (default 720p) | 4, 6, 8 (default 8) | 16:9, 9:16 | 720p $0.05 · 1080p $0.08 | – |
| **Wan 3.0 Prime** | `alibaba/wan-3.0-prime` | ✓ | ✓ | – | ✓ | ? | 480p / 720p / 1080p (default 1080p) | 2–30 (default 5) | 16:9, 4:3, 1:1, 3:4, 9:16 | 480p $0.068 · 720p $0.14 · 1080p $0.28 | – |
| **Wan 2.7** | `alibaba/wan-2.7` | ✓ | ✓ | ✓ | ✓ | ? | 720p / 1080p (default 1080p) | 2–10 (default 5) | 16:9, 4:3, 1:1, 3:4, 9:16 | 720p $0.1 · 1080p $0.1 | – |
| **Wan 2.6** | `alibaba/wan-2.6` | ✓ | ✓ | – | ✓ | ? | 720p / 1080p (default 1080p) | 5, 10 (default 5) | 16:9, 9:16 | 720p $0.08 · 1080p $0.12 | – |
| **Kling 3.0 Standard** | `kwaivgi/kling-v3.0-std` | ✓ | ✓ | ✓ | ✓ | ✓ | 720p (default 720p) | 3–15 (default 5) | 16:9, 1:1, 9:16 | 720p $0.126 | – |
| **Kling O1** | `kwaivgi/kling-video-o1` | ✓ | ✓ | ✓ | ✓ | ✓ | 720p (default 720p) | 5, 10 (default 5) | 16:9, 1:1, 9:16 | 720p $0.112 | – |
| **MiniMax Hailuo 2.3** | `minimax/hailuo-2.3` | ✓ | ✓ | – | – | ✓ | 1080p (default 1080p) | 6, 10 (default 6) | 16:9 | 1080p $0.0817 | – |
| **HeyGen Video** <sub>NEW</sub> | `heygen/heygen-video-1` | ✓ | ✓ | – | – | ? | 480p / 768p / 2K (default 768p) | 5–15 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 | 480p $0.02 · 768p $0.03 · 2K $0.09 | – |
| **HappyHorse 1.1** | `alibaba/happyhorse-1.1` | ✓ | ✓ | – | – | ? | 720p / 1080p (default 1080p) | 3–15 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 9:21 | 720p $0.0988 · 1080p $0.128 | – |
| **HappyHorse 1.0** | `alibaba/happyhorse-1.0` | ✓ | ✓ | – | – | ? | 720p / 1080p (default 1080p) | 3–15 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 9:21 | 720p $0.0988 · 1080p $0.169 | – |
| **Grok Imagine Video** <sub>FAST</sub> | `x-ai/grok-imagine-video` | ✓ | ✓ | – | – | ? | 480p / 720p (default 480p) | 1–15 (default 5) | 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 | 480p $0.05 · 720p $0.07 | ✓ |
| **Runway Gen-4.5** | `runway/gen-4.5` | ✓ | ✓ | – | – | ? | 720p (default 720p) | 2–10 (default 5) | 16:9, 9:16 | 720p $0.12 | – |
| **Seedance 1.5 Pro** | `bytedance/seedance-1-5-pro` | ✓ | ✓ | ✓ | ✓ | ✗ | 480p / 720p / 1080p (default 1080p) | 4–12 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 9:21 † | 480p $0.0231 · 720p $0.0518 · 1080p $0.117 | – |

¹ The provider answers "does not support image input references" (Sep 2026): `caps.references: false`,
so the app hides the style-reference strip and rejects `references` with a 400.

Grok Imagine 1.5 rejected text-only prompts with a 400 in Jul 2026. OpenRouter's catalog describes
text-to-video again in Oct 2026, so it is offered; a rejection shows the provider's message.

Wan 3.0 Prime is the fast-mode Wan 3.0 per OpenRouter's description, priced above Wan 3.0.

**Reference videos and audio** (`caps.mediaReferences`): Wan 3.0 and Wan 3.0 Prime (5 videos and 5 audio clips,
15 s of each), Seedance 2.0, 2.0 Fast and 2.0 Mini (3 and 3, 15 s), Seedance 2.5 (10 and 10, 30 s) and Kling 4.0
(5 videos, 30 s, no audio) take MP4 / MOV / WebM clips and MP3 / WAV audio besides reference images, never with
frames. They run on kie.ai only (docs/KIE.md): OpenRouter's `input_references` lists `video_url` and `audio_url`
parts but documents no inline data, and APIMart uploads images only.

Not on OpenRouter: Gemini Omni Flash 1.1, Kling 4.0, Kling 3.0 Motion Control, FLUX.3 Max and FLUX.3 Video Draft run on fal (see
[fal models](#fal-models)); PixVerse 6 Max runs on kie.ai and APIMart only, Gemini Omni Flash 1.2 on APIMart only (see
[kie.ai and APIMart only](#kieai-and-apimart-only)); Higgsfield Genjutsu and Seedance 2.5 Draft and Edit are not in the app.
Sora 2 Pro left OpenRouter and was removed.

Default video model: **Seedance 2.5** (`bytedance/seedance-2.5`).

### Hidden (in the catalog, not selectable)

OpenRouter lists these, but they need an input the app does not send. They stay in the catalog with
`hidden: true` so their slugs are known. A model the live catalog lists without any duration is
hidden the same way, unless it is a curated [video editor](#video-editing).

| Model | OpenRouter slug | Why |
|---|---|---|
| **FLUX Video Upscale** | `black-forest-labs/flux-video-upscale` | Video upscaling (an upscale factor the app does not offer) |
| **HeyGen Avatar IV** | `heygen/avatar-iv` | Talking avatar (needs audio input) |

## fal models

With a fal key these run on fal ([FAL.md](FAL.md) has the request rules). **fal-only** models
(`offOpenRouter: true`) are not on OpenRouter: their ids (`fal/<name>`) are the app's own, not fal endpoint
ids, and their options are curated, since the app reads no catalog from fal. None of them is
verified yet.

Runs on fal, fal-only or not, are estimated from fal's list prices per endpoint (`FAL_PRICES` in
`src/shared/fal-prices.ts`, read from each endpoint's page on 15 Oct 2026), not the catalog's
OpenRouter prices: a model both offer can cost quite differently (Seedance 2.5 is about two and a half
times OpenRouter's rate on fal). GPT Image 2.6 Flare and Sunburst have no fal price: fal bills them in tokens
and gives no per-size figure for them. fal reports no cost with a result, so runs on fal record none.

### fal-only video models

Endpoints are fal endpoint ids; `…/image-to-video` repeats the text-to-video path. `†` = the aspect
ratio is sent for text-to-video only (`aspect: "text"` or `omitAspectRatioOnI2v`). Resolutions in
brackets are the values fal receives when they differ from the app's.

| Model | Id | fal endpoints | t2v | i2v | Last frame | Audio | Resolutions | Durations (s) | Aspect ratios |
|---|---|---|:-:|:-:|:-:|:-:|---|---|---|
| **Gemini Omni Flash 1.1** <sub>NEW</sub> | `fal/gemini-omni-flash-1.1` | `google/gemini-omni-flash/v1.1/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | – | 720p / 1080p / 4K [`4k`] (default 720p) | 3–10 (default 8) | 16:9, 9:16 |
| **Kling 4.0** <sub>NEW</sub> | `fal/kling-v4` | `kling/v4/text-to-video` · `…/image-to-video` ⁴ | ✓ | ✓ | ✓ | – ⁴ | 720p / 1080p (default 720p) | 3–30 (default 5) | 21:9, 16:9, 1:1, 9:16 † |
| **FLUX.3 Max** <sub>NEW</sub> | `fal/flux-3-max` | `blackforestlabs/flux-3-max/text-to-video` · `…/image-to-video` ³ | ✓ | ✓ | ✓ | ✓ | 720p / 1080p (default 720p) | 5–20 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 † |
| **FLUX.3 Video Draft** <sub>NEW</sub> <sub>FAST</sub> | `fal/flux-3-video-draft` | `blackforestlabs/flux-3/text-to-video/draft` · `…/image-to-video/draft` · `…/first-last-frame-to-video/draft` ² | ✓ | ✓ | ✓ | ✓ | 720p (not sent) | 5–20 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 † |
| **Kling O3 Pro** <sub>NEW</sub> | `fal/kling-o3-pro` | `fal-ai/kling-video/o3/pro/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | ✓ | not sent | 3–15 (default 5) | 16:9, 1:1, 9:16 † |
| **Kling 3.0 Turbo** <sub>FAST</sub> | `fal/kling-v3-turbo-pro` | `fal-ai/kling-video/v3/turbo/pro/text-to-video` · `…/image-to-video` | ✓ | ✓ | – | – | not sent | 3–15 (default 5) | 16:9, 1:1, 9:16 † |
| **PixVerse 6** <sub>NEW</sub> | `fal/pixverse-v6` | `fal-ai/pixverse/v6/text-to-video` · `…/image-to-video` | ✓ | ✓ | – | ✓ ¹ | 720p / 1080p (default 720p) | 1–15 (default 5) | 21:9, 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 † |
| **Vidu Q4** <sub>NEW</sub> | `fal/vidu-q4` | `fal-ai/vidu/q4/image-to-video` | – | ✓ | – | – | 720p / 1080p / 2K / 4K (default 720p) | 3–16 (default 5) | not sent (follows the frame) |
| **LTX 2.3** | `fal/ltx-2.3` | `fal-ai/ltx-2.3/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | ✓ | 1080p / 2K [`1440p`] / 4K [`2160p`] (default 1080p) | 6, 8, 10 (default 6) | 16:9, 9:16 |
| **Luma Ray 3.2** | `fal/luma-ray-3.2` | `luma/agent/ray/v3.2/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | – | 720p / 1080p (default 720p) | 5, 10 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 |

¹ Sent as `generate_audio_switch`; the others use `generate_audio`.
² FLUX.3 Video's fast, cheaper preview (fal lists $0.06/s, against $0.17/s for FLUX.3 Video at 720p).
A first frame alone goes to `image-to-video/draft`; a first and a last frame go to
`first-last-frame-to-video/draft` (`firstLastFrameToVideo`); a last frame alone is refused.
³ fal's post-trained FLUX.3 Video (16 Oct 2026), tuned for prompt adherence and quality. The last frame
goes with the first to `image-to-video` as `end_image_url`. $0.17/s at 720p, $0.29/s at 1080p; fal
takes 75% off through 7 Nov 2026 ($0.0425 / $0.0725), and the estimate follows. `reasoning_level` is
left at fal's default (`high`: the model expands the prompt). The keyframes endpoint is not used.
⁴ Kuaishou's Kling 4.0 (15 Oct 2026), also on kie.ai and APIMart (below). It always has sound and no
provider can turn it off, so there is no Sound toggle (`caps.audio: false`). The frames go as
`start_image_url` and `end_image_url`; per-shot prompts (`multi_prompt`) are not used. $0.157/s at
720p, $0.235/s at 1080p (read 22 Oct 2026). fal's catalog lists both endpoints as active with a
published schema, but still says "API access is coming soon": a run on fal may be refused until it opens.

Durations go out as numbers (Gemini Omni Flash, Kling 4.0, FLUX.3 Max, FLUX.3 Video Draft, PixVerse, Vidu, LTX), strings (`"5"`, Kling) or
seconds (`"5s"`, Luma). None of these takes style references (`caps.references: false`), except Kling 4.0,
which takes them on kie.ai and APIMart (never on fal).

**Motion control** (`caps.motionControl`): a character image plus a reference video, and an optional
prompt. The clip copies the video's movement and is as long as the video. There is no duration,
resolution or aspect ratio choice, no audio and no style reference. The reference video is MP4, MOV
or WebM up to 90 MB, 3 s or longer, and at most 30 s when the character follows the video's
orientation (the default) or 10 s when it follows the image's.

| Model | Id | fal endpoint |
|---|---|---|
| **Kling 3.0 Motion Control** <sub>NEW</sub> | `fal/kling-v3-pro-motion-control` | `fal-ai/kling-video/v3/pro/motion-control` |
| **Kling 3.0 Motion Control Standard** | `fal/kling-v3-standard-motion-control` | `fal-ai/kling-video/v3/standard/motion-control` |

Video editors that run only on fal are listed under [Video editing](#video-editing).

### fal-only image models

All are 1K only (no size choice). References are sent as a list (`image_urls`) or a single
`image_url`. "preset" = the aspect ratio goes out as one of fal's `image_size` presets
(`square_hd`, `landscape_4_3`, `portrait_4_3`, `landscape_16_9`, `portrait_16_9`).

| Model | Id | fal endpoints (text-to-image · edit) | t2i | i2i (max refs) | Aspect ratios | Aspect sent as |
|---|---|---|:-:|:-:|---|---|
| **FLUX.1 Kontext Pro** | `fal/flux-kontext-pro` | `fal-ai/flux-pro/kontext/text-to-image` · `fal-ai/flux-pro/kontext` | ✓ | ✓ (1, `image_url`) | auto, 21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16 | `aspect_ratio` |
| **FLUX 1.1 Pro Ultra** | `fal/flux-1.1-pro-ultra` | `fal-ai/flux-pro/v1.1-ultra` | ✓ | – | auto, 21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16 | `aspect_ratio` |
| **Ideogram 4.5** <sub>NEW</sub> | `fal/ideogram-4.5` | `ideogram/v4.5` · `ideogram/v4.5/edit` | ✓ | ✓ (1, `image_url`) | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |
| **GPT Image 1.5** | `fal/gpt-image-1.5` | `fal-ai/gpt-image-1.5` · `fal-ai/gpt-image-1.5/edit` | ✓ | ✓ (4, `image_urls`) | auto, 1:1, 3:2, 2:3 | `image_size` `1024x1024` / `1536x1024` / `1024x1536` |
| **Qwen Image Edit 2511** | `fal/qwen-image-edit-2511` | edit only: `fal-ai/qwen-image-edit-2511` | – | ✓ (3, `image_urls`) | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |
| **Z-Image Turbo** <sub>FAST</sub> | `fal/z-image-turbo` | `fal-ai/z-image/turbo` | ✓ | – | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |
| **FLUX.1 [dev]** | `fal/flux-dev` | `fal-ai/flux/dev` | ✓ | – | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |
| **FLUX.1 [schnell]** <sub>FAST</sub> | `fal/flux-schnell` | `fal-ai/flux/schnell` | ✓ | – | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |

### APIMart-only image models

Not on OpenRouter, fal nor kie.ai: these run only with an APIMart key (fields and rules in
[APIMART.md](APIMART.md)). The id is the app's own (`<maker>/<name>`). None is verified yet.

| Model | Id | APIMart model | t2i | i2i (max refs) | Sizes | Aspect ratios |
|---|---|---|:-:|:-:|---|---|
| **GPT Image 2.6** <sub>NEW</sub> | `openai/gpt-image-2.6` | `gpt-image-2.6` ¹ | ✓ | ✓ (8, `image_urls`) | 1K / 2K / 4K | auto, 1:1, 3:2, 2:3, 4:3, 3:4, 5:4, 4:5, 16:9, 9:16 |

¹ OpenAI's GPT Image 2.6, read from APIMart's model page on 30 Oct 2026; not on fal, kie.ai or
OpenRouter yet. Text to image and edits are one model, with GPT Image 2's APIMart fields: `size` is
the ratio (`auto` by default), `resolution` `1k` / `2k` / `4k`, references as `image_urls`. APIMart
takes 16 references, the app sends 8 at most. Not sent: `quality` (auto / low / medium / high, APIMart
picks), `n` (up to 4; the app makes one call per image), `output_format` and `background`
(transparent). APIMart lists no price for it yet, so there is no estimate; the cost of each run is
recorded. GPT Image 2.6 Flare and Sunburst, separate models, are on OpenRouter too (see [Image models](#image-models)).

### kie.ai and APIMart only

Not on OpenRouter nor fal: these run only with a kie.ai or APIMart key (fields and rules in
[KIE.md](KIE.md) and [APIMART.md](APIMART.md)), on whichever is cheaper for the run (Gemini Omni Flash 1.2
is on APIMart only). The id is the app's own (`<maker>/<name>`). None is verified yet. `†` = the aspect
ratio is sent for text-to-video only.

| Model | Id | kie models · APIMart model | t2v | i2v | Last frame | Audio | Resolutions | Durations (s) | Aspect ratios |
|---|---|---|:-:|:-:|:-:|:-:|---|---|---|
| **Gemini Omni Flash 1.2** <sub>NEW</sub> | `google/gemini-omni-flash-1.2` | – · `gemini-omni-1.2-flash` ² | ✓ | ✓ | ✓ | – | 720p / 1080p / 4K [`4k`] (default 720p) | not sent: the prompt sets it, about 3–10 ² | 16:9, 9:16 |
| **PixVerse 6 Max** <sub>NEW</sub> | `pixverse/pixverse-v6-max` | `pixverse-v6-max/text-to-video` · `…/image-to-video` · `pixverse-v6-max` ¹ | ✓ | ✓ | – | ✓ | 720p / 1080p (default 720p) | 1–15 (default 5) | 21:9, 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 † |

¹ The top quality tier of PixVerse 6 (24 Oct 2026): text-to-video and a first frame only (no last
frame, references, extension or multi-shot); with a frame the clip follows the image's ratio. Both
providers also offer 360p and 540p, which the app does not list (nor for PixVerse 6). Read 26 Oct 2026,
per second without / with sound: kie 8.8 / 12 credits at 720p, 17.6 / 22.4 at 1080p ($0.044 / $0.06,
$0.088 / $0.112); APIMart $0.0391 / $0.0533 at 720p, $0.0782 / $0.0996 at 1080p (Gold tier), so
APIMart is the cheaper. APIMart takes a frame without a prompt, kie does not.
² Google's Gemini Omni 1.2 Flash, read from APIMart's model page on 30 Oct 2026; not on fal, kie.ai or
OpenRouter yet. There is no duration field: the prompt sets the length (about 3–10 s, not guaranteed),
so the app offers a single 8 s placeholder and sends nothing. A first frame, a first and a last frame
(`first_frame_image`, `last_frame_image`), or style references (`image_urls`; APIMart takes 10 images
in all, frames included, the app sends frames or references, not both); the ratio is sent with frames
too. APIMart also offers 360p (not listed; 1080p and 4K are upscaled) and reference clips, edit and
extend through `video_urls` and `metadata.task`, which the app does not use (no video input on
APIMart). APIMart lists no price for it yet, so there is no estimate; the cost of each run is recorded.

### kie.ai

With a kie.ai key, these also run on kie ([KIE.md](../docs/KIE.md) has the fields and the rules), at kie's
list prices (`KIE_PRICES`), and a video goes there whenever it is the cheapest for that run. kie records
what each run cost.

| Video | kie model | Image | kie model |
|---|---|---|---|
| Veo 3.1 / Fast / Lite | `veo-3-1` (`veo3` / `veo3_fast` / `veo3_lite`) | Nano Banana Pro | `nano-banana-pro` |
| Kling 3.0 Pro / Standard | `kling-3.0/video` (`pro` / `std`) | Nano Banana 2 | `nano-banana-2` |
| Seedance 2.5, 2.0, 2.0 Fast, 2.0 Mini | `bytedance/seedance-2-5`, `-2`, `-2-fast`, `-2-mini` | Nano Banana 2 Lite | `nano-banana-2-lite` |
| MiniMax H3 | `minimax-h3/text-to-video` / `image-to-video` | Nano Banana | `google/nano-banana` (`-edit`) |
| Wan 3.0, Wan 3.0 Prime | `wan/3-0-video`, `wan/3-0-video-prime` | GPT Image 2 | `gpt-image-2-text-to-image` / `-image-to-image` |
| Wan 2.7 | `wan/2-7-text-to-video` / `image-to-video` | FLUX.1 Kontext Pro | `flux1-kontext` (`flux-kontext-pro`) |
| Grok Imagine Video, Grok Imagine 1.5 | `grok-imagine/…`, `grok-imagine-video-1-5-preview` | Z-Image Turbo | `z-image` |
| Gemini Omni Flash 1.1 | `google/gemini-omni-flash-1-1` | | |
| Kling 4.0 | `kling-4.0/reference-to-video` (text-to-video, style references), `kling-4.0/keyframe-to-video` (frames) | | |
| PixVerse 6, PixVerse 6 Max, Vidu Q4 | `pixverse-v6/…`, `pixverse-v6-max/…`, `vidu-q4/image-to-video` | | |
| Wan 2.7 Edit | `wan/2-7-videoedit` | | |

### Revana

With a Revana key, 36 of these models also run on Revana ([REVANA.md](REVANA.md)), at the prices of its public
list (`REVANA_MODELS`), and a run goes there whenever it is the cheapest. Revana records what each run cost.

### APIMart

With an APIMart key, these also run on APIMart ([APIMART.md](APIMART.md)), at its Gold-tier prices
(`APIMART_PRICES`), and a video goes there whenever it is the cheapest for that run. APIMart records what each
run cost. It takes no video input, so editing and motion control never go there.

| Video | APIMart model | Image | APIMart model |
|---|---|---|---|
| Veo 3.1 / Fast / Lite (8 s) | `veo3.1-quality`, `veo3.1-fast`, `veo3.1-lite` | Nano Banana Pro | `gemini-3-pro-image-preview` |
| Seedance 2.5, 2.0, 2.0 Fast, 2.0 Mini, 1.5 Pro | `seedance-2.5`, `seedance-2.0`, `-fast`, `-mini`, `seedance-1-5-pro` | Nano Banana 2 | `gemini-3.1-flash-image-preview` |
| MiniMax H3, H3 Max, Hailuo 2.3 | `MiniMax-H3`, `MiniMax-H3-Max`, `MiniMax-Hailuo-2.3` | Nano Banana 2 Lite | `gemini-3.1-flash-lite-image-ext` |
| Wan 3.0, Prime, 2.7, 2.6 | `wan3.0-video`, `wan3.0-video-prime`, `wan2.7`, `wan2.6` | Nano Banana | `gemini-2.5-flash-image-preview` |
| Kling 4.0, Kling 3.0 Pro / Standard, Kling O1 | `kling-v4`, `kling-v3` (`pro` / `std`), `kling-video-o1` | GPT Image 2, 2.6 (only here), 2.6 Flare, 2.6 Sunburst | `gpt-image-2`, `gpt-image-2.6`, `gpt-image-2.6-flare`, `gpt-image-2.6-sunburst` |
| PixVerse 6, PixVerse 6 Max, Vidu Q4 | `pixverse-v6`, `pixverse-v6-max`, `viduq4-preview` | FLUX.1 Kontext Pro | `flux-kontext-pro` |
| Gemini Omni Flash 1.1, 1.2, FLUX.3 Video | `gemini-omni-1.1-flash-ext`, `gemini-omni-1.2-flash`, `flux-3-video` | Z-Image Turbo | `z-image-turbo` |

### Models on both

These are in the OpenRouter tables above and also have a fal route. With both keys, a video runs on
whichever is cheaper for that request (Seedance 2.5 is about 40% of fal's price on OpenRouter; Kling 3.0,
MiniMax H3 and FLUX Video Edit cost the same on both, so Settings decides), and Settings decides the
images (OpenRouter by default); with one key, that provider does. The price next to Generate shows who
runs it, and hovering it compares the two ([FAL.md](FAL.md#which-provider-runs-a-model)). The options are the same
whoever runs them (OpenRouter's live values for video, the curated ones for images), mapped onto
fal's fields. Style references are never sent to fal.

- **Nano Banana Pro**: `fal-ai/nano-banana-pro` · `fal-ai/nano-banana-pro/edit`; `image_urls`,
  `aspect_ratio`, `resolution` 1K / 2K / 4K.
- **Nano Banana 2**: `fal-ai/nano-banana-2` · `fal-ai/nano-banana-2/edit`; `image_urls`,
  `aspect_ratio`, `resolution` 1K / 2K.
- **GPT Image 2**: `openai/gpt-image-2` · `openai/gpt-image-2/edit`; `image_urls`, `image_size`
  (1:1 `square_hd`, 2:3 832×1216, 3:2 1216×832).
- **GPT Image 2.6 Flare**: `openai/gpt-image-2.6/flare/text-to-image` · `openai/gpt-image-2.6/flare/edit`;
  `image_urls` (fal takes 16), `image_size` (fal's presets for 1:1, 4:3, 3:4, 16:9, 9:16; 2:3 832×1216,
  3:2 1216×832, 21:9 1536×640). `quality` and `reasoning_effort` are left at fal's defaults (both `high`). No
  price (see above).
- **GPT Image 2.6 Sunburst**: `openai/gpt-image-2.6/sunburst/text-to-image` · `openai/gpt-image-2.6/sunburst/edit`;
  as GPT Image 2.6 Flare.
- **Seedance 2.5**: `bytedance/seedance-2.5/us/text-to-video` · `…/image-to-video`; `duration` as a
  string, `aspect_ratio` (not with a frame), `resolution` 480p / 720p, `end_image_url`,
  `generate_audio`. These are fal's US-hosted endpoints, the only ones it lists since Oct 2026
  ($0.2646 / $0.5676 per second at 480p / 720p, 20% above the old ones); `…/us/reference-to-video`
  is not used, since fal never gets style references.
- **MiniMax H3**: `minimax/h3/text-to-video` · `…/image-to-video`; `duration` as a number,
  `aspect_ratio` for text-to-video, `resolution: "2K"`, `end_image_url`. The audio toggle is not sent.
- **MiniMax H3 Max**: `minimax/h3-max/text-to-video` · `…/image-to-video`; as H3, with `resolution`
  `"480P"` / `"768P"` and `prompt_expansion_mode: "balanced"`.
- **Kling 3.0 Pro**: `fal-ai/kling-video/v3/pro/text-to-video` · `…/image-to-video`;
  `start_image_url`, `end_image_url`, `duration` as a string, `aspect_ratio` for text-to-video,
  `generate_audio`, no `resolution`.
- **Kling 3.0 Standard**: `fal-ai/kling-video/v3/standard/text-to-video` · `…/image-to-video`; as
  Kling 3.0 Pro.

## Video editing

Editors (`caps.videoEdit`) take one video and a prompt saying what to change, and return that video
changed: same length (or as much of it as the model keeps), same framing. Nothing else is sent: no
duration, aspect ratio, audio flag, frame or style reference; the resolution only where the model
offers a choice. The composer switches to them like any model (the picker lists them together under
"Edit a video"), and **Edit video** on a finished clip (card or lightbox) hands that clip to the
last editor used (FLUX Video Edit the first time).

The video is an upload (MP4, MOV or WebM up to 90 MB, like a motion-control reference) or another
record's output. Its length and size are checked against `editSource` before anything is sent: in
the composer (Generate stays disabled with the reason under the prompt) and again at submit (a 400).
A length the app cannot read (WebM) is left to the provider. Prices are per second of the edit,
which is as long as the video, so the estimate appears once the video's length is known.

| Model | Id | Runs on | Endpoint | Resolutions | Video | Price |
|---|---|---|---|---|---|---|
| **FLUX Video Edit** <sub>NEW</sub> | `black-forest-labs/flux-video-edit` | OpenRouter, fal | fal: `blackforestlabs/flux-3/edit-video` | 720p (not sent) | up to 15 s, 50 MB | $0.03/s |
| **Runway Aleph 2** <sub>PRO</sub> | `runway/aleph-2` | OpenRouter | | 720p (not sent) | ? | $0.28/s, $0.56 minimum |
| **Kling O3 Edit** <sub>NEW</sub> | `fal/kling-o3-edit` | fal | `fal-ai/kling-video/o3/pro/video-to-video/edit` | follows the video | 3–15 s | $0.168/s |
| **Kling O3 Edit Standard** | `fal/kling-o3-edit-standard` | fal | `fal-ai/kling-video/o3/standard/video-to-video/edit` | follows the video | 3–15 s | $0.126/s |
| **Gemini Omni Flash 1.1 Edit** <sub>NEW</sub> | `fal/gemini-omni-flash-1.1-edit` | fal | `google/gemini-omni-flash/v1.1/edit` | 720p / 1080p / 4K [`4k`] (default 720p) | ? | $0.10 / $0.15 / $0.30 per s |
| **Grok Imagine Edit** <sub>FAST</sub> | `fal/grok-imagine-edit` | fal | `xai/grok-imagine-video/edit-video` | 480p / 720p (default 480p) | any; edits the first 8 s | $0.06 / $0.08 per s |
| **Wan 2.7 Edit** | `fal/wan-2.7-edit` | fal | `fal-ai/wan/v2.7/edit-video` | 720p / 1080p (default 1080p) | 2–10 s | $0.10 / $0.15 per s |

On OpenRouter the video goes inline as a data URL in `input_references` (`{ type: "video_url" }`):
OpenRouter has no upload and the browser no public url to give it. OpenRouter's catalog lists no
options for editors, so a curated editor keeps its own and takes only the price from the live
catalog. Kling O3 Edit keeps the video's sound (fal's `keep_audio` default); Wan 2.7 Edit decides
for itself (`audio_setting: "auto"`). None is verified end to end yet.

## Upscaling

Upscalers (`caps.upscale`) take one image or one video and return it larger, with no prompt. They are
picked like any model (the picker lists them under "Upscale an image" / "Upscale a video"), and
**Upscale** on a finished image or clip (card or lightbox) hands it to its composer on Topaz. Picked, an
upscaler turns the prompt into a drop zone for its input (drop, paste for images, or click to choose);
the chips become the scale (2x / 4x) or, for ByteDance, the target resolution. One run per Generate.
Upscalers with a creative mode (`caps.upscale.creative`: Topaz, FLUX Video Upscale) add a **Creative** toggle
(accent chip, Sparkles): off is a faithful upscale, on rebuilds detail (Topaz's generative Wonder and Starlight
endpoints; FLUX's `creativity: 1`). kie.ai has no creative mode, so a creative run goes to fal (or OpenRouter).

Video upscalers are editors too (`caps.videoEdit`): the video goes up the same way as one to edit and
the clip keeps its length. Their requests and prices live in `src/client/lib/upscale.ts`, not in the
fal / kie.ai price tables: Topaz on fal bills by the output's size, so its estimate needs the input's
(read from the file, or the record's output); while it is unknown, a video run goes to kie.ai, the one priced.

| Model | Id | Runs on | fal endpoint · kie.ai model | Options | Price (2 Nov 2026) |
|---|---|---|---|---|---|
| **Topaz Upscale** <sub>PRO</sub> | `topaz/upscale-image` | fal, kie.ai | `topaz/upscale/image/precision` · `topaz/image-upscale` | 2x / 4x (`upscale_factor`) | fal $0.08 per started 24 MP out; kie.ai $0.05 (2x) / $0.10 (4x) |
| **Recraft Crisp Upscale** <sub>FAST</sub> | `recraft/crisp-upscale` | fal, kie.ai | `fal-ai/recraft/upscale/crisp` · `recraft/crisp-upscale` | none (PNG only on fal: the app converts) | fal $0.004; kie.ai $0.0025 |
| **Topaz Video Upscale** <sub>PRO</sub> | `topaz/upscale-video` | fal, kie.ai | `topaz/upscale/video/precision` · `topaz/video-upscale` | 2x / 4x | fal $0.01 / $0.02 / $0.06 per s (output up to 720p / 1080p / above); kie.ai $0.04/s (2x), $0.07/s (4x) |
| **ByteDance Video Upscaler** <sub>FAST</sub> | `bytedance/video-upscaler` | fal | `fal-ai/bytedance-upscaler/upscale/video` | 1080p / 2K / 4K (`target_resolution`, default 4K) | $0.0072 / $0.0144 / $0.0288 per s |
| **SeedVR2 Upscale** <sub>FAST</sub> | `bytedance/seedvr2-upscale` | fal | `fal-ai/seedvr/upscale/image` | 2x / 4x | $0.001 per MP out |
| **SeedVR2 Video Upscale** <sub>FAST</sub> | `bytedance/seedvr2-video-upscale` | fal | `fal-ai/seedvr/upscale/video` | 2x / 4x | $0.001 per MP out per frame (estimated at 30 fps) |
| **FLUX Video Upscale** <sub>NEW</sub> | `black-forest-labs/flux-video-upscale` | OpenRouter, fal | `blackforestlabs/flux-video-upscale` | 1.5x / 2x / 3x, Creative (`creativity` 0 / 1); clips up to 20 s, 50 MB | OpenRouter $0.035 per MP-second out ($0.05 creative); fal $0.084 / $0.15 / $0.33 per s at 1080p / 2K / 4K out ($0.12 / $0.21 / $0.474 creative) |

Topaz's Creative mode: images on `topaz/upscale/image/generative` (Wonder 3, $0.08 per started 8 MP out), video on
`topaz/upscale/video/generative` (Starlight Precise 2.6, $0.12/s up to 1080p out, $0.26/s above). Topaz video asks
fal for H.264 (`H264_output`); fal's default, H.265, does not play in every browser.

kie.ai lists Topaz images as "2K" and "4K" tiers; the app reads them as the 2x and 4x scales. None is
verified end to end yet.

## Live catalog and discovered models

At startup the browser reads `GET /api/v1/videos/models` and `GET /api/v1/images/models`. Both are
public, so this works before a key is set. The result is cached 10 minutes and mirrored to
localStorage, so a model OpenRouter adds shows up within 10 minutes.

**Video.** For every curated model the live entry replaces durations, resolutions, aspect ratios,
image-to-video and last-frame support, audio and the price. The curated entry keeps the name,
featured flag, badges, description, `realFaces`, `references`, `omitAspectRatioOnI2v`, `verified`
and a text-to-video quirk. A curated model OpenRouter no longer lists disappears from the picker,
unless it has a fal route: it then stays, as a fal-only model. fal-only models are never looked up
in OpenRouter's catalogs. A curated editor (`caps.videoEdit`) is the exception to the first rule:
OpenRouter lists no options for it, so it keeps its own and takes only the price (`cents_per_second_output`,
and `minimum_cents_per_generation` as `minCostUsd`). Every other listed model is **discovered**:

| Field | Value |
|---|---|
| `name` | OpenRouter's `name` with the leading `Vendor: ` prefix stripped. |
| `provider` | The slug's vendor when it is a known `ModelProvider` (`bytedance-seed` counts as `bytedance`), otherwise `openrouter`. |
| `description` | `New on OpenRouter. Not tested in this app yet.` |
| `featured` / `badges` | `false` / `["new"]`; listed under "All models" with an "Unverified" hint. |
| options and price | From the live catalog, as for curated models. Values the app has no option for (`8K`, `5:4`) are dropped. |
| `caps.references` | `false`: style references are not sent until someone verifies them. |
| `hidden` | `true` when the catalog lists no duration (upscaling, avatars, editors without a curated entry). |

**Image.** Curated models keep their verified routes and options (`chat` and `images` do not take
the catalog's fields one to one), and stay listed as they are when OpenRouter stops listing them. A
curated `native` model (GPT Image 2.6 Flare, Sunburst) is the exception: it takes the catalog's options as a
discovered model does, keeps its name, badges, description and its other providers' routes, and leaves the
picker if OpenRouter stops listing it. Every other model in `/api/v1/images/models` is discovered and
served through the native `POST /api/v1/images` with `aspect_ratio`, `resolution` and
`input_references` as the catalog lists them. Aspect ratios are the ones the app knows plus `auto`.
Sizes are the catalog's `resolution` values among 1K / 2K / 4K. References are capped at 8. A model
whose `input_references` minimum is 1 needs a reference image. SVG-only models are left out. The
image catalog has no prices, so discovered image models show no estimate; the real `usage.cost`
is recorded on the result.

Provider 400s for a discovered model are surfaced verbatim. Once you have run one through the
checklist below, add a curated entry; it then stops being discovered.

## Prompt editor models

The video composer's AI Prompt Editor uses three fixed models (`src/client/lib/prompt-editor.ts`), picked from
OpenRouter's live catalogs (14 and 15 Oct 2026) as the newest of their kind:

| Role | Model | Why |
|---|---|---|
| Rewrite the prompt | `openai/gpt-6-luna` (GPT-6 Luna, 22 Sep 2026) | GPT-6's fast, cost-efficient tier: $0.05 / $0.25 per million tokens in / out. Asked for low reasoning. |
| Preview the shot (6 frames in one picture) | `openai/gpt-image-2.5-flare` (GPT Image 2.5 Flare, Sep 2026) | The speed tier of GPT Image 2.5 (Sunburst is the precision tier). Asked for `quality: "low"`. |
| Recreate a video | `google/gemini-4-argon` (Gemini 4 Argon, 13 Oct 2026) | The newest Gemini that takes video input (`input_modalities` has `video`): Google's flagship reasoning model, asked for low reasoning effort. $2 / $10 per million tokens; a 10 s clip is a few thousand tokens. `google/gemini-3.8-flash` (Sep 2026, $0.75 / $3.75) is the faster, cheaper swap. |

The preview's model can be changed in the dialog (Edit configuration on the chevron next to Preview). The choices
are `PREVIEW_MODELS`, each taking the grid's ratios and reference images per the live catalog:

| Model | Option | Price (OpenRouter, 15 Oct 2026) |
|---|---|---|
| `openai/gpt-image-2.5-flare` (default) | quality auto · low (default) · medium · high · xhigh · max | per token: $5 / M text in, $8 / M image in, $30 / M image out |
| `openai/gpt-image-2.5-sunburst` | same | same |
| `google/gemini-nano-banana-2.1` | resolution 1K (default) · 2K · 4K | $30 / M image out |
| `bytedance-seed/seedream-5-0-flash` | resolution 1K (default) · 2K | $0.018 per picture |

When a newer tier ships, change the id there and the name shown in the dialog follows.

## Adding a model

1. Confirm the slug is live on OpenRouter (see the checklist below). For a model on fal, see
   [Adding a fal model](#adding-a-fal-model).
2. Add an entry to `IMAGE_MODELS` or `VIDEO_MODELS` in `src/shared/models.ts`. That's the whole
   change; no other code needs to know about a new model.
3. Run it once through the app, paste the measured `usage.cost` and any provider error bodies into
   your PR, and update the table above.
4. Leave `verified: false` until you've completed the checklist.

### Adding a fal model

1. Find the endpoint id on fal and read its input schema (field names, enums, defaults, limits):
   `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>`. Write down how it spells
   each option; endpoints of the same family often differ.
2. A model OpenRouter also has: add a `fal` route to its existing entry. A fal-only model: add an
   entry with `id: "fal/<name>"`, `offOpenRouter: true`, a `fal` route, `verified: false` and empty
   `estCostUsd` / `estCostPerSecUsd`; image models also take `endpoint: "fal"`. Fill `caps`,
   durations, resolutions and aspect ratios from the schema's enums.
3. Fill the route (fields below). If the endpoint needs something `FalImageRoute` / `FalVideoRoute`
   cannot say, extend the type in `src/shared/types.ts` and `src/client/lib/fal-payloads.ts`, with a
   case in `src/client/lib/__tests__/fal.test.ts`.
4. `src/client/lib/__tests__/catalog.test.ts` ("fal routes") checks the route against the model: a
   model off OpenRouter has a route (fal, or kie.ai / APIMart only), every mode the caps offer has an endpoint, `lastFrame` needs
   `endImage`, a fal-only model with audio names its audio field, a `resolutions` map covers every
   listed resolution, fal-only image models use `endpoint: "fal"`, and motion-control models are
   fal-only with a `motionControl` endpoint.
5. Run it once through the app with a fal key and put any fal error bodies in the PR. fal reports no
   cost, so there is no `usage.cost` to paste. Update the tables in [fal models](#fal-models).

### `ImageModel` fields

| Field | Meaning |
|---|---|
| `kind` | Always `"image"`. |
| `id` | OpenRouter slug, e.g. `google/gemini-3-pro-image`. Must match `GET /api/v1/models` exactly. A fal-only model uses the app's own `fal/<name>`. |
| `name` / `provider` / `description` | Picker display. `provider` must be a `ModelProvider` (`google`, `openai`, `bytedance`, `kwaivgi`, `minimax`, `x-ai`, `alibaba`, `black-forest-labs`, `runway`, `krea`, `heygen`, `qwen`, `recraft`, `microsoft`, `meta`, `sourceful`, `tencent`, `pixverse`, `vidu`, `lightricks`, `luma`, `ideogram`, `openrouter`); add the label to `PROVIDER_LABEL` if you add a provider. |
| `endpoint` | `"chat"` → `chat/completions` with `modalities: ["image","text"]` (result in `choices[0].message.images[0].image_url.url` as a data URL). `"images"` → `images/generations` (result in `data[0].b64_json`). `"native"` → `POST /api/v1/images` with the catalog's own fields; options then come from the live catalog. `"fal"` → not on OpenRouter at all (fal-only, or GPT Image 2.6 on APIMart only). Gemini/GPT-5 image models are `chat`, Krea and `gpt-image-2` are `images`, GPT Image 2.6 Flare, Sunburst and everything discovered are `native`. |
| `featured` | Shows in the "Featured models" group at the top of the picker. Keep this short. |
| `badges` | `"new"`, `"pro"`, `"fast"`, `"beta"`. Purely visual. |
| `caps.textToImage` / `caps.imageToImage` | Whether the model accepts a prompt only / reference images. Rows that can't do the current mode are dimmed in the picker. |
| `caps.maxReferenceImages` | How many reference images the UI lets you attach (0 = none). `gpt-image-2` takes 1 (edit); Gemini 3 takes up to 6. |
| `aspectRatios` | Subset of `ImageAspectRatio`. `auto` means "don't send `image_config.aspect_ratio`". `images`-endpoint models often support only 1:1 (Krea) or 1:1 / 2:3 / 3:2 (`gpt-image-2`, mapped to `size`). |
| `sizes` | Subset of `"1K" \| "2K" \| "4K"`. Only meaningful when `supportsImageSize` is true; otherwise list `["1K"]`. |
| `supportsImageSize` | Whether `image_config.image_size` is honoured. If false the app never sends it. |
| `estCostUsd` | USD per image keyed by size. Missing sizes fall back to `"1K"`. Shown as `~$0.13` in the Generate button. Empty for fal-only models (no estimate shown). |
| `verified` | `true` only after the checklist below. For a model on both, it is about the OpenRouter route. |
| `fal` | How fal serves the model (`FalImageRoute`): `textToImage` and `edit` endpoint ids (the edit one is used when references are attached); `refs` (`"image_urls"` list or a single `"image_url"`); `aspect` (`"aspect_ratio"`, `"image_size"`, absent = never sent); `imageSizes` (the model's own `image_size` per ratio, instead of fal's presets); `resolution` (`true` = send `resolution: "1K" \| "2K" \| "4K"`); `extra` (fixed fields sent with every request). See [FAL.md](FAL.md#image-fields-buildfalimagepayload). |
| `kie` | How kie.ai serves the model (`KieImageRoute`): its `family` (which builder maps the fields), the createTask `model`, an `editModel` used with references, a `tier`. See [KIE.md](KIE.md#image-fields-buildkieimagepayload). |
| `apimart` | How APIMart serves the model (`ApimartImageRoute`): its `family` and APIMart's `model` id. See [APIMART.md](APIMART.md#image-fields-buildapimartimagepayload). |
| `revana` | How Revana serves the model (`RevanaRoute`): Revana's `model` id. See [REVANA.md](REVANA.md). |
| `offOpenRouter` | Not on OpenRouter: runs only on the providers its routes name (`fal`, `kie`, `apimart`, `revana`), and is never looked up in OpenRouter's catalogs. |

### `VideoModel` fields

| Field | Meaning |
|---|---|
| `kind` / `id` / `name` / `provider` / `description` / `featured` / `badges` | As above. |
| `caps.textToVideo` / `caps.imageToVideo` | Modes offered. `imageToVideo` follows the live catalog's `first_frame`; `textToVideo` is curated (the catalog does not say). |
| `caps.lastFrame` | Accepts `frame_images` with `frame_type: "last_frame"` in addition to `first_frame`. Enables the last-frame slot in the UI. |
| `caps.audio` | Accepts `generate_audio` (the live catalog's `generate_audio: true`). Shows the speaker glyph in the picker; the `audio` request flag is sent as `generate_audio` only for these models (and only when the user set it explicitly). |
| `caps.realFaces` | `true` = known to accept recognisable human faces on i2v, `false` = known to reject (Seedance moderation), `undefined` = unknown. Used for the "safe for real faces" hint. |
| `caps.references` | `false` = the provider rejects `input_references` (FLUX.3 Video). The app then hides the style-reference strip and answers a request that still sends `references` with a 400. `undefined` = supported. fal never gets style references, whatever this says. |
| `caps.motionControl` | Motion control: a character image (`firstFrame`) and a reference video (`motionVideo`) are required, the prompt is optional, and duration, resolution and aspect ratio are not sent (the clip follows the video). Only on fal-only models with a `fal.motionControl` endpoint. |
| `caps.videoEdit` | Video editing: a source video (`sourceVideo`) and a prompt are required; duration, aspect ratio, audio, frames and references are not sent, and the clip keeps the video's length. `durations` is then a placeholder. See [Video editing](#video-editing). |
| `editSource` | Editors only: the provider's limits on the video (`minSec`, `maxSec`, `maxMb`), checked before a run; `truncates: true` = longer videos are cut to `maxSec` rather than refused (Grok Imagine). Absent = unknown, left to the provider. |
| `durations` | Either a range `{ min, max, step? }` (every step is allowed, e.g. Seedance 4–30 s) or an explicit list `{ options: [4, 6, 8] }` (Veo, Kling O1, Hailuo 2.3). The stepper snaps to these (`snapDuration`). |
| `defaultDuration` | Preselected duration. |
| `resolutions` / `defaultResolution` | Values the provider accepts for `resolution`. Some accept exactly one (H3 → `2K`, Kling 3.0 Pro → `720p`); if the list is empty the app doesn't send `resolution` at all. |
| `aspectRatios` | Subset of `VideoAspectRatio`. |
| `omitAspectRatioOnI2v` | Set when the provider returns 400 if `aspect_ratio` is sent together with `frame_images` (all Seedance models). The output then follows the input image. |
| `estCostPerSecUsd` | USD per second keyed by resolution (with audio, for a model that has it). Multiplied by the duration for the estimate. |
| `estCostPerSecNoAudioUsd` | USD per second with Sound off, where OpenRouter charges less for that (Kling 3.0, Veo 3.1, Seedance 1.5 Pro). Read from the live catalog's without-audio SKUs. |
| `minCostUsd` | The provider's minimum charge per run (Runway Aleph 2: $0.56); the estimate never goes below it. |
| `verified` | `true` only after the checklist below. |
| `hidden` | Keep in the catalog but don't list it (upscaling, avatar models). |
| `discovered` | Set by the browser (`src/client/lib/catalog.ts`), never in `models.ts`: OpenRouter lists the model but the curated catalog does not (see above). |
| `fal` | How fal serves the model (`FalVideoRoute`): `textToVideo`, `imageToVideo`, `motionControl` and `edit` endpoint ids; `imageField` (first frame as `image_url`, the default, or `start_image_url`); `endImage` (the last frame goes in `end_image_url`); `duration` (`"number"` → `5`, `"string"` → `"5"`, `"seconds"` → `"5s"`, absent = never sent); `aspect` (`"always"`, `"text"` = text-to-video only, absent = never sent); `resolutions` (app value → fal's, e.g. `{ "480p": "480P" }`; absent = never sent); `audio` (`"generate_audio"` or `"generate_audio_switch"`); `extra` (fixed fields). See [FAL.md](FAL.md#video-fields-buildfalvideopayload). |
| `kie` | How kie.ai serves the model (`KieVideoRoute`): its `family` (which builder maps the fields), the createTask `model`, an `imageModel` used with a frame where kie splits the two, a `tier` (Veo's `model`, Kling's `mode`). See [KIE.md](KIE.md#video-fields-buildkievideopayload). |
| `apimart` | How APIMart serves the model (`ApimartVideoRoute`): its `family`, APIMart's `model` id and a `tier` (Kling's `mode`). See [APIMART.md](APIMART.md#video-fields-buildapimartvideopayload). |
| `offOpenRouter` | Not on OpenRouter: runs only on the providers its routes name (`fal`, `kie`, `apimart`), and is never looked up in OpenRouter's catalogs. The browser also sets it on a curated model with another provider's route that OpenRouter stopped listing. |

## Verification checklist

Work through this with `curl` (or the app in dev mode) before flipping `verified: true`. Replace
`$OPENROUTER_API_KEY` and the slug.

1. **Is it live, and what does OpenRouter say it accepts?** Both catalogs are public.

   ```bash
   # video: durations, resolutions, aspect ratios, frames, audio, pricing SKUs
   curl -s https://openrouter.ai/api/v1/videos/models | jq '.data[] | {id, supported_durations, supported_resolutions, supported_aspect_ratios, supported_frame_images, generate_audio, pricing_skus}'

   # image: every model the native images API serves, with its supported_parameters
   curl -s https://openrouter.ai/api/v1/images/models | jq '.data[] | {id, supported_parameters}'
   ```

   The app reads the same two lists (cached 10 min, mirrored to localStorage), so a slug that
   disappears from OpenRouter leaves the picker. See
   [OPENROUTER.md](OPENROUTER.md#live-model-catalog).

2. **Read the provider's supported values by sending a bad one.** Providers reject unknown options
   with a 400 whose body lists what they accept, the fastest way to fill in `resolutions`,
   `durations` and `aspectRatios` without guessing. The app keeps these bodies verbatim in
   `ApiClientError.provider` and shows them on the failed card.

   ```bash
   # video: bogus resolution + duration
   curl -s https://openrouter.ai/api/v1/videos \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
     -d '{"model":"bytedance/seedance-2.5","prompt":"test","duration":999,"resolution":"9999p"}'
   # → e.g. "Supported resolutions: 480p, 720p" / "duration must be between 4 and 30"

   # image (chat endpoint): bogus aspect ratio / size
   curl -s https://openrouter.ai/api/v1/chat/completions \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
     -d '{"model":"google/gemini-3-pro-image","messages":[{"role":"user","content":"test"}],"modalities":["image","text"],"image_config":{"aspect_ratio":"7:1","image_size":"9K"}}'
   ```

   Repeat for each option; write down exactly what the message says, not what the marketing page
   says.

3. **Run one real job with the app's payload shape.** For video, confirm the submit returns
   **HTTP 202** with `{ id, polling_url }`, that polling reaches `completed`, and that the file
   downloads with the Bearer header. For image-to-video, use `frame_images` with `frame_type`;
   a top-level `image` field is silently ignored by some providers. Check whether sending
   `aspect_ratio` alongside `frame_images` returns 400 → set `omitAspectRatioOnI2v`.

4. **Measure the cost.** Read `usage.cost` from the completed response (chat/images: in the JSON
   body; video: in the final poll response) and compute per-image or per-second. Put that in
   `estCostUsd` / `estCostPerSecUsd`; measured numbers beat list prices, which often differ.

5. **Probe the edges.** Last-frame anchor (`caps.lastFrame`), a photo of a real person on i2v
   (`caps.realFaces`), the longest duration, and the highest resolution; these are where
   providers most often diverge from their docs. Moderation is asynchronous: a 202 can still turn
   into `failed` minutes later, so wait for the poll.

6. **Flip `verified: true`**, update the table on this page, and note in the PR which steps you ran.

## Updating the tables

There is no generator checked in. The video table was rebuilt on 14 Oct 2026 with a throwaway
script that imported `VIDEO_MODELS` and printed Markdown rows; when you add or change a model,
update its row (or rebuild the table the same way). Keep the column order so diffs stay readable.
