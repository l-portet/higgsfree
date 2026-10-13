/**
 * Every `/api/*` request goes to the Hono app in `src/server` (routes, security guard,
 * error shape). Node.js runtime on Fluid Compute; image generation and video downloads
 * keep running after the response via `waitUntil`, up to `maxDuration`.
 */
import { handle } from "@hono/vercel";
import { createApp } from "@server/app.ts";

export const dynamic = "force-dynamic";
// 300 s is the ceiling on Hobby; Pro can raise it to 800. An image request is one provider call.
export const maxDuration = 300;

const handler = handle(createApp());

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as HEAD, handler as OPTIONS };
