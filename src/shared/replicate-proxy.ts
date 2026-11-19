/**
 * What the Replicate pass-through lets through. Replicate's API answers browsers from replicate.com only: from any
 * other site its preflights carry no `Access-Control-Allow-Origin`, on predictions and on file uploads alike (probed
 * 19 Nov 2026, docs/REPLICATE.md). So, like ByteDance, the browser calls these same-origin routes with the key it
 * keeps in localStorage; `src/server/replicate-proxy.ts` forwards each call once and stores nothing. Shared by that
 * server code and the browser client (`src/client/lib/replicate.ts`), so both agree on what may pass.
 */

/** Replicate's API: the one host the key goes to. */
export const REPLICATE_UPSTREAM_API = "https://api.replicate.com/v1";

/** Where the browser sends Replicate calls: `${REPLICATE_PROXY_API}/models/<owner>/<name>/predictions`, `/predictions/<id>`, `/account`. */
export const REPLICATE_PROXY_API = "/api/replicate/v1";

/**
 * A model's owner or name as Replicate writes them (`black-forest-labs`, `flux-1.1-pro-ultra`, `kling-v4.0`): lower
 * case letters, digits, `-`, `_` and `.`, never starting with a dot, so nothing in one can change the upstream path.
 */
export const REPLICATE_NAME = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

/** `owner/name`, each part a `REPLICATE_NAME`. */
export function isReplicateModel(slug: string): boolean {
  const parts = slug.split("/");
  return parts.length === 2 && parts.every((p) => REPLICATE_NAME.test(p));
}

/** A prediction id as Replicate writes them (`gm3qorzdhgbfurvjtvhg6dckhu`): lower case letters and digits. */
export const REPLICATE_PREDICTION_ID = /^[a-z0-9]{8,64}$/;

/**
 * The largest request the server passes on: under Vercel's 4.5 MB limit on a function's request body. Frames and
 * reference images travel inside it as data URIs (the browser cannot reach Replicate's file upload either).
 */
export const REPLICATE_PROXY_MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Hosts a finished result is read from, by the browser itself and without the key: Replicate's file CDN, which
 * answers every origin (`Access-Control-Allow-Origin: *`). `replicate.delivery` and its subdomains, nothing else.
 */
export function isReplicateFileUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.port !== "" || u.username !== "" || u.password !== "") return false;
  return u.hostname === "replicate.delivery" || u.hostname.endsWith(".replicate.delivery");
}
