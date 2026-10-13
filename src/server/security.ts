/**
 * Origin / Host guard. The server has no auth, so the browser's same-origin
 * policy is the only thing standing between a random website and the user's
 * OpenRouter credits. Three layers, all cheap and dependency-free:
 *
 *  1. `Host` must be one of the allowed hostnames (defeats DNS rebinding, which
 *     gives a hostile page full same-origin access under its own hostname).
 *  2. Mutating `/api/*` requests that carry a body must be JSON or multipart
 *     (a cross-origin `text/plain` POST is a CORS "simple request" that is sent
 *     without a preflight; Hono's `c.req.json()` would happily parse it).
 *  3. `Sec-Fetch-Site` / `Origin`, when the browser sends them, must point at
 *     this app. Only hostnames are compared, never ports or schemes: in dev the
 *     same guard runs whatever port Next is on, in dev or behind a proxy.
 *
 * Only the `Host` header as received is consulted, never `X-Forwarded-Host`
 * or any other `X-Forwarded-*` header, since anything that can reach the port
 * could set them. A reverse proxy must therefore pass the browser's `Host`
 * through (nginx: `proxy_set_header Host $host;`) and its public hostname must
 * be allowed. `ALLOWED_HOSTS=*` disables the Host / Origin hostname checks for
 * people behind a trusted reverse proxy.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { ApiError } from "../shared/types.ts";
import { log } from "./log.ts";

export type AllowedHosts = Set<string> | "*";

export const DEFAULT_ALLOWED_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];

/** Lower-case, strip IPv6 brackets and a trailing dot. */
export function normalizeHostname(h: string): string {
  return h.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

/** Hostname part of a `Host` header (`localhost:8787` → `localhost`, `[::1]:8787` → `::1`). */
export function hostnameOf(hostHeader: string | undefined): string | undefined {
  if (!hostHeader) return undefined;
  const v = hostHeader.trim();
  if (!v) return undefined;
  if (v.startsWith("[")) {
    const end = v.indexOf("]");
    if (end < 0) return undefined;
    return normalizeHostname(v.slice(1, end)) || undefined;
  }
  const colon = v.indexOf(":");
  // One colon → host:port. More than one → a bare IPv6 literal without brackets.
  const bare = colon >= 0 && v.indexOf(":", colon + 1) < 0 ? v.slice(0, colon) : v;
  return normalizeHostname(bare) || undefined;
}

/** Hostname of an `Origin` header (`https://evil.example:8443` → `evil.example`); `null` / junk → undefined. */
export function originHostname(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  try {
    return normalizeHostname(new URL(origin).hostname) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the allowed-host set from the `ALLOWED_HOSTS` env value (comma-separated
 * hostnames; `*` = allow everything) plus the loopback names, `APP_URL`'s host and
 * any `extra` hostnames (the urls Vercel assigns to a deployment).
 */
export function parseAllowedHosts(raw: string | undefined, appUrl?: string, extra: readonly (string | undefined)[] = []): AllowedHosts {
  const set = new Set<string>(DEFAULT_ALLOWED_HOSTS);
  const appHost = originHostname(appUrl);
  if (appHost) set.add(appHost);
  for (const e of extra) {
    const host = e ? hostnameOf(e) : undefined;
    if (host) set.add(host);
  }
  for (const part of (raw ?? "").split(",")) {
    const v = part.trim();
    if (!v) continue;
    if (v === "*") return "*";
    // Accept "host", "host:port", "[::1]:port" or a full URL; only the hostname is kept.
    const host = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? originHostname(v) : hostnameOf(v);
    if (host) set.add(host);
  }
  return set;
}

export function isAllowedHost(allowed: AllowedHosts, hostname: string | undefined): boolean {
  if (allowed === "*") return true;
  return hostname !== undefined && allowed.has(hostname);
}

const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const isApiPath = (p: string): boolean => p === "/api" || p.startsWith("/api/");

function requestHasBody(c: Context): boolean {
  const len = c.req.header("content-length");
  if (len !== undefined) return Number.parseInt(len, 10) > 0;
  return c.req.header("transfer-encoding") !== undefined;
}

function reject(c: Context, status: 403 | 415, message: string, reason: string): Response {
  log.warn(`security: ${status} ${c.req.method} ${c.req.path}: ${reason}`);
  const body: ApiError = { error: message, status };
  return c.json(body, status);
}

export interface SecurityOptions {
  allowedHosts: AllowedHosts;
  /**
   * Skip the `Host` allow-list: the platform in front (Vercel) only routes a request here when
   * it was addressed to one of this deployment's own hostnames, so DNS rebinding cannot reach it.
   * `Origin` is then compared against the request's own `Host` (same-origin) as well as the list.
   */
  trustHost?: boolean;
}

export function securityGuard(opts: SecurityOptions): MiddlewareHandler {
  const { allowedHosts, trustHost = false } = opts;
  return async (c, next) => {
    // 1. Host: every route, including /api/health, /media/* and the pages.
    const hostHeader = c.req.header("host") ?? new URL(c.req.url).host;
    const host = hostnameOf(hostHeader);
    if (!trustHost && !isAllowedHost(allowedHosts, host)) {
      return reject(c, 403, "Unrecognised Host", `Host "${hostHeader}" is not allowed (set ALLOWED_HOSTS=${host ?? "<host>"} or ALLOWED_HOSTS=* to allow it)`);
    }

    if (MUTATING.has(c.req.method) && isApiPath(c.req.path)) {
      // 2. Body encoding: blocks CORS "simple requests" (text/plain, form-urlencoded).
      if (requestHasBody(c)) {
        const type = (c.req.header("content-type") ?? "").trim().toLowerCase();
        if (!type.startsWith("application/json") && !type.startsWith("multipart/form-data")) {
          return reject(c, 415, "Content-Type must be application/json", `Content-Type "${type || "(none)"}" rejected`);
        }
      }
      // 3. Fetch metadata / Origin: the browser tells us where the request came from.
      const site = c.req.header("sec-fetch-site")?.trim().toLowerCase();
      if (site && !SAFE_FETCH_SITES.has(site)) {
        return reject(c, 403, "Cross-site requests are not allowed", `Sec-Fetch-Site "${site}" rejected`);
      }
      const origin = c.req.header("origin");
      if (origin !== undefined) {
        const originHost = originHostname(origin);
        // Same hostname as the request itself is same-origin by definition (hostnames only, never ports:
        // in dev the browser talks to Next on :3000 and the same guard runs under any port).
        const sameOrigin = originHost !== undefined && host !== undefined && originHost === host;
        if (!sameOrigin && !isAllowedHost(allowedHosts, originHost)) {
          return reject(c, 403, "Origin not allowed", `Origin "${origin}" is not an allowed host`);
        }
      }
    }
    await next();
  };
}
