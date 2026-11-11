/**
 * The ByteDance pass-through: the only server code in the app. What may pass, and what is never kept, is in
 * `src/server/bytedance-proxy.ts`. Node runtime (the default): a finished video streams through, which a function
 * may do past Vercel's 4.5 MB response limit, for as long as `maxDuration` allows.
 */
import { handleBytedanceProxy } from "../../../../server/bytedance-proxy";

/** Seconds: the most a Vercel Hobby function may run (a long 4K clip still has to stream through). */
export const maxDuration = 300;

export const GET = handleBytedanceProxy;
export const POST = handleBytedanceProxy;
