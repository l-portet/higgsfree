import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { CreditsResponse } from "../../shared/types.ts";
import { findImageModel } from "../../shared/models.ts";
import { lookupVideoModel } from "../catalog.ts";
import { cachedCredits, fetchCredits, invalidateCredits } from "../credits.ts";
import { badRequest, HttpError, payloadTooLarge } from "../errors.ts";
import { log } from "../log.ts";
import { isKeyRejected } from "../openrouter.ts";
import { parse, testKeySchema, updateSettingsSchema } from "../schemas.ts";
import { requireApiKey, resolveApiKey, setDefaults, setStoredApiKey, settingsResponse } from "../settings.ts";

/** A key and two model ids never need more than this. */
export const SETTINGS_BODY_LIMIT = 64 * 1024;
const limit = bodyLimit({
  maxSize: SETTINGS_BODY_LIMIT,
  onError: () => {
    throw payloadTooLarge("Request body exceeds 64 KB");
  },
});

export const settingsRoutes = new Hono()
  .get("/", async (c) => c.json(await settingsResponse()))
  .put("/", limit, async (c) => {
    const body = parse(updateSettingsSchema, await c.req.json());
    if (body.apiKey !== undefined) {
      await setStoredApiKey(body.apiKey);
      invalidateCredits();
      log.info(body.apiKey.trim() ? "settings: OpenRouter key saved to DB" : "settings: OpenRouter key cleared from DB");
    }
    if (body.defaults) {
      if (body.defaults.imageModel && !findImageModel(body.defaults.imageModel)) {
        throw badRequest(`Unknown image model: ${body.defaults.imageModel}`);
      }
      if (body.defaults.videoModel) {
        const m = await lookupVideoModel(body.defaults.videoModel, (await resolveApiKey()).key);
        if (!m || m.hidden) throw badRequest(`Unknown video model: ${body.defaults.videoModel}`);
      }
      await setDefaults(body.defaults);
    }
    return c.json(await settingsResponse());
  })
  .post("/test", limit, async (c) => {
    const raw = await c.req.text();
    const body = parse(testKeySchema, raw.trim() ? JSON.parse(raw) : {});
    const key = body.apiKey?.trim() || (await resolveApiKey()).key;
    if (!key) throw badRequest("No key to test. Pass { apiKey } or configure one first.");
    try {
      const res: CreditsResponse = await fetchCredits(key);
      return c.json(res);
    } catch (err) {
      if (isKeyRejected(err)) throw new HttpError(401, "Invalid API key", (err as HttpError).provider);
      throw err;
    }
  });

export const creditsRoutes = new Hono().get("/", async (c) => {
  const key = await requireApiKey();
  const res: CreditsResponse = await cachedCredits(key);
  return c.json(res);
});
