/**
 * The ByteDance pass-through (`src/app/api/bytedance/[...path]/route.ts`): ModelArk refuses direct browser calls, so
 * the browser sends its ByteDance calls here and this forwards each one, once, to ModelArk. It is not an open proxy:
 *
 *  - `POST /api/bytedance/v3/contents/generations/tasks`            → `POST {MODELARK_API}/contents/generations/tasks`
 *  - `GET  /api/bytedance/v3/contents/generations/tasks?page_size=N` → the key test (N from 1 to 100)
 *  - `GET  /api/bytedance/v3/contents/generations/tasks/<cgt-id>`    → a task's status
 *  - `POST /api/bytedance/media` `{ url }`                          → a finished video, streamed from ModelArk's TOS
 *    bucket (`BYTEDANCE_FILE_HOSTS`), without the key
 *
 * Every other path, method or query is refused (404, 405 or 400) before anything leaves the server.
 *
 * The key arrives in the request's `Authorization` header and is used for that one upstream call: it is never stored,
 * cached or logged. There is no module state, nothing here writes to the console, and errors are answered with fixed
 * messages (never the caught error, never a header). ModelArk's own status and body go back unchanged, so the browser
 * shows its real errors (a bad key, a model not activated, a refused face).
 */
import { BYTEDANCE_PROXY_API, BYTEDANCE_PROXY_MAX_BODY_BYTES, BYTEDANCE_PROXY_MEDIA, BYTEDANCE_TASK_ID, isBytedanceFileUrl, MODELARK_API } from "@shared/bytedance-proxy";

const TASKS = `${BYTEDANCE_PROXY_API}/contents/generations/tasks`;
/** ModelArk answers a submit in seconds; the browser gives up on it after 90. */
const API_TIMEOUT_MS = 100_000;
/** Until the file host starts answering; the bytes then stream for as long as the function may run. */
const MEDIA_HEADERS_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 3;
/** `{ "url": "…" }`: a presigned link is well under this. */
const MAX_MEDIA_REQUEST_BYTES = 16 * 1024;
const BEARER = /^Bearer [\x21-\x7e]{1,1024}$/;
const PAGE_SIZE = /^(?:[1-9]|[1-9][0-9]|100)$/;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** An error in ModelArk's own shape (`{ error: { code, message } }`), so the browser reads it the same way. */
function fail(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error: { code, message } }, { status, headers: { ...NO_STORE, ...headers } });
}

/** The ModelArk call a request stands for, or the refusal: only the three calls the app makes pass. */
export function modelArkTarget(method: string, url: URL): { target: string; body: boolean } | Response {
  const path = url.pathname;
  const query = [...url.searchParams];
  if (path === TASKS) {
    if (method === "POST") return query.length ? fail(400, "InvalidQuery", "Submitting a task takes no query") : { target: `${MODELARK_API}/contents/generations/tasks`, body: true };
    if (method === "GET") {
      const [only] = query;
      if (query.length !== 1 || only?.[0] !== "page_size" || !PAGE_SIZE.test(only[1])) return fail(400, "InvalidQuery", "Listing tasks takes page_size (1 to 100) and nothing else");
      return { target: `${MODELARK_API}/contents/generations/tasks?page_size=${only[1]}`, body: false };
    }
    return fail(405, "MethodNotAllowed", `${method} is not allowed here`, { Allow: "GET, POST" });
  }
  if (path.startsWith(`${TASKS}/`)) {
    const id = path.slice(TASKS.length + 1);
    if (!BYTEDANCE_TASK_ID.test(id)) return fail(400, "InvalidTaskId", "Not a ByteDance video task id");
    if (method !== "GET") return fail(405, "MethodNotAllowed", `${method} is not allowed here`, { Allow: "GET" });
    if (query.length) return fail(400, "InvalidQuery", "Reading a task takes no query");
    return { target: `${MODELARK_API}/contents/generations/tasks/${id}`, body: false };
  }
  return fail(404, "NotFound", "Not a ByteDance call this server passes on");
}

const isJson = (type: string | null): boolean => /^application\/json\s*(?:;|$)/i.test(type ?? "");

/** The request body, or null past `max` bytes (by its Content-Length, or as it streams in). */
async function readBody(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(req.headers.get("content-length")) > max) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const isTimeout = (err: unknown): boolean => err instanceof DOMException && err.name === "TimeoutError";

/** A redirect's `Location`, resolved against the url that sent it. */
function resolveRedirect(location: string | null, base: string): string | undefined {
  if (!location) return undefined;
  try {
    return new URL(location, base).toString();
  } catch {
    return undefined;
  }
}

