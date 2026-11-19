/**
 * The Replicate pass-through, the app's other server route beside ByteDance's. What may pass, and what is never
 * kept, is in `src/server/replicate-proxy.ts`. Node runtime (the default). Only short JSON calls go through: a
 * finished image or video is fetched by the browser from Replicate's CDN.
 */
import { handleReplicateProxy } from "../../../../server/replicate-proxy";

/** Seconds: a call is given up on after 100 (`API_TIMEOUT_MS`). */
export const maxDuration = 120;

export const GET = handleReplicateProxy;
export const POST = handleReplicateProxy;
