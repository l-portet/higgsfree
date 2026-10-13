/** Local storage only: `/media/<file>` streams a file from DATA_DIR (with Range support). With Blob storage urls are absolute and this route never matches. */
import { handle } from "@hono/vercel";
import { createApp } from "@server/app.ts";

export const dynamic = "force-dynamic";

const handler = handle(createApp());

export { handler as GET, handler as HEAD };
