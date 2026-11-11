/**
 * The one server-side piece of higgsfree: a stateless pass-through to ByteDance's BytePlus ModelArk, which refuses
 * direct browser calls (its image API rejects the Authorization header in a preflight, its error answers carry no
 * CORS headers, and the TOS bucket its videos are on has CORS turned off). The browser calls these same-origin routes
 * with the key it keeps in localStorage; `src/server/bytedance-proxy.ts` forwards each call once and stores nothing.
 * Shared by that server code and the browser client (`src/client/lib/bytedance.ts`), so both agree on what may pass.
 */

/** ModelArk's API in region ap-southeast-1 (the only region with the Seedance video models): the one host the key goes to. */
export const MODELARK_API = "https://ark.ap-southeast.bytepluses.com/api/v3";

/** Where the browser sends ModelArk calls: `${BYTEDANCE_PROXY_API}/contents/generations/tasks[/<id>]`. */
export const BYTEDANCE_PROXY_API = "/api/bytedance/v3";
/** Where the browser reads a finished video through the server: `POST { url }`, no key. */
export const BYTEDANCE_PROXY_MEDIA = "/api/bytedance/media";

/**
 * Hosts a finished result may be read from: ModelArk's TOS bucket in ap-southeast-1, the host of every `video_url` in
 * its docs (read 11 Nov 2026). Exact names, no wildcard: anything else stays a link the user opens in a tab.
 */
export const BYTEDANCE_FILE_HOSTS: readonly string[] = ["ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com"];

/**
 * A video task id as ModelArk writes them (`cgt-20250730114109-jfd6d` in its docs): letters, digits, `-` and `_`, so
 * nothing in it can change the upstream path.
 */
export const BYTEDANCE_TASK_ID = /^cgt-[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * The largest request the server passes on: under Vercel's 4.5 MB limit on a function's request body (ModelArk itself
 * takes 64 MB). Frames and style references travel inside it as data URLs.
 */
export const BYTEDANCE_PROXY_MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Whether a finished result's url is one the server will fetch: https, default port, an allowlisted host. */
export function isBytedanceFileUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === "https:" && u.port === "" && u.username === "" && u.password === "" && BYTEDANCE_FILE_HOSTS.includes(u.hostname);
}
