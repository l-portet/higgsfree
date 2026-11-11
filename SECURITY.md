# Security

higgsfree runs in the browser. It has no database and no accounts: the browser holds your keys and your library,
and talks to OpenRouter, fal, kie.ai, APIMart and Revana directly. Its only server code is a stateless pass-through
for ByteDance (`src/server/bytedance-proxy.ts`), whose API refuses browser calls: a ByteDance key and its requests go
through the app's own server on their way to ByteDance, and nothing of them is kept. Every other security question
comes down to the browser and the origin the app is served from.

## Where your keys live

Each key is stored in this browser's localStorage and nowhere else, and each is sent only to its own provider. The
ByteDance key is the one that travels through the app's server on the way (below).

- **OpenRouter** (`higgsfree.apiKey`) is sent with exactly one kind of request: calls to
  `https://openrouter.ai` (or the `NEXT_PUBLIC_OPENROUTER_BASE_URL` the site was built with). A url
  OpenRouter hands back (a polling url, a video content url) is checked against that origin before the key
  travels with it; anything else is refused (`assertProviderOrigin` in `src/client/lib/openrouter.ts`).
- **fal** (`higgsfree.falKey`, optional) is sent only to fal's API hosts, over https: `fal.run`,
  `queue.fal.run`, `rest.fal.ai` and `api.fal.ai`. The status url fal hands back for a video job is checked
  against those hosts before the key travels with it; anything else is refused (`assertFalOrigin` in
  `src/client/lib/fal.ts`). fal's result files and the presigned upload url are fetched without the key.
- kie.ai, APIMart and Revana keys go only to their own API hosts in the same way (`assertKieOrigin`,
  `assertApimartOrigin`, `assertRevanaOrigin`).
- **ByteDance** (`higgsfree.bytedanceKey`, optional) is the exception. ByteDance's BytePlus ModelArk blocks browser
  calls (no CORS headers on its errors or its result files, and its image API refuses the `Authorization` header), so
  the browser sends the key, in the `Authorization` header, only to the pass-through on its own origin
  (`/api/bytedance/v3/…`, `assertBytedanceOrigin` in `src/client/lib/bytedance.ts`). The server uses it once to call
  `https://ark.ap-southeast.bytepluses.com/api/v3` and drops it: nothing stores, caches or logs it (no module state,
  no console output, `Cache-Control: no-store`, fixed error messages), and it forwards only the three calls the app
  makes (submit a video task, read one by its `cgt-…` id, list one task as the key test), refusing anything else
  before it leaves the server. Finished videos are fetched by the server from ModelArk's own storage bucket only,
  without the key. Settings › Keys and the key dialog say this next to the ByteDance key field.
- The app never logs a key and never puts one in a url; the UI shows them masked (`sk-or-v1-…a1b2`).
- Use a **dedicated OpenRouter key with a spend limit** for this app, and rotate it any time at
  <https://openrouter.ai/keys>. Test connection in Settings › Keys shows the key's label, spend limit and
  remaining credits; **Remove key** deletes it from the browser. Rotate the fal key at
  <https://fal.ai/dashboard/keys>; **Remove key** in Settings › Keys deletes it.
- There is nothing to commit: the repo holds no key anywhere, and `.env.example` contains only build-time,
  non-secret values.

## Threat model

Any script that runs on the app's origin can read localStorage, so it can read the keys. Concretely:

- a malicious or compromised browser extension with access to the page;
- a cross-site scripting (XSS) flaw in the app itself;
- a third-party script the site loads (see Google Analytics and Microsoft Clarity below);
- someone at the unlocked device, who can open DevTools or simply use the app and spend your credits.

What the app does about it:

- **Third-party script: Google Analytics.** Production builds (`next build`, so the hosted site, your
  own Vercel deploy and the Docker image alike) load the Google tag from `googletagmanager.com` through
  `@next/third-parties`, with the repo owner's measurement id (`GA_ID` in `src/app/layout.tsx`). `pnpm dev`
  does not. The tag runs on the app's origin like the app's own code, so the threat above applies to it.
  The app sends no events of its own; Google receives page views and whatever the tag collects for that
  property. To build without it, remove the `<GoogleAnalytics>` element and the Google hosts from the CSP
  in `src/app/layout.tsx`.
- **Third-party script: Microsoft Clarity.** Production builds also load Clarity's session-recording tag
  from `clarity.ms`, with the repo owner's project id (`CLARITY_ID` in `src/client/lib/clarity.ts`, or
  `NEXT_PUBLIC_CLARITY_ID` at build time). It stays off under `pnpm dev`, on `localhost` and `127.0.0.1`, and
  whenever `window.CLARITY_DISABLED_ENV === true` by the time the app hydrates. The threat above applies to
  it too. Clarity records how the page is used and what it shows. Its default masking covers input fields,
  dropdowns, numbers and email addresses, so other text on screen, such as the prompts on saved generations
  and the shortened key previews in Settings, can reach Microsoft. To build without it, remove the
  `<Clarity>` element from `src/app/layout.tsx` and the Clarity hosts from the CSP there. Fonts are bundled
  at build time; nothing else is loaded from a CDN at runtime.
- **Untrusted text is rendered as text.** Prompts, model names and descriptions, provider error bodies
  (OpenRouter's and fal's) and imported archives go through React as strings, never as HTML. Imported
  records are reduced to known fields with validated ids, and imported media are sniffed before they are
  stored.
