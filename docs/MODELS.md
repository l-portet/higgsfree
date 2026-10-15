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

Curated today: 19 image models (8 of them fal-only) and 39 video models, of which 35 are offered
(9 fal-only) and 4 are hidden.

**Legend**

- `✓` supported · `–` not supported · `?` unknown (video "Real faces": `✗` = known to reject
  recognisable human faces on image-to-video)
- **Verified** `✓` = this exact slug and payload shape has been run end-to-end through the app and
  the option ranges are known to be accepted. `–` = the slug is live on OpenRouter but the ranges
  are best-effort; the UI says so, and if the provider rejects a value its 400 body is shown
  verbatim (it usually lists the supported values).
- Costs are **estimates** (`estCostUsd` / `estCostPerSecUsd`). The real number is `usage.cost`
  from OpenRouter, recorded on every generation.

## Image models

`chat` = `POST /api/v1/chat/completions` with `modalities: ["image","text"]` and `image_config`;
`images` = `POST /api/v1/images/generations`. "all 11" aspect ratios = `auto`, 1:1, 3:4, 4:3, 2:3,
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
| **Krea 2 Large** | `krea/krea-2-large` | `images` | ✓ | – | 1K * | 1:1 | 1K $0.06 | ✓ |
| **Krea 2 Medium** | `krea/krea-2-medium` | `images` | ✓ | – | 1K * | 1:1 | 1K $0.04 | – |
| **Krea 2 Turbo** <sub>FAST</sub> | `krea/krea-2-medium-turbo` | `images` | ✓ | – | 1K * | 1:1 | 1K $0.02 | – |

