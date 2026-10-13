import { Hono } from "hono";
import type { ModelsResponse } from "../../shared/types.ts";
import { IMAGE_MODELS, VIDEO_MODELS } from "../../shared/models.ts";
import { discoveredVideoModels } from "../catalog.ts";
import { listLiveModels } from "../openrouter.ts";
import { resolveApiKey } from "../settings.ts";

export const modelsRoutes = new Hono().get("/", async (c) => {
  const live = await listLiveModels(resolveApiKey().key);
  // Discovered models are derived from the snapshot just refreshed, so they follow the same 10-minute cadence.
  const res: ModelsResponse = { image: IMAGE_MODELS, video: [...VIDEO_MODELS.filter((m) => !m.hidden), ...discoveredVideoModels()] };
  if (live) res.live = { checkedAt: live.checkedAt, available: live.available };
  return c.json(res);
});