- **A Content-Security-Policy** meta tag in production builds (`src/app/layout.tsx`) limits `connect-src`
  to:
  - the app's own origin;
  - OpenRouter (or the configured base url);
  - fal's API hosts (`fal.run`, `queue.fal.run`, `rest.fal.ai`, `api.fal.ai`) and the hosts its files
    and uploads are served from (`fal.media`, `*.fal.media`, `storage.googleapis.com`);
  - kie.ai (`api.kie.ai`, `kieai.redpandaai.co`, `*.aiquickdraw.com`) and APIMart (`api.apimart.ai`,
    `upload.apimart.ai`);
  - Revana (`api.revana.si`) and the Cloudflare R2 storage its uploads and results use
    (`*.r2.cloudflarestorage.com`);
  - Google Analytics (`*.google-analytics.com`, `*.analytics.google.com`, `*.googletagmanager.com`);
  - Microsoft Clarity (`*.clarity.ms`).

  `script-src` is `self`, inline scripts, `*.googletagmanager.com` and `*.clarity.ms`; `img-src` is `self`,
  `blob:`, `data:`, the Google Analytics hosts, `*.clarity.ms` and `c.bing.com`; `media-src` is `self` and
  `blob:`; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. (Inline scripts are needed by Next's
  bootstrap, so the policy's job is exfiltration, not injection.) Some of those hosts are shared services:
  `storage.googleapis.com` serves every Google Cloud Storage bucket, Google's analytics endpoints take hits
  for any property, and Clarity's take uploads for any project. The list narrows where an injected script
  can send the keys; it does not close it.
  ByteDance needs no entry: the browser only reaches it through the app's own origin (`'self'`).
- **`X-Content-Type-Options: nosniff`** and **`frame-ancestors 'none'`** on every response (`vercel.json`; the
  Docker image's standalone server sends the same headers, from `next.config.ts`). The ByteDance pass-through's
  answers also carry `Cache-Control: no-store`, and the videos it streams are typed as videos (anything else as
  `application/octet-stream`) under `Content-Security-Policy: default-src 'none'; sandbox`.
- Media are shown through `blob:` object urls, never by url from anywhere else.

The origin is the trust boundary: whoever controls the files served at the url you use controls the keys.
Host it on a domain you control (your own Vercel project, your own server, `localhost`) rather than
someone else's copy, and keep the browser and its extensions trustworthy.

## What the providers receive

Each provider receives what a run sends it: the prompt, the options, and the images attached (frames and
references travel inline as data URLs in the request body). A video you edit on OpenRouter travels inline
the same way.

On fal, two things also exist as **public urls** that anyone who has them can fetch:

- **A video you send to a model** (a motion-control reference video, or a video to edit) is uploaded to
  fal's storage (initiate on `rest.fal.ai`, then a presigned `PUT`) and passed to the model as its public
  `file_url`. It is uploaded again at every run and retry.
- **fal's results** (images and clips) are public CDN urls; the app downloads them without the key.

On kie.ai, every input is a public url: kie takes images and videos by url only, so each frame, reference
image and video to edit is uploaded to kie's file host (`kieai.redpandaai.co`) first and kept there 24 hours.
kie's results are public urls on its CDN (`*.aiquickdraw.com`) for 14 days; the app downloads them without
the key.

On APIMart, each frame and reference image is uploaded to its file host (`upload.apimart.ai`) first and kept
there 72 hours; its results are public urls on the same host, for 24 to 72 hours. APIMart takes no video.

On Revana, each frame, reference and video to edit is uploaded to Revana's storage (a presigned `PUT` to
Cloudflare R2) and passed as a keyless `api.revana.si` link, kept 14 days. Its results are read with the key
from `api.revana.si`, which redirects to a short-lived file url.

On ByteDance (BytePlus ModelArk), frames and reference images travel inline in the request, through the app's
server; nothing is uploaded. Its videos are presigned urls on its TOS storage for 24 hours, read through the app's
server without the key; a url on any other host is never fetched, and the run's error shows it instead.

The app does not keep these urls, but the providers have them. Treat anything you send to fal, kie.ai,
APIMart, Revana or ByteDance, and anything they make, as reachable by url.

## What a hosted copy can see

The host serves the pages and runs the ByteDance pass-through. It never receives your OpenRouter, fal, kie.ai,
APIMart or Revana keys, your library, or what you send those providers: that goes from the browser to them and
into IndexedDB. A host sees ordinary web-server traffic (your IP address, which pages you load) and, if you use
ByteDance, your ByteDance calls as they pass through: the key, the prompt and options, the frames and references,
and the finished video's link and bytes. The code it runs keeps none of that (no storage, no logs, nothing cached),
but whoever controls the server controls that code, which is one more reason to use a copy you deploy yourself.
The url of each call (`/api/bytedance/v3/contents/generations/tasks/cgt-…`) is in the host's ordinary request logs,
like any page load; the key and the video's presigned link are not (they travel in a header and in a request body).
Vercel adds nothing on top (the only configuration there is the headers above), but production builds load Google
Analytics and Microsoft Clarity (see above), so Google sees page views and Microsoft sees session recordings.

## Shared computers

- The keys and the library belong to the browser profile. On a shared machine, **Remove key** for each
  (Settings › Keys) when you are done; the library
  stays, so export it first if you want to keep it, or **Delete everything**.
- A private window starts empty and forgets everything when it closes (some browsers block IndexedDB there,
  and the app says so).
- Another browser profile, or another browser, is another library with its own keys.

## Reporting a vulnerability

Please open a GitHub issue for anything that is not sensitive. If the report could put users at risk (e.g.
a way to read a stored key from another origin, to make a key go anywhere other than its provider, or to make the
ByteDance pass-through call or fetch anything off its allowlist),
open a
[private security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on the repository instead so it can be fixed before it's public.

Please include the commit or version (Settings › About), how you're running it (`pnpm dev`, a hosted url,
Docker), the browser and its version, and steps to reproduce. Redact your keys from anything you attach.
