import fs from "node:fs";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { mimeForFile, resolveMediaPath } from "../media.ts";
import { parseRange } from "../range.ts";

const IMMUTABLE = "public, max-age=31536000, immutable";

export const mediaRoutes = new Hono().get("/:file", async (c) => {
  const name = c.req.param("file");
  const file = resolveMediaPath(name);
  if (!file) return c.json({ error: "Not found", status: 404 }, 404);
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return c.json({ error: "Not found", status: 404 }, 404);
  }
  if (!stat.isFile()) return c.json({ error: "Not found", status: 404 }, 404);

  const size = stat.size;
  const headers: Record<string, string> = {
    "Content-Type": mimeForFile(file),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": IMMUTABLE,
    "Accept-Ranges": "bytes",
    "Last-Modified": stat.mtime.toUTCString(),
  };

  // Malformed / multi-range headers come back undefined and get the whole file; only unsatisfiable ones 416.
  const range = parseRange(c.req.header("range"), size);
  if (range === "invalid") {
    return c.body(null, 416, { ...headers, "Content-Range": `bytes */${size}` });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  headers["Content-Length"] = String(end - start + 1);
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  const status = range ? 206 : 200;

  if (c.req.method === "HEAD" || size === 0) return c.body(null, status, headers);
  const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream;
  return c.body(stream, status, headers);
});
