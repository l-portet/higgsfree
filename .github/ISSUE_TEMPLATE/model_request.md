---
name: Model request
about: Ask for a new OpenRouter image or video model to be added to the catalog
title: "[model] "
labels: model
assignees: ""
---

## Model

- Display name (as you'd like it in the picker):
- OpenRouter slug (e.g. `provider/model-name`):
- Type: image / video
- Link to the OpenRouter model page:

## Is it live on OpenRouter?

Please check before filing: the catalog only lists models OpenRouter actually serves.

```bash
# image models
curl -s https://openrouter.ai/api/v1/models | jq -r '.data[] | select(.architecture.output_modalities | index("image")) | .id' | grep -i "<slug>"
# video models
curl -s "https://openrouter.ai/api/v1/models?output_modalities=video" | jq -r '.data[].id' | grep -i "<slug>"
```

- [ ] The slug appears in the list above

## Known constraints (fill in what you know; see "Adding a model" in `docs/MODELS.md`)

- Endpoint (image only): `chat/completions` with `modalities: ["image","text"]` / `images/generations`
- Text-to-image / image-to-image (max reference images):
- Text-to-video / image-to-video / last-frame anchor:
- Native audio:
- Sizes or resolutions:
- Durations (range or fixed options):
- Aspect ratios:
- Accepts real human faces on i2v (if known):
- Pricing (per image or per second) and, ideally, a measured `usage.cost` from a real run:

## Provider messages

If you already probed the model and got a 400 back, paste the body. It usually spells out the
supported values and saves whoever implements this a lot of guessing.

```
(paste here)
```

## Why this model?

One or two lines on what it does better than what's already in the catalog.
