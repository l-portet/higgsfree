import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { GenerateResponse, ListGenerationsResponse } from "../../shared/types.ts";
import { notFound, payloadTooLarge } from "../errors.ts";
import { removeGeneration, retryGeneration } from "../jobs.ts";
import { log } from "../log.ts";
import { getGeneration, listGenerations, toPublic } from "../repo.ts";
import { listGenerationsSchema, parse } from "../schemas.ts";

/** Retry takes no fields, but clients send `{}`; anything larger is refused unread. */
const limit = bodyLimit({
  maxSize: 64 * 1024,
  onError: () => {
    throw payloadTooLarge("Request body exceeds 64 KB");
  },
});

export const generationsRoutes = new Hono()
  .get("/", async (c) => {
    const q = parse(listGenerationsSchema, c.req.query());
    const { items, nextCursor } = await listGenerations(q);
    const res: ListGenerationsResponse = { items: items.map(toPublic) };
    if (nextCursor) res.nextCursor = nextCursor;
    return c.json(res);
  })
  .get("/:id", async (c) => {
    const g = await getGeneration(c.req.param("id"));
    if (!g) throw notFound("Generation not found");
    return c.json(toPublic(g));
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const g = await getGeneration(id);
    if (!g) throw notFound("Generation not found");
    const removed = await removeGeneration(g);
    log.info(`generation ${id} deleted (${g.type}, ${g.status}, ${removed.uploads} orphaned upload(s) removed)`);
    return c.json({ ok: true as const });
  })
  .post("/:id/retry", limit, async (c) => {
    const generations = await retryGeneration(c.req.param("id"));
    const res: GenerateResponse = { generations };
    return c.json(res);
  });
