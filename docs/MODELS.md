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

Curated today: 28 image models (10 of them fal-only, 1 [on APIMart only](#apimart-only-image-models), 1 [on kie.ai only](#kieai-only-image-models)) and 50 video models, of which 48 are offered
(20 fal-only, 1 [on APIMart only](#apimart-only-video-models), 8 of the 48 are [video editors](#video-editing)) and 2
are hidden.

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
| **MiniMax H3 Image** <sub>NEW</sub> | `minimax/minimax-h3-image` | `native` | ✓ | ✓ (8) | 1K / 2K / 4K | all 11 | none ² | – |
| **Seedream 5.5** <sub>NEW</sub> | `bytedance-seed/seedream-5-5` | `native` | ✓ | ✓ (8) | 1K / 2K | all 11 | 1K $0.02 · 2K $0.035, + $0.008 a reference ³ | – |
| **MAI-Image-2.7** <sub>NEW</sub> | `microsoft/mai-image-2.7` | `native` | ✓ | ✓ (5) | 1K * | auto, 1:1, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9 | none ⁴ | – |
| **Krea 2 Large** | `krea/krea-2-large` | `images` | ✓ | – | 1K * | 1:1 | 1K $0.06 | ✓ |
| **Krea 2 Medium** | `krea/krea-2-medium` | `images` | ✓ | – | 1K * | 1:1 | 1K $0.04 | – |
| **Krea 2 Turbo** <sub>FAST</sub> | `krea/krea-2-medium-turbo` | `images` | ✓ | – | 1K * | 1:1 | 1K $0.02 | – |

¹ Two of OpenAI's GPT Image 2.6 tiers (4 Nov 2026), Flare for speed and Sunburst for detail, on OpenRouter, fal,
[kie.ai](#kieai) and APIMart ([models on both](#models-on-both)). They are the curated `native` models: their ratios, sizes and
reference count come from OpenRouter's image catalog once it arrives (the values here are the catalog's on
5 Nov 2026: no `resolution`, 16 references, which the app caps at 8). `quality` (auto to max) and `background`
are left at OpenRouter's defaults. Every provider bills them in tokens and gives no per-image price, so
there is no estimate; the cost of each run is recorded.

² MiniMax's image model (10 Nov 2026), text to image and edits from up to 16 references, on OpenRouter, fal
([models on both](#models-on-both)), kie.ai ([kie.ai](#kieai)) and APIMart ([APIMart](#apimart)); the Highspeed variant (`minimax/minimax-h3-image-highspeed`) is not curated.
Also a curated `native` model: the values here are OpenRouter's catalog on 11 Nov 2026 (`resolution` 1K / 2K / 4K,
16 references, which the app caps at 8). OpenRouter also lists ratios the app has no option for (1:2, 2:1, 1:3, 3:1,
2.35:1, 5:2, 5:7, 7:5, 9:19.5, 19.5:9, 9:20, 20:9, 9:21). `n` and `output_format` are left at their defaults, and so
is prompt enhancement (on; OpenRouter passes `disable_prompt_enhanced` through). OpenRouter and fal bill it in tokens
($2.30 / $1.50 / $3.80 per 1M input text / input image / output image tokens) with no per-image price, so neither has
an estimate. kie.ai (docs and pricing API read 12 Nov 2026) takes `aspect_ratio` (`auto` by default: the prompt
rewriter's pick on text to image, the first reference's ratio on an edit), `resolution` 1K / 2K / 4K and 1 to 16
`image_urls` on `minimax-h3/image-edit`, and charges 1.8 credits ($0.009) an image at 1K or 2K, 5.5 ($0.0275) at 4K,
plus 0.5 ($0.0025) for each reference image on an edit (`KIE_PRICES`); being the one priced, it runs the model whenever
a kie.ai key is set. APIMart (docs and price catalog read 13 Nov 2026) takes `size` (the ratio, `auto` allowed),
`resolution` 1K / 2K / 4K (always sent: its default is 4K) and up to 16 `image_urls` on its one `minimax-h3-image`
model, and bills it in tokens too ($2.14 / $1.43 / $3.57 at Gold), so it has no estimate either. The cost of each run
is recorded on OpenRouter, kie.ai and APIMart.

³ ByteDance's Seedream 5.5, on OpenRouter (listed 12 Nov 2026), fal ([models on both](#models-on-both)), [kie.ai](#kieai)
and [APIMart](#apimart). The id is OpenRouter's slug, as for every model OpenRouter serves; it was the app's own
`bytedance/seedream-5.5` while only kie.ai and APIMart had it, so a composer left on that id falls back to the default
model, and older runs keep it. Also a curated `native` model: the values here are OpenRouter's catalog on 13 Nov 2026
(`resolution` 1K / 1.5K / 2K, of which the app lists 1K and 2K; 10 references, which the app caps at 8; `n` 1).
OpenRouter also lists ratios the app has no option for (1:2, 2:1, 9:19.5, 19.5:9, 9:20, 20:9, 9:21). `background`
(`transparent` too), `output_format` and `seed` are left at their defaults. OpenRouter's price (its `/endpoints`, 13 Nov
2026) is $0.02 an image, $0.035 at its `high_resolution` rate (2K), plus $0.008 for each reference image
(`estCostPerReferenceUsd`). kie.ai and APIMart (APIMart's docs and pricing API read 13 Nov 2026, as `seedream-5-5`;
kie's docs and pricing API 11 Nov 2026) take the ratio (APIMart as `size` with `resolution`, and for `auto` the size
alone as `size`, since APIMart reads `size: "auto"` as 2K; kie as `aspect_ratio`, `auto` on edits only, so a
text-to-image run at `auto` sends 1:1 there), but neither 4:5 nor 5:4, so those run on OpenRouter or fal; 1K or 2K (as
`resolution` on APIMart, `size` on kie); and up to 10 references as `image_urls` (kie: 10 MB each). APIMart makes text
to image and edits with one model, kie with two. Not sent there: `output_format`, `background`, APIMart's
`layer_decomposition`, `optimize_prompt_options`, `watermark` and `nsfw_check`, and kie's `nsfw_checker`; kie's layer
decomposition model is not wired. kie charges 3.6 credits ($0.018) an image at 1K (and 1.5K), 6.3 ($0.0315) at 2K,
plus 1.44 ($0.0072) for each reference image on an edit (`KIE_PRICES`). APIMart charges $0.013 at 1K (and 1.5K),
$0.02275 at 2K, plus $0.0052 for each reference image, the first included (`APIMART_PRICES`), the cheapest of the four:
with an APIMart key it runs there, and otherwise with a kie.ai key on kie. kie also wants a prompt of 5 characters or more.

⁴ Microsoft AI's MAI-Image-2.7 (14 Nov 2026), text to image and edits, on OpenRouter and fal
([models on both](#models-on-both)). The Flash variant (`microsoft/mai-image-2.7-flash`) is not curated and stays a
discovered model, as do MAI-Image 2.5 and 2.6. Also a curated `native` model: the values here are OpenRouter's catalog
on 18 Nov 2026 (no `resolution`, so the output is the provider's default and listed as 1K; 5 references; `n` 1; no
21:9, 4:5 nor 5:4). `background` (`transparent` too) and the `web_grounding` passthrough are left at their defaults.
OpenRouter (its `/endpoints`, Azure) and fal both bill it in tokens ($5 / $8 / $34 per 1M input text / input image /
output image tokens) with no per-image price, so neither has an estimate; the cost of each run on OpenRouter is
recorded. Not on kie.ai, and not on APIMart yet: its model page (`apimart.ai/model/mai-image-2-7`) is up, but its
pricing API answers `model_not_found` for `mai-image-2.7` and `mai-image-2-7`, its catalog and docs list MAI-Image-2.6
only, and the app has no APIMart builder for MAI (18 Nov 2026).

Every other image model OpenRouter lists (Nano Banana 2.1, Seedream 5, FLUX.3, Qwen Image 3,
GPT Image 2.5, Recraft, MAI Image and more; about 45 on 14 Oct 2026) is offered as a discovered
model through the native `POST /api/v1/images` (`endpoint: "native"`). See
[Live catalog and discovered models](#live-catalog-and-discovered-models).

Not on OpenRouter: the [fal-only image models](#fal-only-image-models), GPT Image 2.6, which runs on APIMart only
(see [APIMart-only image models](#apimart-only-image-models)), and GPT Image 2.6 Economy, which runs on kie.ai only (see
[kie.ai-only image models](#kieai-only-image-models)); GPT Image 2.6 Flare and Sunburst, above, are separate models.

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

Not on OpenRouter: Gemini Omni Flash 1.1, Kling 4.0, Kling 3.0 Motion Control, FLUX.3 Max and FLUX.3 Video Draft run on fal, Gemini Omni Flash 1.2 and PixVerse 6 Max on fal, kie.ai and APIMart (see
[fal models](#fal-models)); Seedance 1.5 Pro, which OpenRouter retired on 11 Nov 2026, runs on APIMart only (see
[APIMart-only video models](#apimart-only-video-models)); Higgsfield Genjutsu and Seedance 2.5 Draft and Edit are not in the app.
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
times OpenRouter's rate on fal). GPT Image 2.6 Flare and Sunburst, MiniMax H3 Image and MAI-Image-2.7 have no fal
price: fal bills them in tokens and gives no per-size figure for them. Seedream 5.5's edits also bill each reference image. Kling
Image 4.0 has a fal price at 2K only, so a 4K run on fal has no estimate (kie.ai prices both sizes). Ideogram 4.6 is priced at fal's default medium quality, up
to 2K; an `auto` edit of a larger source costs more than its estimate. fal reports no cost with a result, so runs on fal record none.

### fal-only video models

Endpoints are fal endpoint ids; `…/image-to-video` repeats the text-to-video path. `†` = the aspect
ratio is sent for text-to-video only (`aspect: "text"` or `omitAspectRatioOnI2v`). Resolutions in
brackets are the values fal receives when they differ from the app's.

| Model | Id | fal endpoints | t2v | i2v | Last frame | Audio | Resolutions | Durations (s) | Aspect ratios |
|---|---|---|:-:|:-:|:-:|:-:|---|---|---|
| **Gemini Omni Flash 1.2** <sub>NEW</sub> | `google/gemini-omni-flash-1.2` | `google/gemini-omni-flash/v1.2/text-to-video` · `…/image-to-video` ⁵ | ✓ | ✓ | ✓ | – | 720p / 1080p / 4K [`4k`] (default 720p) | 3–15 (default 8), 3–10 with a last frame | 16:9, 9:16 |
| **Gemini Omni Flash 1.1** <sub>NEW</sub> | `fal/gemini-omni-flash-1.1` | `google/gemini-omni-flash/v1.1/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | – | 720p / 1080p / 4K [`4k`] (default 720p) | 3–10 (default 8) | 16:9, 9:16 |
| **Kling 4.0** <sub>NEW</sub> | `fal/kling-v4` | `kling/v4/text-to-video` · `…/image-to-video` ⁴ | ✓ | ✓ | ✓ | – ⁴ | 720p / 1080p (default 720p) | 3–30 (default 5) | 21:9, 16:9, 1:1, 9:16 † |
| **FLUX.3 Max** <sub>NEW</sub> | `fal/flux-3-max` | `blackforestlabs/flux-3-max/text-to-video` · `…/image-to-video` ³ | ✓ | ✓ | ✓ | ✓ | 720p / 1080p (default 720p) | 5–20 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 † |
| **FLUX.3 Video Draft** <sub>NEW</sub> <sub>FAST</sub> | `fal/flux-3-video-draft` | `blackforestlabs/flux-3/text-to-video/draft` · `…/image-to-video/draft` · `…/first-last-frame-to-video/draft` ² | ✓ | ✓ | ✓ | ✓ | 720p (not sent) | 5–20 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 † |
| **Kling O3 Pro** <sub>NEW</sub> | `fal/kling-o3-pro` | `fal-ai/kling-video/o3/pro/text-to-video` · `…/image-to-video` | ✓ | ✓ | ✓ | ✓ | not sent | 3–15 (default 5) | 16:9, 1:1, 9:16 † |
| **Kling 3.0 Turbo** <sub>FAST</sub> | `fal/kling-v3-turbo-pro` | `fal-ai/kling-video/v3/turbo/pro/text-to-video` · `…/image-to-video` | ✓ | ✓ | – | – | not sent | 3–15 (default 5) | 16:9, 1:1, 9:16 † |
| **PixVerse 6** <sub>NEW</sub> | `fal/pixverse-v6` | `fal-ai/pixverse/v6/text-to-video` · `…/image-to-video` | ✓ | ✓ | – | ✓ ¹ | 720p / 1080p (default 720p) | 1–15 (default 5) | 21:9, 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 † |
| **PixVerse 6 Max** <sub>NEW</sub> | `pixverse/pixverse-v6-max` | `pixverse/v6/max/text-to-video` · `…/image-to-video` ⁶ | ✓ | ✓ | – | ✓ ¹ | 720p / 1080p (default 720p) | 1–15 (default 5) | 21:9, 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 † |
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
⁵ Google's Gemini Omni 1.2 Flash, listed on fal on 5 Nov 2026 (schemas and prices read 6 Nov 2026), also on kie.ai and
APIMart.
$0.0819 / $0.1229 / $0.2457 per second at 720p / 1080p / 4K; sound is always on and included, so there is no Sound
toggle (`caps.audio: false`). The ratio goes with a frame too. A last frame caps the clip at 10 s (`endImageMaxSec`).
fal also offers 360p (not listed, the app has none). `…/reference-to-video` is not used, since fal never gets style
references, and `…/extend` is not used, since the app has no way to extend a clip; `…/edit` and `…/upscale` are models
of their own ([Video editing](#video-editing), [Upscaling](#upscaling)).
On APIMart it is `gemini-omni-1.2-flash` (read 30 Oct 2026; [APIMART.md](APIMART.md) has the fields). There is no
duration field: the prompt sets the length (about 3–10 s, not guaranteed), so APIMart runs only at the default, 8 s, a
placeholder, and any other length goes to fal or kie.ai. A first frame, a first and a last frame (`first_frame_image`,
`last_frame_image`), or style references (`image_urls`; APIMart takes 10 images in all, frames included, the app sends
frames or references, not both). APIMart also offers 360p (not listed; 1080p and 4K are upscaled) and reference clips,
edit and extend through `video_urls` and `metadata.task`, which the app does not use (no video input on APIMart). It
lists no price yet, so APIMart has no estimate and the cost of each run is recorded.
On kie.ai it is `google/gemini-omni-flash-1-2` (read 10 Nov 2026; [KIE.md](KIE.md) has the fields): `duration` 3–15 s
(3–10 s with a last frame), the ratio with a frame too, and style references as `image_urls` (kie takes 6, the app
sends 4 at most), never with frames. kie lists 9 / 10 / 22 credits a second at 720p / 1080p / 4K ($0.045 / $0.05 /
$0.11), less than fal at every resolution, so with a kie.ai key a run goes there. Not used on kie: 360p (4 credits a
second), `aspect_ratio: "auto"`, `seeds` and its video-edit mode (`video_list`). With fal and APIMart keys only, a run
goes to fal, unless it has style references, which fal does not take.
OpenRouter's `google/gemini-omni-1.2-flash` (5 Nov 2026) is another slug: like `google/gemini-omni-1.1-flash`, it is
[discovered](#live-catalog-and-discovered-models) as a model of its own, with OpenRouter's options and prices.
⁶ The top quality tier of PixVerse 6 (24 Oct 2026), also on kie.ai and APIMart: text-to-video and a first frame only (no
last frame, references, extension or multi-shot); with a frame the clip follows the image's ratio. fal's endpoints sit
under `pixverse/`, not `fal-ai/pixverse/`, and take PixVerse 6's fields (schemas read 12 Nov 2026); `style`,
`thinking_type`, `negative_prompt`, `seed` and `generate_multi_clip_switch` are not sent. Every provider also offers
360p and 540p, which the app does not list (nor for PixVerse 6). Per second without / with sound, at 720p then 1080p:
fal $0.099 / $0.135 and $0.198 / $0.252 (read 12 Nov 2026); kie 8.8 / 12 and 17.6 / 22.4 credits ($0.044 / $0.06,
$0.088 / $0.112); APIMart $0.0391 / $0.0533 and $0.0782 / $0.0996 (Gold tier; kie and APIMart read 26 Oct 2026).
APIMart is the cheapest and fal the dearest of its four providers (Revana included), so a run goes to fal only when
none of the others has a key. APIMart takes a frame without a prompt, kie does not.

Durations go out as numbers (Gemini Omni Flash, Kling 4.0, FLUX.3 Max, FLUX.3 Video Draft, PixVerse, Vidu, LTX), strings (`"5"`, Kling) or
seconds (`"5s"`, Luma). None of these takes style references (`caps.references: false`), except Kling 4.0,
which takes them on kie.ai and APIMart, and Gemini Omni Flash 1.2, on kie.ai and APIMart too (never on fal).

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

All are 1K only (no size choice), except Kling Image 4.0 (2K / 4K, sent as `resolution`). References are sent as a
list (`image_urls`) or a single `image_url`. "preset" = the aspect ratio goes out as one of fal's `image_size` presets
(`square_hd`, `landscape_4_3`, `portrait_4_3`, `landscape_16_9`, `portrait_16_9`).

| Model | Id | fal endpoints (text-to-image · edit) | t2i | i2i (max refs) | Aspect ratios | Aspect sent as |
|---|---|---|:-:|:-:|---|---|
| **Kling Image 4.0** <sub>NEW</sub> ¹ | `fal/kling-image-v4` | `kling/v4/text-to-image` · `kling/v4/image-to-image` | ✓ | ✓ (8, `image_urls`) | auto, 1:1, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9, 21:9 | `aspect_ratio` |
| **FLUX.1 Kontext Pro** | `fal/flux-kontext-pro` | `fal-ai/flux-pro/kontext/text-to-image` · `fal-ai/flux-pro/kontext` | ✓ | ✓ (1, `image_url`) | auto, 21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16 | `aspect_ratio` |
| **FLUX 1.1 Pro Ultra** | `fal/flux-1.1-pro-ultra` | `fal-ai/flux-pro/v1.1-ultra` | ✓ | – | auto, 21:9, 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16 | `aspect_ratio` |
| **Ideogram 4.6** <sub>NEW</sub> ² | `fal/ideogram-4.6` | `ideogram/v4.6` · `ideogram/v4.6/edit` | ✓ | ✓ (1, `image_url`) | auto, 1:1, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9, 5:4, 4:5, 21:9 | preset, else explicit `image_size` |
| **Ideogram 4.5** <sub>NEW</sub> | `fal/ideogram-4.5` | `ideogram/v4.5` · `ideogram/v4.5/edit` | ✓ | ✓ (1, `image_url`) | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |
| **GPT Image 1.5** | `fal/gpt-image-1.5` | `fal-ai/gpt-image-1.5` · `fal-ai/gpt-image-1.5/edit` | ✓ | ✓ (4, `image_urls`) | auto, 1:1, 3:2, 2:3 | `image_size` `1024x1024` / `1536x1024` / `1024x1536` |
| **Qwen Image Edit 2511** | `fal/qwen-image-edit-2511` | edit only: `fal-ai/qwen-image-edit-2511` | – | ✓ (3, `image_urls`) | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |
| **Z-Image Turbo** <sub>FAST</sub> | `fal/z-image-turbo` | `fal-ai/z-image/turbo` | ✓ | – | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |
| **FLUX.1 [dev]** | `fal/flux-dev` | `fal-ai/flux/dev` | ✓ | – | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |
| **FLUX.1 [schnell]** <sub>FAST</sub> | `fal/flux-schnell` | `fal-ai/flux/schnell` | ✓ | – | auto, 1:1, 4:3, 3:4, 16:9, 9:16 | preset |

¹ Kuaishou's Kling Image 4.0 (17 Nov 2026), read from fal's schemas on 18 Nov 2026; also on [kie.ai](#kieai), not on
OpenRouter or APIMart yet. 2K (fal's default) or 4K as `resolution`; fal's 8K is not offered (`ImageSize` has no 8K). fal takes 10 references
(each at least 300 px a side, 2:5 to 5:2), which the app caps at 8; the prompt can name them `@Image1`, `@Image2`, ….
`result_type: "series"` / `series_amount` (a coherent set of 2 to 10), `num_images`, `elements` and the
`kling/v4/long-image` endpoint are not wired. fal lists $0.063 an image, Kling's own 2K price, and no 4K figure, so a
4K run has no estimate; Kling's own list also charges $0.094 at 4K and $0.003 for each reference image, which fal may
pass on. kie.ai (docs and pricing API read 20 Nov 2026) runs text to image and edits with one model, `kling-4-0/image`:
the same nine ratios as `aspect_ratio` (`auto` sent as is), `resolution` as `2k` / `4k` (its 8K is not offered either)
and up to 10 `image_urls` (JPG or PNG, 20 MB each), which the prompt names `@image_1`, `@image_2`, … there, not
`@Image1`. kie charges 11.3 credits ($0.0565) an image at 2K and 17 ($0.085) at 4K, plus 0.5 ($0.0025) for each
reference image (`KIE_PRICES`). With both keys, kie runs every 4K image, which fal does not price, and a 2K one unless
its references bring kie's total within half a cent of fal's (a tie, which fal, listed first, runs) or above it (one
image with 5 references or more). `mode:
"series"`, `count`, `elements` and `kling-4-0/long-image` are not wired on kie either. kie records the cost of each run.

² Ideogram 4.6 (19 Nov 2026), read from fal's schemas on 20 Nov 2026; not on OpenRouter, kie.ai or APIMart yet. Replicate
has it (`ideogram-ai/ideogram-4-6`, also $0.06 at medium up to 2K) but is not routed (see [REPLICATE.md](REPLICATE.md)).
Wired like Ideogram 4.5: 1K, the ratio as a preset or (2:3, 3:2, 4:5, 5:4, 21:9) an explicit size of about one megapixel,
which 4.6 accepts (multiples of 32, 256 to 4096 px a side, 1:6 to 6:1); `auto` sends none, so fal picks about 2K, and an
edit keeps its source's size. The edit takes the image to change as `image_url` and up to 4 more as
`reference_image_urls`; only `image_url` is sent. Not wired: sizes up to 4K, `quality` (very low, low, medium, high;
fal's default medium is used), `reference_image_urls`, `mask_url`, `edit_precision` (`high`: Precise Edit),
`context_window`, `background` (transparent) and `num_images`. $0.06 an image at medium up to 2K (4,194,304 px) on both
endpoints; above it $0.12, or $0.20 for an edit, which an `auto` edit of a source larger than 2048 × 2048 pays.

### APIMart-only image models

Not on OpenRouter, fal nor kie.ai: this runs only with an APIMart key (fields and rules in
[APIMART.md](APIMART.md)). The id is the app's own (`<maker>/<name>`). It is not verified yet.

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

### APIMart-only video models

Not on OpenRouter, fal nor kie.ai: this runs only with an APIMart key (fields and rules in [APIMART.md](APIMART.md)).
The id is OpenRouter's old slug, kept so that earlier runs still find their model. It is not verified yet. `†` = the
aspect ratio is sent for text-to-video only.

| Model | Id | APIMart model | t2v | i2v | Last frame | Audio | Real faces | Resolutions | Durations (s) | Aspect ratios | Est. cost / second |
|---|---|---|:-:|:-:|:-:|:-:|:-:|---|---|---|---|
| **Seedance 1.5 Pro** | `bytedance/seedance-1-5-pro` | `seedance-1-5-pro` ¹ | ✓ | ✓ | ✓ | ✓ | ✗ | 480p / 720p / 1080p (default 1080p) | 4–12 (default 5) | 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 † | 480p $0.0204 · 720p $0.044 · 1080p $0.108 |

¹ ByteDance's previous Seedance. OpenRouter retired it on 11 Nov 2026 (`/api/v1/videos/models` no longer lists it,
read 12 Nov 2026), and fal retired its `fal-ai/bytedance/seedance/v1.5/pro/…` endpoints the same day, so the app no
longer sends it to OpenRouter, even before the live catalog arrives. On APIMart: `aspect_ratio` (16:9 is sent with a
frame, APIMart's default), `resolution`, `duration` 4–12, `audio` (on by default), and a first frame, or a first and a
last, as `image_urls`; no style references. OpenRouter's 9:21 is not listed, APIMart has none. Not sent: `seed`,
`camerafixed` and `nsfw_check`. The estimate is APIMart's Gold-tier price read on 20 Oct 2026, the same with or
without sound; APIMart's price catalog no longer lists the model (12 Nov 2026), though its doc page still does. The
cost of each run is recorded.

### kie.ai-only image models

Not on OpenRouter, fal nor APIMart: this runs only with a kie.ai key (fields and rules in [KIE.md](KIE.md)). The id is
the app's own (`<maker>/<name>`). It is not verified yet.

| Model | Id | kie models | t2i | i2i (max refs) | Sizes | Aspect ratios | Est. cost / image |
|---|---|---|:-:|:-:|---|---|---|
| **GPT Image 2.6 Economy** <sub>NEW</sub> | `openai/gpt-image-2.6-economy` | `gpt-image-2-6/economy-text-to-image` · `economy-image-to-image` ¹ | ✓ | ✓ (8, `input_urls`) | 1K (not sent) | auto, 1:1, 3:2, 2:3, 4:3, 16:9, 9:16, 21:9 | 1K $0.025 |

¹ The cost-efficient GPT Image 2.6 variant, read from kie's docs and pricing API on 6 Nov 2026; not on OpenRouter, fal,
APIMart or Revana. It generates at 1K only, with no `resolution` field, and has no 3:4. kie takes 16 references, the app
sends 8 at most. Not sent: `background`, `output_format` (`png` by default), `frame_count` and `frame_duration_ms`. 5
credits ($0.025) an image, with or without references (`KIE_PRICES`).

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
| Gemini Omni Flash 1.1, 1.2 | `google/gemini-omni-flash-1-1`, `google/gemini-omni-flash-1-2` | GPT Image 2.6 Flare ¹ | `gpt-image-2-6/flare-text-to-image` / `flare-image-to-image` |
| Kling 4.0 | `kling-4.0/reference-to-video` (text-to-video, style references), `kling-4.0/keyframe-to-video` (frames) | GPT Image 2.6 Sunburst ¹ | `gpt-image-2-6/sunburst-text-to-image` / `sunburst-image-to-image` |
| PixVerse 6, PixVerse 6 Max, Vidu Q4 | `pixverse-v6/…`, `pixverse-v6-max/…`, `vidu-q4/image-to-video` | GPT Image 2.6 Economy (only here) | `gpt-image-2-6/economy-text-to-image` / `economy-image-to-image` |
| Wan 2.7 Edit | `wan/2-7-videoedit` | Seedream 5.5 | `seedream/5-5-text-to-image` / `5-5-image-to-image` |
| | | MiniMax H3 Image | `minimax-h3/text-to-image` / `image-edit` |
| | | Kling Image 4.0 | `kling-4-0/image` (text to image and edits) |

¹ Read from kie's docs and pricing API on 6 Nov 2026. kie bills both per million tokens at the same rates, with no
per-image price, so they have no `KIE_PRICES` entry and no estimate: in credits, 900 text input, 225 cached text input,
1,440 image input, 360 cached image input, 5,400 image output. kie also takes 2K and 4K, which the app does not list,
since the models' sizes follow OpenRouter's catalog. Not verified end to end.

### Revana

With a Revana key, 36 of these models also run on Revana ([REVANA.md](REVANA.md)), at the prices of its public
list (`REVANA_MODELS`), and a run goes there whenever it is the cheapest. Revana records what each run cost.

### Replicate

With a Replicate key, 37 of these models also run on Replicate as official models ([REPLICATE.md](REPLICATE.md)), at
the list prices on its model pages (`REPLICATE_MODELS`), and a run goes there whenever it is the cheapest. That is
rare: most of its prices equal OpenRouter's or fal's, which win the tie, and Kling 3.0 costs twice as much there.
Like ByteDance's, its calls go through the app's server (Replicate refuses browser calls). It takes images as
inputs only, 4 MB a request, so no video editor, upscaler or motion-control model is routed. Replicate does not
report what a run cost.

### ByteDance

With a ByteDance key, Seedance 2.5, 2.0, 2.0 Fast and 2.0 Mini also run on ByteDance's own platform, BytePlus
ModelArk ([BYTEDANCE.md](BYTEDANCE.md)), billed per video token at ModelArk's rates (`BYTEDANCE_VIDEO_MODELS`), and a
run goes there whenever it is the cheapest. That is never the case with every key set (OpenRouter charges the same and
wins the tie; APIMart and Revana are cheaper), but it beats fal and kie.ai on Seedance 2.5 and 2.0. Its calls go
through the app's server, as Replicate's do (ModelArk refuses browser calls). No image model is routed: the
Seedream models ModelArk has (5.0 Pro, Flash and Lite, 4.5, 4.0) are not in the curated catalog, and the catalog's
Seedream 5.5 is not on ModelArk. Not verified with a real key.

| Model | ModelArk id | Resolutions | Durations |
|---|---|---|---|
| Seedance 2.5 | `dreamina-seedance-2-5-260628` | 480p, 720p (1080p on ModelArk, not in the catalog) | 4–30 s |
| Seedance 2.0 | `dreamina-seedance-2-0-260128` | 480p, 720p, 1080p, 4K | 4–15 s |
| Seedance 2.0 Fast | `dreamina-seedance-2-0-fast-260128` | 480p, 720p | 4–15 s |
| Seedance 2.0 Mini | `dreamina-seedance-2-0-mini-260615` | 480p, 720p | 4–15 s |

### APIMart

With an APIMart key, these also run on APIMart ([APIMART.md](APIMART.md)), at its Gold-tier prices
(`APIMART_PRICES`), and a video goes there whenever it is the cheapest for that run. APIMart records what each
run cost. It takes no video input, so editing and motion control never go there.

| Video | APIMart model | Image | APIMart model |
|---|---|---|---|
| Veo 3.1 / Fast / Lite (8 s) | `veo3.1-quality`, `veo3.1-fast`, `veo3.1-lite` | Nano Banana Pro | `gemini-3-pro-image-preview` |
| Seedance 2.5, 2.0, 2.0 Fast, 2.0 Mini, 1.5 Pro (only here) | `seedance-2.5`, `seedance-2.0`, `-fast`, `-mini`, `seedance-1-5-pro` | Nano Banana 2 | `gemini-3.1-flash-image-preview` |
| MiniMax H3, H3 Max, Hailuo 2.3 | `MiniMax-H3`, `MiniMax-H3-Max`, `MiniMax-Hailuo-2.3` | Nano Banana 2 Lite | `gemini-3.1-flash-lite-image-ext` |
| Wan 3.0, Prime, 2.7, 2.6 | `wan3.0-video`, `wan3.0-video-prime`, `wan2.7`, `wan2.6` | Nano Banana | `gemini-2.5-flash-image-preview` |
| Kling 4.0, Kling 3.0 Pro / Standard, Kling O1 | `kling-v4`, `kling-v3` (`pro` / `std`), `kling-video-o1` | GPT Image 2, 2.6 (only here), 2.6 Flare, 2.6 Sunburst | `gpt-image-2`, `gpt-image-2.6`, `gpt-image-2.6-flare`, `gpt-image-2.6-sunburst` |
| PixVerse 6, PixVerse 6 Max, Vidu Q4 | `pixverse-v6`, `pixverse-v6-max`, `viduq4-preview` | FLUX.1 Kontext Pro | `flux-kontext-pro` |
| Gemini Omni Flash 1.1, 1.2, FLUX.3 Video | `gemini-omni-1.1-flash-ext`, `gemini-omni-1.2-flash`, `flux-3-video` | Z-Image Turbo | `z-image-turbo` |
| | | Seedream 5.5 | `seedream-5-5` |
| | | MiniMax H3 Image | `minimax-h3-image` |

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
- **MiniMax H3 Image**: `minimax/h3-image/text-to-image` · `minimax/h3-image/edit`; `image_urls` (fal takes 16),
  and the ratio and size together as an explicit `image_size` (`scaledSize`: about 1, 4 or 16 MP at 1K / 2K / 4K,
  sides in multiples of 64, e.g. 16:9 1344×768 at 1K, 21:9 6272×2688 at 4K; fal takes 0.66 to 20 MP, 1:3 to 3:1).
  `auto` is square at the size without references; with references it is fal's own `auto` (the first image's
  ratio, about 2K), so the size is not sent. `enable_prompt_expansion` (text to image only) is left at fal's
  default (on). No price (see above).
- **Seedream 5.5**: `bytedance/seedream/v5.5/text-to-image` · `bytedance/seedream/v5.5/edit`; `image_urls` (fal takes
  10), and the ratio and size together as an explicit `image_size` (`scaledSize`, as MiniMax H3 Image: e.g. 16:9
  1344×768 at 1K, 2752×1536 at 2K; fal takes 921,600 to 4,624,220 pixels). `auto` is fal's own `auto_1K` / `auto_2K`
  (`autoSizes`), with or without references. `background` (`transparent` with PNG), `output_format` (`png`),
  `num_images`, `watermark` and `enable_safety_checker` are left at fal's defaults; the `/layerize` endpoint is not
  wired. $0.03 an image at 1K and $0.0405 at 2K (fal bills by area: up to 2.61 MP, or above), plus $0.012 for each
  reference image on an edit (read 13 Nov 2026).
- **MAI-Image-2.7**: `microsoft/mai-image-2.7/text-to-image` · `microsoft/mai-image-2.7/edit` (both `active`, read
  18 Nov 2026); `image_urls` (the edit schema takes 5, `maxItems: 5`, though fal's catalog blurb says "up to two input
  images"), and the ratio as one of fal's seven `image_size` presets (`square_hd`, `landscape_4_3`, `portrait_4_3`,
  `landscape_3_2`, `portrait_3_2` from `imageSizes`, `landscape_16_9`, `portrait_16_9`; a custom size must be at least
  768 px a side and 4.19 MP at most). `auto` sends none: fal's `square_hd` without references, a size close to the input
  on an edit. fal's `resolution` 2K is not offered (OpenRouter has no size choice for it), so fal's default 1K applies;
  `background` and `output_format` (`png`) are left at fal's defaults. No price (see above): fal's page gives
  $0.034816 for one 1024 × 1024 output (1,024 image tokens) before input tokens, and no per-size table.
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
| **Gemini Omni Flash 1.2 Edit** <sub>NEW</sub> | `fal/gemini-omni-flash-1.2-edit` | fal | `google/gemini-omni-flash/v1.2/edit` | 720p / 1080p / 4K [`4k`] (default 720p) | up to 15 s | $0.0819 / $0.1229 / $0.2457 per s |
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
the chips become the scale (2x / 4x) or, for ByteDance and Gemini Omni Flash 1.2, the target resolution. One run per Generate.
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
| **Gemini Omni Flash 1.2 Upscale** <sub>NEW</sub> | `fal/gemini-omni-flash-1.2-upscale` | fal | `google/gemini-omni-flash/v1.2/upscale` | 720p / 1080p / 4K (`resolution`, default 1080p); clips up to 15 s | read 6 Nov 2026: $0.041 per s (360p to 720p, 720p to 1080p), $0.0819 (360p to 1080p), $0.1638 (720p or 1080p to 4K) |

Topaz's Creative mode: images on `topaz/upscale/image/generative` (Wonder 3, $0.08 per started 8 MP out), video on
`topaz/upscale/video/generative` (Starlight Precise 2.6, $0.12/s up to 1080p out, $0.26/s above). Topaz video asks
fal for H.264 (`H264_output`); fal's default, H.265, does not play in every browser.

Gemini Omni Flash 1.2's target must be above the source's resolution, says fal's schema; the app does not check it, and
a refusal from fal is shown as it comes. It bills by the source and the target, so the estimate needs the source's size; a pair fal's page does not list
(360p to 4K, or a source of another size) has no estimate.

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
unless it has a fal, kie.ai, APIMart or Revana route: it then stays, off OpenRouter. A model known to be gone
(Seedance 1.5 Pro) is marked `offOpenRouter` in the catalog itself, so it never goes to OpenRouter, even before
the live catalog arrives. fal-only models are never looked up
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
curated `native` model (GPT Image 2.6 Flare, Sunburst, MiniMax H3 Image, Seedream 5.5, MAI-Image-2.7) is the exception: it takes the catalog's options as a
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
| `endpoint` | `"chat"` → `chat/completions` with `modalities: ["image","text"]` (result in `choices[0].message.images[0].image_url.url` as a data URL). `"images"` → `images/generations` (result in `data[0].b64_json`). `"native"` → `POST /api/v1/images` with the catalog's own fields; options then come from the live catalog. `"fal"` → not on OpenRouter at all (fal-only, GPT Image 2.6 on APIMart only, or GPT Image 2.6 Economy on kie.ai only). Gemini/GPT-5 image models are `chat`, Krea and `gpt-image-2` are `images`, GPT Image 2.6 Flare, Sunburst, MiniMax H3 Image, Seedream 5.5, MAI-Image-2.7 and everything discovered are `native`. |
| `featured` | Shows in the "Featured models" group at the top of the picker. Keep this short. |
| `badges` | `"new"`, `"pro"`, `"fast"`, `"beta"`. Purely visual. |
| `caps.textToImage` / `caps.imageToImage` | Whether the model accepts a prompt only / reference images. Rows that can't do the current mode are dimmed in the picker. |
| `caps.maxReferenceImages` | How many reference images the UI lets you attach (0 = none). `gpt-image-2` takes 1 (edit); Gemini 3 takes up to 6. |
| `aspectRatios` | Subset of `ImageAspectRatio`. `auto` means "don't send `image_config.aspect_ratio`". `images`-endpoint models often support only 1:1 (Krea) or 1:1 / 2:3 / 3:2 (`gpt-image-2`, mapped to `size`). |
| `sizes` | Subset of `"1K" \| "2K" \| "4K"`. Only meaningful when `supportsImageSize` is true; otherwise list `["1K"]`. |
| `supportsImageSize` | Whether `image_config.image_size` is honoured. If false the app never sends it. |
| `estCostUsd` | USD per image keyed by size. Missing sizes fall back to `"1K"`. Shown as `~$0.13` in the Generate button. Empty for fal-only models (no estimate shown). |
| `estCostPerReferenceUsd` | USD added for each reference image, when OpenRouter bills them on top (Seedream 5.5). |
| `verified` | `true` only after the checklist below. For a model on both, it is about the OpenRouter route. |
| `fal` | How fal serves the model (`FalImageRoute`): `textToImage` and `edit` endpoint ids (the edit one is used when references are attached); `refs` (`"image_urls"` list or a single `"image_url"`); `aspect` (`"aspect_ratio"`, `"image_size"`, absent = never sent); `imageSizes` (the model's own `image_size` per ratio, instead of fal's presets, e.g. MAI-Image-2.7's `landscape_3_2` / `portrait_3_2`); `scaledSize` (`true` = an explicit `image_size` for the ratio at the requested 1K / 2K / 4K, as MiniMax H3 Image and Seedream 5.5 take); `autoSizes` (with `scaledSize`, fal's own `image_size` for `auto` at each size, as Seedream 5.5's `auto_1K` / `auto_2K`); `resolution` (`true` = send `resolution: "1K" \| "2K" \| "4K"`); `extra` (fixed fields sent with every request). See [FAL.md](FAL.md#image-fields-buildfalimagepayload). |
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
| `estCostPerSecNoAudioUsd` | USD per second with Sound off, where OpenRouter charges less for that (Kling 3.0, Veo 3.1). Read from the live catalog's without-audio SKUs. |
| `minCostUsd` | The provider's minimum charge per run (Runway Aleph 2: $0.56); the estimate never goes below it. |
| `verified` | `true` only after the checklist below. |
| `hidden` | Keep in the catalog but don't list it (upscaling, avatar models). |
| `discovered` | Set by the browser (`src/client/lib/catalog.ts`), never in `models.ts`: OpenRouter lists the model but the curated catalog does not (see above). |
| `fal` | How fal serves the model (`FalVideoRoute`): `textToVideo`, `imageToVideo`, `motionControl` and `edit` endpoint ids; `imageField` (first frame as `image_url`, the default, or `start_image_url`); `endImage` (the last frame goes in `end_image_url`); `endImageMaxSec` (the longest clip with a last frame, when less than the model's longest); `duration` (`"number"` → `5`, `"string"` → `"5"`, `"seconds"` → `"5s"`, absent = never sent); `aspect` (`"always"`, `"text"` = text-to-video only, absent = never sent); `resolutions` (app value → fal's, e.g. `{ "480p": "480P" }`; absent = never sent); `audio` (`"generate_audio"` or `"generate_audio_switch"`); `extra` (fixed fields). See [FAL.md](FAL.md#video-fields-buildfalvideopayload). |
| `kie` | How kie.ai serves the model (`KieVideoRoute`): its `family` (which builder maps the fields), the createTask `model`, an `imageModel` used with a frame where kie splits the two, a `tier` (Veo's `model`, Kling's `mode`). See [KIE.md](KIE.md#video-fields-buildkievideopayload). |
| `apimart` | How APIMart serves the model (`ApimartVideoRoute`): its `family`, APIMart's `model` id and a `tier` (Kling's `mode`). See [APIMART.md](APIMART.md#video-fields-buildapimartvideopayload). |
| `revana` | How Revana serves the model (`RevanaRoute`): Revana's `model` id. See [REVANA.md](REVANA.md). |
| `bytedance` | How ByteDance serves the model on BytePlus ModelArk (`BytedanceRoute`): ModelArk's `model` id, whose options and token prices are in `BYTEDANCE_VIDEO_MODELS`. Videos only. See [BYTEDANCE.md](BYTEDANCE.md). |
| `replicate` | How Replicate serves the model (`ReplicateRoute`): the official model's `owner/name`, and a `variant` when two catalog models share one (Kling 3.0's `mode`). Its fields and prices are in `REPLICATE_MODELS`. See [REPLICATE.md](REPLICATE.md). |
| `offOpenRouter` | Not on OpenRouter: runs only on the providers its routes name (`fal`, `kie`, `apimart`, `revana`, `bytedance`, `replicate`), and is never looked up in OpenRouter's catalogs. The browser also sets it on a curated model with another provider's route that OpenRouter stopped listing. |

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