/** One ModelArk call, with the caller's key, answered with ModelArk's own status and body. */
async function forwardToModelArk(req: Request): Promise<Response> {
  const route = modelArkTarget(req.method, new URL(req.url));
  if (route instanceof Response) return route;
  const auth = req.headers.get("authorization");
  if (!auth || !BEARER.test(auth)) return fail(401, "AuthenticationError", "No ByteDance key was sent (Authorization: Bearer <ModelArk API key>)");
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (route.body) {
    if (!isJson(req.headers.get("content-type"))) return fail(415, "UnsupportedMediaType", "Send the task as application/json");
    const read = await readBody(req, BYTEDANCE_PROXY_MAX_BODY_BYTES);
    if (!read) return fail(413, "RequestTooLarge", `Too large for the ByteDance pass-through: requests go up to ${BYTEDANCE_PROXY_MAX_BODY_BYTES / 1024 / 1024} MB, images included`);
    body = read;
  }
  let upstream: Response;
  try {
    upstream = await fetch(route.target, {
      method: req.method,
      headers: body ? { Authorization: auth, "Content-Type": "application/json" } : { Authorization: auth },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
    });
  } catch (err) {
    // The caught error is not passed on or logged: only which of two things happened.
    return isTimeout(err) ? fail(504, "UpstreamTimeout", "ByteDance did not answer in time") : fail(502, "UpstreamUnreachable", "Could not reach ByteDance (BytePlus ModelArk)");
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel();
    return fail(502, "UpstreamRedirect", "ByteDance answered with a redirect, which the server does not follow");
  }
  return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", ...NO_STORE } });
}

/**
 * A finished video (or image) from ModelArk's storage, streamed through: the url must be https on an allowlisted host,
 * and so must every redirect. Nothing is kept; the key is neither needed nor sent.
 */
async function streamMedia(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail(405, "MethodNotAllowed", `${req.method} is not allowed here`, { Allow: "POST" });
  if (new URL(req.url).search) return fail(400, "InvalidQuery", "The file url goes in the body: { url }");
  if (!isJson(req.headers.get("content-type"))) return fail(415, "UnsupportedMediaType", "Send { url } as application/json");
  const raw = await readBody(req, MAX_MEDIA_REQUEST_BYTES);
  if (!raw) return fail(413, "RequestTooLarge", "Send only { url }");
  let url: unknown;
  try {
    url = (JSON.parse(new TextDecoder().decode(raw)) as { url?: unknown } | null)?.url;
  } catch {
    url = undefined;
  }
  if (typeof url !== "string") return fail(400, "InvalidRequest", "Send { url } as application/json");
  if (!isBytedanceFileUrl(url)) return fail(403, "HostNotAllowed", "Not a ByteDance result url this server fetches");

  const headersTimeout = new AbortController();
  const timer = setTimeout(() => headersTimeout.abort(new DOMException("File host timed out", "TimeoutError")), MEDIA_HEADERS_TIMEOUT_MS);
  const signal = AbortSignal.any([req.signal, headersTimeout.signal]);
  let upstream: Response | undefined;
  try {
    let target = url;
    for (let hops = 0; ; hops++) {
      upstream = await fetch(target, { cache: "no-store", redirect: "manual", signal });
      if (upstream.status < 300 || upstream.status >= 400) break;
      await upstream.body?.cancel();
      const next = resolveRedirect(upstream.headers.get("location"), target);
      if (!next || !isBytedanceFileUrl(next) || hops >= MAX_REDIRECTS) return fail(502, "RedirectNotAllowed", "ByteDance's file host redirected off its own hosts");
      target = next;
    }
  } catch (err) {
    return isTimeout(err) || isTimeout(signal.reason) ? fail(504, "UpstreamTimeout", "ByteDance's file host did not answer in time") : fail(502, "UpstreamUnreachable", "Could not reach ByteDance's file host");
  } finally {
    clearTimeout(timer);
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    return fail(upstream.status >= 500 ? 502 : upstream.status, "FileHostError", `ByteDance's file host answered HTTP ${upstream.status}`);
  }
  // Served from this origin, so the bytes are only ever a video or an image to download, never a page.
  const type = upstream.headers.get("content-type") ?? "";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": /^(?:video|image)\/[\w.+-]+$/i.test(type) ? type : "application/octet-stream",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      ...NO_STORE,
    },
  });
}

/** Every request under `/api/bytedance/`. Nothing in here throws: an unexpected failure is a bare 500, unlogged. */
export async function handleBytedanceProxy(req: Request): Promise<Response> {
  try {
    const path = new URL(req.url).pathname;
    if (path === BYTEDANCE_PROXY_MEDIA) return await streamMedia(req);
    if (path.startsWith(`${BYTEDANCE_PROXY_API}/`)) return await forwardToModelArk(req);
    return fail(404, "NotFound", "Not a ByteDance call this server passes on");
  } catch {
    return fail(500, "ProxyError", "The ByteDance pass-through failed");
  }
}
