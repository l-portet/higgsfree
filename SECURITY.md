# Security

higgsfree is a static site. It has no server of its own, no database and no accounts: the browser holds
your OpenRouter key and your library, and talks to OpenRouter directly. Every security question therefore
comes down to the browser and the origin the app is served from.

## Where your key lives

- The key you paste is stored in this browser's localStorage under `higgsfree.apiKey`, nowhere else. It is
  sent with exactly one kind of request: calls to `https://openrouter.ai` (or the
  `NEXT_PUBLIC_OPENROUTER_BASE_URL` the site was built with). A url OpenRouter hands back (a polling url, a
  video content url) is checked against that origin before the key travels with it; anything else is
  refused (`assertProviderOrigin` in `src/client/lib/openrouter.ts`).
- The app never logs it and never puts it in a url; the UI shows it masked (`sk-or-v1-…a1b2`).
- Use a **dedicated OpenRouter key with a spend limit** for this app, and rotate it any time at
  <https://openrouter.ai/keys>. The key dialog and Settings show the key's label, spend limit and remaining
  credits; **Remove key** deletes it from the browser.
- There is nothing to commit: the repo holds no key anywhere, and `.env.example` contains only build-time,
  non-secret values.

## Threat model

Any script that runs on the app's origin can read localStorage, so it can read the key. Concretely:

- a malicious or compromised browser extension with access to the page;
- a cross-site scripting (XSS) flaw in the app itself;
- someone at the unlocked device, who can open DevTools or simply use the app and spend your credits.

What the app does about it:

- **No third-party scripts.** The site is self-contained: fonts are bundled at build time and nothing is
  loaded from a CDN at runtime.
- **Untrusted text is rendered as text.** Prompts, model names and descriptions, provider error bodies and
  imported archives go through React as strings, never as HTML. Imported records are reduced to known fields
  with validated ids, and imported media are sniffed before they are stored.
- **A Content-Security-Policy** meta tag in production builds (`src/app/layout.tsx`) limits `connect-src` to
  the app's own origin and OpenRouter, so even an injected script has nowhere else to send the key.
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; images and media are `self`, `blob:` and
  `data:` only. (`script-src` still allows inline scripts, which Next's bootstrap needs, so the policy's
  job is exfiltration, not injection.)
- **`X-Content-Type-Options: nosniff`** on every response (`vercel.json`, `docker/nginx.conf`).
- Media are shown through `blob:` object urls, never by url from anywhere else.

The origin is the trust boundary: whoever controls the files served at the url you use controls the key.
Host it on a domain you control (your own Vercel project, your own server, `localhost`) rather than
someone else's copy, and keep the browser and its extensions trustworthy.

## What a hosted copy can see

The host serves static files and nothing else. It never receives your key, your prompts, your generations
or your reference images: those go from the browser to OpenRouter and into IndexedDB. A host sees ordinary
web-server traffic (your IP address, which pages you load). Vercel adds nothing on top; the only
configuration there is the nosniff header.

## Shared computers

- The key and the library belong to the browser profile. On a shared machine, **Remove key** (key dialog or
  Settings) when you are done; the library stays, so export it first if you want to keep it, or
  **Delete everything**.
- A private window starts empty and forgets everything when it closes (some browsers block IndexedDB there,
  and the app says so).
- Another browser profile, or another browser, is another library with its own key.

## Reporting a vulnerability

Please open a GitHub issue for anything that is not sensitive. If the report could put users at risk (e.g.
a way to read the stored key from another origin, or to make the key go anywhere other than OpenRouter),
open a
[private security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on the repository instead so it can be fixed before it's public.

Please include the commit or version (Settings › About), how you're running it (`pnpm dev`, a hosted url,
Docker), the browser and its version, and steps to reproduce. Redact your key from anything you attach.
