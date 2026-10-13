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

Paste the error shown on the card / in the lightbox. The app shows OpenRouter's response body verbatim.
It usually lists the supported values, e.g. `Supported resolutions: 480p, 720p`.

```
(paste here)
```

## Environment

- higgsfree version / commit (Settings › About shows the version):
- How you run it: `pnpm dev` / a hosted url (which one?) / Docker (`docker compose`)
- Browser and version (e.g. Chrome 130, Safari 18, Firefox 131); private window or not:
- OS:
- Model slug (from `src/shared/models.ts`, e.g. `bytedance/seedance-2.5`):
- Mode: text-to-image / image-to-image / text-to-video / image-to-video

## Logs

Browser console output (DevTools › Console; the app's lines start with `[higgsfree]`).
**Redact your API key.** It should never appear there, but check before pasting.

```
(paste here)
```

## Additional context

Screenshots, reference images used, anything else that helps.
