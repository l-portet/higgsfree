---
name: Bug report
about: Something is broken or behaves unexpectedly
title: "[bug] "
labels: bug
assignees: ""
---

## What happened?

A clear description of the problem.

## Steps to reproduce

1. Go to …
2. Select model … / set options …
3. Click Generate
4. See error

## Expected behaviour

What you expected to happen instead.

## Provider error (if any)

Paste the error shown on the card / in the lightbox. The server forwards OpenRouter's response
body verbatim. It usually lists the supported values, e.g. `Supported resolutions: 480p, 720p`.

```
(paste here)
```

## Environment

- higgsfree version / commit:
- How are you running it: `pnpm dev` / `pnpm start` / Vercel / Docker (`docker compose`)
- Node version (`node --version`):
- OS / browser:
- Model slug (from `src/shared/models.ts`, e.g. `bytedance/seedance-2.5`):
- Mode: text-to-image / image-to-image / text-to-video / image-to-video

## Logs

Relevant server output (`pnpm dev` terminal or `docker compose logs higgsfree`, or the Vercel function logs).
**Redact your API key.** It should never appear in logs, but check before pasting.

```
(paste here)
```

## Additional context

Screenshots, reference images used, anything else that helps.
