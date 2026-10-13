# Models

Everything the app knows about a model (display name, OpenRouter slug, which endpoint serves it,
what it can do, which options the provider accepts and roughly what it costs) lives in **one
file**: [`src/shared/models.ts`](../src/shared/models.ts). The picker, the option chips, request
validation and the cost estimate are all driven by it. This page is maintained by hand from that
file (catalog snapshot: OpenRouter `GET /api/v1/models`, 2 Sep 2026).

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

Default image model: **Nano Banana Pro** (`google/gemini-3-pro-image`).

## Video models

All video models go through the async `POST /api/v1/videos` endpoint (HTTP 202 on submit, then
polling). "all 6" aspect ratios = 21:9, 16:9, 4:3, 1:1, 3:4, 9:16. `†` = `omitAspectRatioOnI2v`:
the model rejects `aspect_ratio` on image-to-video, so the app omits it and the output follows the
input frame. **Last frame** = accepts a `frame_type: "last_frame"` anchor. **Audio** = ships a
native audio track. Durations are in seconds; a range means every integer step in it is allowed.

| Model | OpenRouter slug | t2v | i2v | Last frame | Audio | Real faces | Resolutions | Durations (s) | Aspect ratios | Est. cost / second | Verified |
|---|---|:-:|:-:|:-:|:-:|:-:|---|---|---|---|:-:|
| **Seedance 2.5** <sub>NEW</sub> | `bytedance/seedance-2.5` | ✓ | ✓ | ✓ | ✓ | ✗ | 480p / 720p (default 720p) | 4–30 (default 5) | all 6 † | 480p $0.103 · 720p $0.234 | ✓ |
| **Seedance 2.0** <sub>PRO</sub> | `bytedance/seedance-2.0` | ✓ | ✓ | ✓ | – | ✗ | 480p / 720p / 1080p / 2K / 4K (default 1080p) | 4–15 (default 5) | all 6 † | 480p $0.10 · 720p $0.20 · 1080p $0.35 · 2K $0.60 · 4K $1.089 | ✓ |
| **Seedance 2.0 Fast** <sub>FAST</sub> | `bytedance/seedance-2.0-fast` | ✓ | ✓ | ✓ | – | ✗ | 480p / 720p (default 720p) | 4–15 (default 5) | all 6 † | 480p $0.05 · 720p $0.10 | – |
| **Seedance 2.0 Mini** <sub>FAST</sub> | `bytedance/seedance-2.0-mini` | ✓ | ✓ | ✓ | – | ✗ | 480p / 720p (default 720p) | 4–15 (default 5) | all 6 † | 480p $0.03 · 720p $0.06 | – |
| **Seedance 1.5 Pro** | `bytedance/seedance-1-5-pro` | ✓ | ✓ | ✓ | – | ✗ | 480p / 720p / 1080p (default 1080p) | 4–12 (default 5) | all 6 † | 480p $0.05 · 720p $0.10 · 1080p $0.20 | – |
| **Kling 3.0 Pro** <sub>PRO</sub> | `kwaivgi/kling-v3.0-pro` | ✓ | ✓ | ✓ | – | ✓ | 1080p (default 1080p) | 3–15 (default 5) | 16:9, 9:16, 1:1 | 1080p $0.168 | ✓ |
| **Kling 3.0 Standard** | `kwaivgi/kling-v3.0-std` | ✓ | ✓ | ✓ | – | ✓ | 720p / 1080p (default 1080p) | 3–15 (default 5) | 16:9, 9:16, 1:1 | 720p $0.06 · 1080p $0.10 | – |
| **Kling O1** <sub>NEW</sub> | `kwaivgi/kling-video-o1` | ✓ | ✓ | ✓ | – | ✓ | 1080p (default 1080p) | 3–10 (default 5) | 16:9, 9:16, 1:1 | 1080p $0.20 | – |
| **MiniMax Hailuo 3 Max** <sub>NEW</sub> | `minimax/hailuo-3-max` | ✓ | ✓ | – | ✓ | ? | 768p (default 768p) | 5–15 (default 5) | 16:9, 9:16, 1:1, 4:3, 3:4 | 768p $0.08 | ✓ |
| **MiniMax Hailuo 3** <sub>NEW</sub> | `minimax/hailuo-3` | ✓ | ✓ | – | ✓ | ✓ | 2K (default 2K) | 5–15 (default 5) | 16:9, 9:16, 1:1 | 2K $0.13 | ✓ |
| **MiniMax Hailuo 2.3** | `minimax/hailuo-2.3` | ✓ | ✓ | – | – | ✓ | 1080p (default 1080p) | 6, 10 (default 6) | 16:9, 9:16, 1:1 | 1080p $0.08 | – |
| **Veo 3.1** <sub>PRO</sub> | `google/veo-3.1` | ✓ | ✓ | ✓ | ✓ | ? | 720p / 1080p (default 1080p) | 4, 6, 8 (default 8) | 16:9, 9:16 | 720p $0.40 · 1080p $0.40 | ✓ |
| **Veo 3.1 Fast** <sub>FAST</sub> | `google/veo-3.1-fast` | ✓ | ✓ | ✓ | ✓ | ? | 720p / 1080p (default 1080p) | 4, 6, 8 (default 8) | 16:9, 9:16 | 720p $0.15 · 1080p $0.15 | – |
| **Veo 3.1 Lite** <sub>FAST</sub> | `google/veo-3.1-lite` | ✓ | ✓ | – | ✓ | ? | 720p / 1080p (default 720p) | 4, 6, 8 (default 8) | 16:9, 9:16 | 720p $0.08 · 1080p $0.08 | – |
| **Sora 2 Pro** <sub>PRO</sub> | `openai/sora-2-pro` | ✓ | ✓ | – | ✓ | ? | 720p / 1080p (default 1080p) | 4, 8, 12 (default 8) | 16:9, 9:16 | 720p $0.30 · 1080p $0.50 | – |
| **Wan 3.0** <sub>NEW</sub> | `alibaba/wan-3.0` | ✓ | ✓ | – ² | ✓ | ? | 480p / 720p / 1080p (default 1080p) | 2–30 (default 5) | all 6 | 480p $0.05 · 720p $0.08 · 1080p $0.15 | – |
| **Wan 3.0 Prime** <sub>FAST</sub> | `alibaba/wan-3.0-prime` | ✓ | ✓ | – | ✓ | ? | 1080p (default 1080p) | 2–30 (default 5) | all 6 | 1080p $0.12 | – |
| **Wan 2.7** | `alibaba/wan-2.7` | ✓ | ✓ | ✓ | ✓ | ? | 720p / 1080p (default 1080p) | 5, 10, 15 (default 5) | all 6 | 720p $0.06 · 1080p $0.10 | – |
| **Wan 2.6** | `alibaba/wan-2.6` | ✓ | ✓ | – | ✓ | ? | 720p / 1080p (default 1080p) | 5, 10 (default 5) | all 6 | 720p $0.05 · 1080p $0.08 | – |
| **FLUX.3 Video** <sub>NEW</sub> ³ | `black-forest-labs/flux-3-video` | ✓ | ✓ | ✓ | ✓ | ? | 1080p (default 1080p) | 5–20 (default 5) | all 6 | 1080p $0.15 | – |
| **Grok Imagine Video** <sub>FAST</sub> | `x-ai/grok-imagine-video` | ✓ | ✓ | – | ✓ | ? | 480p / 720p (default 480p) | 1–15 (default 5) | all 6 | 480p $0.078 · 720p $0.078 | ✓ |
| **Grok Imagine 1.5** <sub>FAST</sub> | `x-ai/grok-imagine-video-1.5` | – ¹ | ✓ | – | ✓ | ? | 480p (default 480p) | 1–15 (default 6) | 16:9, 9:16, 1:1 | 480p $0.078 | ✓ |
| **HappyHorse 1.1** <sub>NEW</sub> | `alibaba/happyhorse-1.1` | ✓ | ✓ | – | ✓ | ? | 1080p (default 1080p) | 3–15 (default 5) | all 6 | 1080p $0.10 | – |
| **HappyHorse 1.0** | `alibaba/happyhorse-1.0` | ✓ | ✓ | – | ✓ | ? | 1080p (default 1080p) | 3–15 (default 5) | all 6 | 1080p $0.08 | – |
| **Runway Gen-4.5** | `runway/gen-4.5` | ✓ | ✓ | – | – | ? | 720p / 1080p (default 1080p) | 5, 10 (default 5) | all 6 | 720p $0.10 · 1080p $0.20 | – |

