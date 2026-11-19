/**
 * What the server's pass-throughs share (`bytedance-proxy.ts`, `replicate-proxy.ts`): reading a request body up to a
 * size, and telling a timeout from an unreachable host. Nothing here keeps state or writes to the console.
 */

/** On every answer: nothing a pass-through returns may be cached. */
export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** A provider key as it arrives: `Bearer` and one printable token, so nothing in it can add a header. */
export const BEARER = /^Bearer [\x21-\x7e]{1,1024}$/;

export const isJson = (type: string | null): boolean => /^application\/json\s*(?:;|$)/i.test(type ?? "");

export const isTimeout = (err: unknown): boolean => err instanceof DOMException && err.name === "TimeoutError";

/** The request body, or null past `max` bytes (by its Content-Length, or as it streams in). */
export async function readBody(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
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
