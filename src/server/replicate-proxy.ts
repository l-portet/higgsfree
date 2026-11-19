/**
 * The Replicate pass-through (`src/app/api/replicate/[...path]/route.ts`): Replicate's API answers browsers from
 * replicate.com only, so the browser sends its Replicate calls here and this forwards each one, once, to Replicate.
 * It is not an open proxy:
 *
 *  - `POST /api/replicate/v1/models/<owner>/<name>/predictions` → `POST {REPLICATE}/models/<owner>/<name>/predictions`
 *  - `GET  /api/replicate/v1/predictions/<id>`                  → a prediction's status
 *  - `GET  /api/replicate/v1/account`                           → the key test
 *
 * Every other path, method or query is refused (404, 405 or 400) before anything leaves the server. Finished files
 * are not read here: the browser fetches them itself from Replicate's CDN, which allows it.
 *
 * The key arrives in the request's `Authorization` header and is used for that one upstream call: it is never stored,
 * cached or logged. There is no module state, nothing here writes to the console, and errors are answered with fixed
 * messages (never the caught error, never a header). Replicate's own status and body go back as they are, so the
 * browser shows its real errors (a bad key, no credit, a refused input); a prediction comes back without the `input`
 * it echoes (the images just sent, megabytes on every poll) and without its `logs`.
 */
import { isReplicateModel, REPLICATE_PREDICTION_ID, REPLICATE_PROXY_API, REPLICATE_PROXY_MAX_BODY_BYTES, REPLICATE_UPSTREAM_API } from "@shared/replicate-proxy";
import { BEARER, isJson, isTimeout, NO_STORE, readBody } from "./pass-through";

/** Replicate answers a submit in seconds; the browser gives up on it after 90. */
const API_TIMEOUT_MS = 100_000;

/** An error in Replicate's own shape (`{ title, detail, status }`), so the browser reads it the same way. */
function fail(status: number, title: string, detail: string, headers: Record<string, string> = {}): Response {
  return Response.json({ title, detail, status }, { status, headers: { ...NO_STORE, ...headers } });
}

interface Target {
  target: string;
  /** A request body is read and sent on (the submit). */
  body: boolean;
  /** The answer is a prediction: its `input` and `logs` are left out. */
  prediction: boolean;
}

function only(method: string, allowed: "GET" | "POST", url: URL, target: Target): Target | Response {
  if (method !== allowed) return fail(405, "MethodNotAllowed", `${method} is not allowed here`, { Allow: allowed });
  if (url.search) return fail(400, "InvalidQuery", "This call takes no query");
  return target;
}

/** The Replicate call a request stands for, or the refusal: only the three calls the app makes pass. */
export function replicateTarget(method: string, url: URL): Target | Response {
  const notFound = (): Response => fail(404, "NotFound", "Not a Replicate call this server passes on");
  if (!url.pathname.startsWith(`${REPLICATE_PROXY_API}/`)) return notFound();
  const parts = url.pathname.slice(REPLICATE_PROXY_API.length + 1).split("/");
  if (parts.length === 1 && parts[0] === "account") {
    return only(method, "GET", url, { target: `${REPLICATE_UPSTREAM_API}/account`, body: false, prediction: false });
  }
  if (parts.length === 2 && parts[0] === "predictions") {
    const id = parts[1] ?? "";
    if (!REPLICATE_PREDICTION_ID.test(id)) return fail(400, "InvalidPredictionId", "Not a Replicate prediction id");
    return only(method, "GET", url, { target: `${REPLICATE_UPSTREAM_API}/predictions/${id}`, body: false, prediction: true });
  }
  if (parts.length === 4 && parts[0] === "models" && parts[3] === "predictions") {
    const slug = `${parts[1]}/${parts[2]}`;
    if (!isReplicateModel(slug)) return fail(400, "InvalidModel", "Not a Replicate model name");
    return only(method, "POST", url, { target: `${REPLICATE_UPSTREAM_API}/models/${slug}/predictions`, body: true, prediction: true });
  }
  return notFound();
}

/** A prediction as the browser needs it: Replicate's answer minus the `input` it echoes and its `logs`. */
async function withoutInput(upstream: Response): Promise<Response> {
  const text = await upstream.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  const type = upstream.headers.get("content-type") ?? "application/json";
  if (!body || typeof body !== "object" || Array.isArray(body)) return new Response(text, { status: upstream.status, headers: { "Content-Type": type, ...NO_STORE } });
  const { input: _input, logs: _logs, ...rest } = body as Record<string, unknown>;
  return Response.json(rest, { status: upstream.status, headers: NO_STORE });
}

/** One Replicate call, with the caller's key, answered with Replicate's own status and body. */
async function forwardToReplicate(req: Request): Promise<Response> {
  const route = replicateTarget(req.method, new URL(req.url));
  if (route instanceof Response) return route;
  const auth = req.headers.get("authorization");
  if (!auth || !BEARER.test(auth)) return fail(401, "Unauthenticated", "No Replicate key was sent (Authorization: Bearer <Replicate API token>)");
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (route.body) {
    if (!isJson(req.headers.get("content-type"))) return fail(415, "UnsupportedMediaType", "Send the prediction as application/json");
    const read = await readBody(req, REPLICATE_PROXY_MAX_BODY_BYTES);
    if (!read) return fail(413, "RequestTooLarge", `Too large for the Replicate pass-through: requests go up to ${REPLICATE_PROXY_MAX_BODY_BYTES / 1024 / 1024} MB, images included`);
    body = read;
  }
  try {
    const upstream = await fetch(route.target, {
      method: req.method,
      headers: body ? { Authorization: auth, "Content-Type": "application/json" } : { Authorization: auth },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return fail(502, "UpstreamRedirect", "Replicate answered with a redirect, which the server does not follow");
    }
    if (route.prediction && upstream.ok) return await withoutInput(upstream);
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", ...NO_STORE } });
  } catch (err) {
    // The caught error is not passed on or logged: only which of two things happened.
    return isTimeout(err) ? fail(504, "UpstreamTimeout", "Replicate did not answer in time") : fail(502, "UpstreamUnreachable", "Could not reach Replicate");
  }
}

/** Every request under `/api/replicate/`. Nothing in here throws: an unexpected failure is a bare 500, unlogged. */
export async function handleReplicateProxy(req: Request): Promise<Response> {
  try {
    return await forwardToReplicate(req);
  } catch {
    return fail(500, "ProxyError", "The Replicate pass-through failed");
  }
}