¹ Text-only prompts were rejected with a 400 as of Jul 2026; kept `textToVideo: false` until that changes.

² The provider answers "does not support last_frame frame_images" (Sep 2026), so `caps.lastFrame` is false.

³ The provider answers "does not support image input references" (Sep 2026): `caps.references: false`, so the app hides the style-reference strip and rejects `references` with a 400.

Wan 3.0 Prime is the *fast-mode* Wan 3.0 (text-to-video and first-frame image-to-video only, no
last-frame anchor) per the OpenRouter endpoint description, not a higher-fidelity tier.

Default video model: **Seedance 2.5** (`bytedance/seedance-2.5`).

### Hidden (in the catalog, not selectable yet)

These need video or audio *inputs* that the UI doesn't collect yet. They're kept in the catalog
with `hidden: true` so the slugs and constraints are ready when the UI catches up.

| Model | OpenRouter slug | t2v | i2v | Last frame | Audio | Real faces | Resolutions | Durations (s) | Aspect ratios | Est. cost / second | Verified |
|---|---|:-:|:-:|:-:|:-:|:-:|---|---|---|---|:-:|
| **Runway Aleph 2** | `runway/aleph-2` | – | – | – | – | ? | 1080p | 5, 10 (default 5) | 16:9 | 1080p ? | – |
| **FLUX Video Upscale** | `black-forest-labs/flux-video-upscale` | – | – | – | – | ? | 4K | 5 (default 5) | 16:9 | 4K ? | – |
| **HeyGen Avatar IV** | `heygen/avatar-iv` | – | – | – | ✓ | ? | 1080p | 5 (default 5) | 16:9, 9:16 | 1080p ? | – |

