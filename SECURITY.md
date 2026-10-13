# Security

## Your API key

- **Never commit a key.** `.env` is git-ignored; keep it that way. Only `.env.example` (with an
  empty `OPENROUTER_API_KEY=`) belongs in the repo.
- **The key never leaves the server.** The browser talks only to this app's `/api/*`; the server
  is the only thing that calls OpenRouter. `GET /api/settings` returns a masked key
  (`sk-or-v1-…jkiy3`), never the raw value.
- A key entered in the Settings page is stored in the app database: the SQLite file inside
  `DATA_DIR` locally (treat that directory like a secret: don't publish it, and don't bake it into
  a Docker image; `data/` is in `.dockerignore`), or your Turso database on Vercel.
- Use a **dedicated OpenRouter key with a spend limit** for this app. You can rotate it any time
  at <https://openrouter.ai/keys>; the Settings page shows the key's label and remaining credits.
- Anything that can reach the app can spend your credits. **There is no authentication of its
  own.** On Vercel, turn on Deployment Protection (Project → Settings → Deployment Protection):
  *Vercel Authentication* restricts the app to your Vercel team on every plan; *Password
  Protection* (Pro) or *Vercel Passport* (Enterprise) cover people outside it. Self-hosted, run it
  on `localhost`, behind a VPN/Tailscale, or behind a reverse proxy with auth; the Compose file
  publishes the port on the host's loopback only and has to be widened on purpose.

## Cross-site requests and DNS rebinding

Without auth, the browser's same-origin policy is what stops a random web page from calling
`POST /api/generate/video` with your key. The server enforces it (`src/server/security.ts`):

- **`Host` allow-list.** Every request's `Host` hostname must be `localhost`, `127.0.0.1`, `::1`,
  `0.0.0.0`, the host of `APP_URL`, a url Vercel assigned to the deployment, or one of
  `ALLOWED_HOSTS`. This defeats DNS rebinding, where a hostile page's own hostname is pointed at
  your machine. Unknown hosts get `403 Unrecognised Host` plus one log line naming the host. Add it
  to `ALLOWED_HOSTS` (comma-separated, no ports) if it is yours. `ALLOWED_HOSTS=*` turns the check
  off for deployments behind a trusted reverse proxy. On Vercel the check is skipped altogether
  (`VERCEL=1`): the platform only routes a request to the app under one of the app's own domains,
  so a rebound hostname never arrives, and custom domains need no entry.
- **Reverse proxies.** Only the `Host` header as received is checked; `X-Forwarded-Host` and the
  other `X-Forwarded-*` headers are ignored, since anything that can reach the port could set
  them. Keep the browser's `Host` (`proxy_set_header Host $host;` in nginx; Caddy and Traefik do
  it by default) and put the public hostname in `ALLOWED_HOSTS` or `APP_URL`; a proxy that sends
  the upstream name (`localhost:3000`, a Docker service name) is refused. Use `ALLOWED_HOSTS=*`
  only when the proxy is the sole way in and carries authentication. Snippet in the
  [README](README.md#behind-a-reverse-proxy).
- **Content-Type guard.** `POST/PUT/PATCH` requests with a body must be `application/json` or
  `multipart/form-data` (`415` otherwise). This rejects `text/plain` and
  `application/x-www-form-urlencoded` bodies, two of the CORS "simple request" types that
  browsers send cross-site without a preflight, before any parsing happens. It is not the whole
  story: `multipart/form-data` is also a simple type (a plain HTML form can post it cross-site),
  so a cross-site multipart form is stopped by the `Sec-Fetch-Site` / `Origin` layer below, not
  by this check.
- **`Sec-Fetch-Site` / `Origin`.** Mutating `/api/*` requests with `Sec-Fetch-Site: cross-site`
  or an `Origin` whose hostname is neither allowed nor the request's own `Host` get `403`. Only
  hostnames are compared, never ports or schemes.
- No CORS headers are ever sent, so no other origin can read responses either.

Rejections never log request bodies. All responses carry `X-Content-Type-Options: nosniff`.

## Resource limits

- `MAX_ACTIVE_JOBS` (default 8) caps pending + running generations; more → `429`.
- Video downloads are streamed into storage, never buffered in memory. Request bodies are capped
  (`/api/upload` 25 MB, `/api/generate/*` ≈ 69 MB of inline reference images; Vercel itself caps
  every request at 4.5 MB, which is why the browser uploads straight to Blob there).
- Direct-to-Blob uploads are only tokenised for `media/uploads/up_*.(png|jpg|webp)` pathnames,
  image content types and 25 MB; the server never fetches arbitrary urls: inputs must be its own
  `gen_*` / `up_*` names, on `/media/` or on a public Blob store domain, and must exist.
- Generated media on a public Blob store are world-readable by url (unguessable 12-character ids).

## Reporting a vulnerability

Please open a GitHub issue for anything that is not sensitive. If the report could put users at
risk (e.g. a way to read the stored key or escape `DATA_DIR`), open a
[private security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on the repository instead so it can be fixed before it's public.

Please include the commit or version, how you're running it (pnpm / Vercel / Docker), and steps to
reproduce. Redact your key from any logs you attach.