Every other image model OpenRouter lists (Nano Banana 2.1, Seedream 5, FLUX.3, Qwen Image 3,
GPT Image 2.5, Recraft, MAI Image and more; about 45 on 14 Oct 2026) is offered as a discovered
model through the native `POST /api/v1/images` (`endpoint: "native"`). See
[Live catalog and discovered models](#live-catalog-and-discovered-models).

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

Not on OpenRouter: Gemini Omni Flash and Kling 3.0 Motion Control run on fal (see
[fal models](#fal-models)); Higgsfield Genjutsu and Seedance 2.5 Draft and Edit are not in the app.
Sora 2 Pro left OpenRouter and was removed.

Default video model: **Seedance 2.5** (`bytedance/seedance-2.5`).

### Hidden (in the catalog, not selectable)

OpenRouter lists these, but they need a video or audio input the app does not send. They stay in
the catalog with `hidden: true` so their slugs are known. A model the live catalog lists without
any duration is hidden the same way.

| Model | OpenRouter slug | Why |
|---|---|---|
| **Runway Aleph 2** | `runway/aleph-2` | Video-to-video editing |
| **FLUX Video Upscale** | `black-forest-labs/flux-video-upscale` | Video upscaling (video input) |
| **HeyGen Avatar IV** | `heygen/avatar-iv` | Talking avatar (needs audio input) |
| **FLUX Video Edit** | `black-forest-labs/flux-video-edit` | Video-to-video editing (video input) |

## fal models

With a fal key these run on fal ([FAL.md](FAL.md) has the request rules). **fal-only** models
(`falOnly: true`) are not on OpenRouter: their ids (`fal/<name>`) are the app's own, not fal endpoint
ids, and their options are curated, since the app reads no catalog from fal. None of them is
verified yet, and none has a cost estimate: fal shows prices only to a signed-in key, and it reports
no cost with a result.

### fal-only video models

Endpoints are fal endpoint ids; `…/image-to-video` repeats the text-to-video path. `†` = the aspect
ratio is sent for text-to-video only (`aspect: "text"` or `omitAspectRatioOnI2v`). Resolutions in
brackets are the values fal receives when they differ from the app's.

| Model | Id | fal endpoints | t2v | i2v | Last frame | Audio | Resolutions | Durations (s) | Aspect ratios |
|---|---|---|:-:|:-:|:-:|:-:|---|---|---|
| **Gemini Omni Flash 1.1** <sub>NEW</sub> | `fal/gemini-omni-flash-1.1` | `google/gemini-omni-flash/v1.1/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | – | 720p / 1080p / 4K [`4k`] (default 720p) | 3–10 (default 8) | 16:9, 9:16 |
| **Kling O3 Pro** <sub>NEW</sub> | `fal/kling-o3-pro` | `fal-ai/kling-video/o3/pro/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | ✓ | not sent | 3–15 (default 5) | 16:9, 1:1, 9:16 † |
| **Kling 3.0 Turbo** <sub>FAST</sub> | `fal/kling-v3-turbo-pro` | `fal-ai/kling-video/v3/turbo/pro/text-to-video` · `…/image-to-video` | ✓ | ✓ | – | – | not sent | 3–15 (default 5) | 16:9, 1:1, 9:16 † |
| **PixVerse 6** <sub>NEW</sub> | `fal/pixverse-v6` | `fal-ai/pixverse/v6/text-to-video` · `…/image-to-video` | ✓ | ✓ | – | ✓ ¹ | 720p / 1080p (default 720p) | 1–15 (default 5) | 21:9, 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 † |
| **Vidu Q4** <sub>NEW</sub> | `fal/vidu-q4` | `fal-ai/vidu/q4/image-to-video` | – | ✓ | – | – | 720p / 1080p / 2K / 4K (default 720p) | 3–16 (default 5) | not sent (follows the frame) |
| **LTX 2.3** | `fal/ltx-2.3` | `fal-ai/ltx-2.3/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | ✓ | 1080p / 2K [`1440p`] / 4K [`2160p`] (default 1080p) | 6, 8, 10 (default 6) | 16:9, 9:16 |
| **Luma Ray 3.2** | `fal/luma-ray-3.2` | `luma/agent/ray/v3.2/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | – | 720p / 1080p (default 720p) | 5, 10 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 |

¹ Sent as `generate_audio_switch`; the others use `generate_audio`.

Durations go out as numbers (Gemini Omni Flash, PixVerse, Vidu, LTX), strings (`"5"`, Kling) or
seconds (`"5s"`, Luma). None of these takes style references (`caps.references: false`).

**Motion control** (`caps.motionControl`): a character image plus a reference video, and an optional
prompt. The clip copies the video's movement and is as long as the video. There is no duration,
resolution or aspect ratio choice, no audio and no style reference. The reference video is MP4, MOV
or WebM up to 90 MB, 3 s or longer, and at most 30 s when the character follows the video's
orientation (the default) or 10 s when it follows the image's.

| Model | Id | fal endpoint |
|---|---|---|
| **Kling 3.0 Motion Control** <sub>NEW</sub> | `fal/kling-v3-pro-motion-control` | `fal-ai/kling-video/v3/pro/motion-control` |
| **Kling 3.0 Motion Control Standard** | `fal/kling-v3-standard-motion-control` | `fal-ai/kling-video/v3/standard/motion-control` |

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

### Models on both

These are in the OpenRouter tables above and also have a fal route. With both keys, Settings decides
who runs them (OpenRouter by default); with one key, that provider does. The options are the same
whoever runs them (OpenRouter's live values for video, the curated ones for images), mapped onto
fal's fields. Style references are never sent to fal.

- **Nano Banana Pro**: `fal-ai/nano-banana-pro` · `fal-ai/nano-banana-pro/edit`; `image_urls`,
  `aspect_ratio`, `resolution` 1K / 2K / 4K.
- **Nano Banana 2**: `fal-ai/nano-banana-2` · `fal-ai/nano-banana-2/edit`; `image_urls`,
  `aspect_ratio`, `resolution` 1K / 2K.
- **GPT Image 2**: `openai/gpt-image-2` · `openai/gpt-image-2/edit`; `image_urls`, `image_size`
  (1:1 `square_hd`, 2:3 832×1216, 3:2 1216×832).
- **Seedance 2.5**: `bytedance/seedance-2.5/text-to-video` · `…/image-to-video`; `duration` as a
  string, `aspect_ratio` (not with a frame), `resolution` 480p / 720p, `end_image_url`,
  `generate_audio`.
- **MiniMax H3**: `minimax/h3/text-to-video` · `…/image-to-video`; `duration` as a number,
  `aspect_ratio` for text-to-video, `resolution: "2K"`, `end_image_url`. The audio toggle is not sent.
- **MiniMax H3 Max**: `minimax/h3-max/text-to-video` · `…/image-to-video`; as H3, with `resolution`
  `"480P"` / `"768P"` and `prompt_expansion_mode: "balanced"`.
- **Kling 3.0 Pro**: `fal-ai/kling-video/v3/pro/text-to-video` · `…/image-to-video`;
  `start_image_url`, `end_image_url`, `duration` as a string, `aspect_ratio` for text-to-video,
  `generate_audio`, no `resolution`.
- **Kling 3.0 Standard**: `fal-ai/kling-video/v3/standard/text-to-video` · `…/image-to-video`; as
  Kling 3.0 Pro.

## Live catalog and discovered models

At startup the browser reads `GET /api/v1/videos/models` and `GET /api/v1/images/models`. Both are
public, so this works before a key is set. The result is cached 10 minutes and mirrored to
localStorage, so a model OpenRouter adds shows up within 10 minutes.

**Video.** For every curated model the live entry replaces durations, resolutions, aspect ratios,
image-to-video and last-frame support, audio and the price. The curated entry keeps the name,
featured flag, badges, description, `realFaces`, `references`, `omitAspectRatioOnI2v`, `verified`
and a text-to-video quirk. A curated model OpenRouter no longer lists disappears from the picker,
unless it has a fal route: it then stays, as a fal-only model. fal-only models are never looked up
in OpenRouter's catalogs. Every other listed model is **discovered**:

| Field | Value |
|---|---|
| `name` | OpenRouter's `name` with the leading `Vendor: ` prefix stripped. |
| `provider` | The slug's vendor when it is a known `ModelProvider` (`bytedance-seed` counts as `bytedance`), otherwise `openrouter`. |
| `description` | `New on OpenRouter. Not tested in this app yet.` |
| `featured` / `badges` | `false` / `["new"]`; listed under "All models" with an "Unverified" hint. |
| options and price | From the live catalog, as for curated models. Values the app has no option for (`8K`, `5:4`) are dropped. |
| `caps.references` | `false`: style references are not sent until someone verifies them. |
| `hidden` | `true` when the catalog lists no duration (editing, upscaling, avatars). |

**Image.** Curated models keep their verified routes and options (`chat` and `images` do not take
the catalog's fields one to one), and stay listed as they are when OpenRouter stops listing them. Every other model in `/api/v1/images/models` is discovered and
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
   entry with `id: "fal/<name>"`, `falOnly: true`, a `fal` route, `verified: false` and empty
   `estCostUsd` / `estCostPerSecUsd`; image models also take `endpoint: "fal"`. Fill `caps`,
   durations, resolutions and aspect ratios from the schema's enums.
3. Fill the route (fields below). If the endpoint needs something `FalImageRoute` / `FalVideoRoute`
   cannot say, extend the type in `src/shared/types.ts` and `src/client/lib/fal-payloads.ts`, with a
   case in `src/client/lib/__tests__/fal.test.ts`.
4. `src/client/lib/__tests__/catalog.test.ts` ("fal routes") checks the route against the model: a
   fal-only model has a route, every mode the caps offer has an endpoint, `lastFrame` needs
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
| `endpoint` | `"chat"` → `chat/completions` with `modalities: ["image","text"]` (result in `choices[0].message.images[0].image_url.url` as a data URL). `"images"` → `images/generations` (result in `data[0].b64_json`). `"native"` → `POST /api/v1/images` with the catalog's own fields; options then come from the live catalog. `"fal"` → not on OpenRouter at all (fal-only). Gemini/GPT-5 image models are `chat`, Krea and `gpt-image-2` are `images`, everything discovered is `native`. |
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
| `falOnly` | Not on OpenRouter: runs only with a fal key, and is never looked up in OpenRouter's catalogs. |

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
| `durations` | Either a range `{ min, max, step? }` (every step is allowed, e.g. Seedance 4–30 s) or an explicit list `{ options: [4, 6, 8] }` (Veo, Kling O1, Hailuo 2.3). The stepper snaps to these (`snapDuration`). |
| `defaultDuration` | Preselected duration. |
| `resolutions` / `defaultResolution` | Values the provider accepts for `resolution`. Some accept exactly one (H3 → `2K`, Kling 3.0 Pro → `720p`); if the list is empty the app doesn't send `resolution` at all. |
| `aspectRatios` | Subset of `VideoAspectRatio`. |
| `omitAspectRatioOnI2v` | Set when the provider returns 400 if `aspect_ratio` is sent together with `frame_images` (all Seedance models). The output then follows the input image. |
| `estCostPerSecUsd` | USD per second keyed by resolution. Multiplied by the duration for the estimate. |
| `verified` | `true` only after the checklist below. |
| `hidden` | Keep in the catalog but don't list it (video-to-video, avatar models). |
| `discovered` | Set by the browser (`src/client/lib/catalog.ts`), never in `models.ts`: OpenRouter lists the model but the curated catalog does not (see above). |
| `fal` | How fal serves the model (`FalVideoRoute`): `textToVideo`, `imageToVideo` and `motionControl` endpoint ids; `imageField` (first frame as `image_url`, the default, or `start_image_url`); `endImage` (the last frame goes in `end_image_url`); `duration` (`"number"` → `5`, `"string"` → `"5"`, `"seconds"` → `"5s"`, absent = never sent); `aspect` (`"always"`, `"text"` = text-to-video only, absent = never sent); `resolutions` (app value → fal's, e.g. `{ "480p": "480P" }`; absent = never sent); `audio` (`"generate_audio"` or `"generate_audio_switch"`); `extra` (fixed fields). See [FAL.md](FAL.md#video-fields-buildfalvideopayload). |
| `falOnly` | Not on OpenRouter: runs only with a fal key, and is never looked up in OpenRouter's catalogs. The browser also sets it on a curated model with a `fal` route that OpenRouter stopped listing. |

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