## Discovered models

The server compares OpenRouter's `GET /api/v1/models?output_modalities=video` list with
`VIDEO_MODELS` on every refresh of the live snapshot (cached 10 minutes, so a new model shows up
within 10 minutes of OpenRouter listing it). Any slug the catalog does not know (hidden entries
count as known) is exposed by `GET /api/models` as a **discovered** model and can be generated
with or set as the default right away. Nothing about it is verified, so the entry is deliberately
conservative:

| Field | Value |
|---|---|
| `name` | OpenRouter's `name` with the leading `Vendor: ` prefix stripped. |
| `provider` | The slug's vendor prefix when it is a known `ModelProvider`, otherwise `openrouter`. |
| `description` | `New on OpenRouter. Limits and price not verified yet.` |
| `featured` / `badges` | `false` / `["new"]`; listed under "All models" with an "Unverified" hint. |
| `caps` | `textToVideo` / `imageToVideo` from `architecture.input_modalities`; `lastFrame`, `audio` and `references` all `false`. |
| `durations` / `defaultDuration` | 4 to 10 s in 1 s steps, default 5. |
| `resolutions` | Empty: the app never sends `resolution` and the provider picks. |
| `aspectRatios` | 16:9, 9:16, 1:1. |
| `estCostPerSecUsd` | Empty: no estimate before generating; the real `usage.cost` is recorded on the result. |
| `verified` / `discovered` | `false` / `true`. |

Provider 400s for a discovered model are surfaced verbatim, which is also the fastest way to
learn its real limits. Once you have run it through the checklist below, add a proper entry to
`VIDEO_MODELS`; it then stops being discovered.

## Adding a model

1. Confirm the slug is live on OpenRouter (see the checklist below).
2. Add an entry to `IMAGE_MODELS` or `VIDEO_MODELS` in `src/shared/models.ts`. That's the whole
   change; no server or client code needs to know about a new model.
3. Run it once through the app, paste the measured `usage.cost` and any provider error bodies into
   your PR, and update the table above.
4. Leave `verified: false` until you've completed the checklist.

### `ImageModel` fields

| Field | Meaning |
|---|---|
| `kind` | Always `"image"`. |
| `id` | OpenRouter slug, e.g. `google/gemini-3-pro-image`. Must match `GET /api/v1/models` exactly. |
| `name` / `provider` / `description` | Picker display. `provider` must be a `ModelProvider` (`google`, `openai`, `bytedance`, `kwaivgi`, `minimax`, `x-ai`, `alibaba`, `black-forest-labs`, `runway`, `krea`, `heygen`, `openrouter`); add the label to `PROVIDER_LABEL` if you add a provider. |
| `endpoint` | `"chat"` → `chat/completions` with `modalities: ["image","text"]` (result in `choices[0].message.images[0].image_url.url` as a data URL). `"images"` → `images/generations` (result in `data[0].b64_json`). Check the model page on OpenRouter; Gemini/GPT-5 image models are `chat`, Krea and `gpt-image-2` are `images`. |
| `featured` | Shows in the "Featured models" group at the top of the picker. Keep this short. |
| `badges` | `"new"`, `"pro"`, `"fast"`, `"beta"`. Purely visual. |
| `caps.textToImage` / `caps.imageToImage` | Whether the model accepts a prompt only / reference images. Rows that can't do the current mode are dimmed in the picker. |
| `caps.maxReferenceImages` | How many reference images the UI lets you attach (0 = none). `gpt-image-2` takes 1 (edit); Gemini 3 takes up to 6. |
| `aspectRatios` | Subset of `ImageAspectRatio`. `auto` means "don't send `image_config.aspect_ratio`". `images`-endpoint models often support only 1:1 (Krea) or 1:1 / 2:3 / 3:2 (`gpt-image-2`, mapped to `size`). |
| `sizes` | Subset of `"1K" \| "2K" \| "4K"`. Only meaningful when `supportsImageSize` is true; otherwise list `["1K"]`. |
| `supportsImageSize` | Whether `image_config.image_size` is honoured. If false the app never sends it. |
| `estCostUsd` | USD per image keyed by size. Missing sizes fall back to `"1K"`. Shown as `~$0.13` in the Generate button. |
| `verified` | `true` only after the checklist below. |

### `VideoModel` fields

| Field | Meaning |
|---|---|
| `kind` / `id` / `name` / `provider` / `description` / `featured` / `badges` | As above. |
| `caps.textToVideo` / `caps.imageToVideo` | Modes offered. Grok Imagine 1.5 is i2v-only, for example. |
| `caps.lastFrame` | Accepts `frame_images` with `frame_type: "last_frame"` in addition to `first_frame`. Enables the last-frame slot in the UI. |
| `caps.audio` | Ships a native audio track. Shows the speaker glyph in the picker; the `audio` request flag is sent to OpenRouter as `generate_audio` only for these models (and only when the user set it explicitly). |
| `caps.realFaces` | `true` = known to accept recognisable human faces on i2v, `false` = known to reject (Seedance moderation), `undefined` = unknown. Used for the "safe for real faces" hint. |
| `caps.references` | `false` = the provider rejects `input_references` (FLUX.3 Video). The app then hides the style-reference strip and answers a request that still sends `references` with a 400. `undefined` = supported. |
| `durations` | Either a range `{ min, max, step? }` (every step is allowed, e.g. Seedance 4–30 s) or an explicit list `{ options: [4, 6, 8] }` (Veo, Sora, Hailuo 2.3). The stepper snaps to these (`snapDuration`). |
| `defaultDuration` | Preselected duration. |
| `resolutions` / `defaultResolution` | Values the provider accepts for `resolution`. Some accept exactly one (Hailuo 3 → `2K`, Kling 3.0 Pro → `1080p`); if the list is empty the app doesn't send `resolution` at all. |
| `aspectRatios` | Subset of `VideoAspectRatio`. |
| `omitAspectRatioOnI2v` | Set when the provider returns 400 if `aspect_ratio` is sent together with `frame_images` (all Seedance models). The output then follows the input image. |
| `estCostPerSecUsd` | USD per second keyed by resolution. Multiplied by the duration for the estimate. |
| `verified` | `true` only after the checklist below. |
| `hidden` | Keep in the catalog but don't list it (video-to-video, avatar models). |
| `discovered` | Set by the server, never in `models.ts`: the entry was synthesized from OpenRouter's live video list (see below). |

## Verification checklist

Work through this with `curl` (or the app in dev mode) before flipping `verified: true`. Replace
`$OPENROUTER_API_KEY` and the slug.

1. **Is it live?** The catalog must only contain slugs OpenRouter currently serves. Models on the
   `images/generations` endpoint (Krea 2, `gpt-image-2`) do **not** appear in the unfiltered
   `GET /api/v1/models`; check the filtered list *and* `/api/v1/images/models`.

   ```bash
   # chat-endpoint image models (output_modalities filter)
   curl -s "https://openrouter.ai/api/v1/models?output_modalities=image" | jq -r '.data[].id'

   # images-endpoint models (Krea 2, gpt-image-2, ...); needs the key
   curl -s -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/images/models | jq -r '.data[].id'

   # video models: dedicated filter
   curl -s "https://openrouter.ai/api/v1/models?output_modalities=video" | jq -r '.data[].id'
   ```

   The server unions the same three lists (cached 10 min) and exposes the result as
   `live.available` on `GET /api/models`, so a slug that disappears from OpenRouter shows as
   unavailable in the picker.

2. **Read the provider's supported values by sending a bad one.** Providers reject unknown options
   with a 400 whose body lists what they accept, the fastest way to fill in `resolutions`,
   `durations` and `aspectRatios` without guessing. The app forwards these bodies verbatim in
   `ApiError.provider`.

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

There is no generator checked in. The tables above were produced once with a throwaway `tsx`
script that imported `IMAGE_MODELS` / `VIDEO_MODELS` and printed Markdown rows, and are kept in
sync by hand since; when you add or change a model, update its row (or rebuild the whole table the
same way). Keep the column order so diffs stay readable.
