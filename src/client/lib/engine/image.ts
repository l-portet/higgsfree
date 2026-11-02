/**
 * Image batches: one record per image, each its own provider call, all in parallel.
 * A call cannot be resumed, so the tab that starts it must stay open until it answers.
 */
import type { Generation, ImageGenerateRequest, ImageModel, ImageParams, MediaRef, ProviderId } from "@shared/types";
import { lookupImageModel } from "../catalog";
import { base64ToBytes, parseDataUrl } from "../data-url";
import { completeGeneration, insertGenerations, toPublic, toStored, type StoredGeneration } from "../db/generations";
import type { MediaRow } from "../db/schema";
import { ApiClientError, badRequest } from "../errors";
import { detectImage } from "../image-meta";
import { publish } from "../live";
import * as fal from "../fal";
import { buildFalImagePayload } from "../fal-payloads";
import { quoteImage } from "../image-cost";
import { upscaleFactor } from "../upscale";
import { pinQuote } from "../video-cost";
import { isTaskProvider, TASK_PROVIDERS, type TaskProvider } from "../task-providers";
import { errorMessage, log } from "../log";
import { newBatchId, newGenerationId, outputMediaId } from "../media-ids";
import * as or from "../openrouter";
import { buildImagePayload } from "../payloads";
import { getStoredKey } from "../settings";
import { validateImageRequest } from "../validate";
import { IMAGE_TIMEOUT_MS, limits, timing } from "./constants";
import { assertInputsExist, inputDataUrls, pngDataUrl, storedImageSize } from "./inputs";
import { keyFor, resolveRun, storedKeys } from "./provider";
import { failGeneration, isCancelled, savePublish, tryWithJobLock } from "./state";

const fmtCost = (c: number | undefined): string => (c === undefined ? "n/a" : `$${c.toFixed(4)}`);

/** Called when a generation completed: the Shell asks the browser for persistent storage the first time. */
let onCompleted: (() => void) | undefined;
export function setOnCompleted(fn: (() => void) | undefined): void {
  onCompleted = fn;
}

export async function submitImageBatch(req: ImageGenerateRequest): Promise<Generation[]> {
  const model = await lookupImageModel(req.model, getStoredKey());
  if (!model) throw badRequest(`Unknown image model: ${req.model}`);
  // 401 now when no provider of the model has a key.
  const keyed = resolveRun(model);
  const prompt = req.prompt.trim();
  validateImageRequest(model, { ...req, prompt });
  const refIds = req.referenceImages ?? [];
  await assertInputsExist({ referenceImages: refIds });
  // Upscalers: the scale sent, and the image's size (fal's Topaz bills by the output's).
  const factor = model.caps.upscale ? upscaleFactor(model, req.upscale) : undefined;
  const input = model.caps.upscale && refIds[0] ? await storedImageSize(refIds[0]) : {};
  // The provider picked in the composer, else the cheapest, that can take the request (`quoteImage`); when none with a
  // key can, the key-based choice stands and its refusal says why.
  const quote = quoteImage(
    model,
    { aspectRatio: req.aspectRatio, size: req.size, count: req.count, references: refIds.length, upscale: factor, inputWidth: input.width, inputHeight: input.height },
    storedKeys(),
  );
  const chosen = pinQuote(quote, req.provider).provider;
  const chosenKey = chosen ? keyFor(chosen) : undefined;
  const { provider, key } = chosen && chosenKey ? { provider: chosen, key: chosenKey } : keyed;

  const ts = new Date().toISOString();
  const batchId = newBatchId();
  const params: ImageParams = { aspectRatio: req.aspectRatio, size: req.size, ...(factor ? { upscale: factor } : {}) };
  const rows: StoredGeneration[] = [];
  for (let i = 0; i < req.count; i++) {
    const g: Generation = {
      id: newGenerationId(), type: "image", status: "pending", prompt, model: model.id, modelName: model.name, params, batchId, batchIndex: i, provider, createdAt: ts, updatedAt: ts,
    };
    if (refIds.length > 0) g.inputs = { referenceImages: refIds };
    rows.push(toStored(g));
  }
  await insertGenerations(rows, limits.maxActiveJobs);
  for (const row of rows) publish({ type: "generation", generation: toPublic(row) });
  log.info(`batch ${batchId}: ${rows.length} image(s) model=${model.id} via=${provider} ar=${params.aspectRatio} size=${params.size} refs=${refIds.length}`);
  void runImageBatch(provider, key, model, rows, refIds);
  return rows.map(toPublic);
}

async function runImageBatch(provider: ProviderId, key: string, model: ImageModel, rows: StoredGeneration[], refIds: string[]): Promise<void> {
  let refDataUrls: string[];
  try {
    refDataUrls = await inputDataUrls(refIds);
  } catch (err) {
    await Promise.allSettled(rows.map((row) => failGeneration(row.id, err)));
    return;
  }
  await Promise.allSettled(rows.map((row) => tryWithJobLock(row.id, "image", (signal) => runImage(provider, key, model, row, refDataUrls, signal))));
}

/** fal answers with a CDN url; the bytes are fetched (no key) and sniffed like any other image. */
async function falImageBytes(key: string, model: ImageModel, row: StoredGeneration, refDataUrls: string[], signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const params = row.params as ImageParams;
  // An endpoint that takes PNG only (Recraft Crisp) gets the image redrawn as one.
  const refs = model.fal?.upscale?.png ? await Promise.all(refDataUrls.map(pngDataUrl)) : refDataUrls;
  const { endpoint, input } = buildFalImagePayload(model, { prompt: row.prompt, aspectRatio: params.aspectRatio, size: params.size, upscale: params.upscale }, refs);
  // Generators answer with a list, upscalers with the one image.
  const res = await fal.run<{ images?: { url?: string }[]; image?: { url?: string } }>(key, endpoint, input, signal);
  const url = res.images?.[0]?.url ?? res.image?.url;
  if (!url) throw new ApiClientError(502, "fal returned no image", res);
  return new Uint8Array(await (await fal.download(url, signal)).arrayBuffer());
}

/** kie.ai and APIMart run images as tasks too: the references are uploaded first, then the task is polled here until the image is ready. */
async function taskImage(tp: TaskProvider, key: string, model: ImageModel, row: StoredGeneration, refDataUrls: string[], signal: AbortSignal): Promise<{ bytes: Uint8Array<ArrayBuffer>; costUsd?: number }> {
  const params = row.params as ImageParams;
  const refs = await Promise.all(refDataUrls.map((u) => tp.uploadImage(key, u, signal)));
  const url = tp.taskUrl(await tp.image(model, { prompt: row.prompt, aspectRatio: params.aspectRatio, size: params.size, upscale: params.upscale }, refs).submit(key, signal));
  for (;;) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timing.pollIntervalMs);
      signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
    });
    if (signal.aborted) {
      const reason: unknown = signal.reason;
      throw reason instanceof DOMException && reason.name === "TimeoutError" ? new ApiClientError(504, `Timed out waiting for ${tp.name}`) : new ApiClientError(499, "Request cancelled");
    }
    const t = await tp.status(key, url, signal);
    if (t.state === "failed") throw new ApiClientError(502, t.error ?? `${tp.name} reported a failure`);
    if (t.state !== "done") continue;
    const out = t.urls[0];
    if (!out) throw new ApiClientError(502, `${tp.name} reported success but returned no image url`);
    const bytes = new Uint8Array(await (await tp.download(out, signal, key)).arrayBuffer());
    return t.costUsd !== undefined ? { bytes, costUsd: t.costUsd } : { bytes };
  }
}

async function runImage(provider: ProviderId, key: string, model: ImageModel, row: StoredGeneration, refDataUrls: string[], cancel: AbortSignal): Promise<void> {
  const startedAt = Date.now();
  const running = await savePublish(row.id, { status: "running" });
  if (!running) return; // deleted before it started
  const signal = or.anySignal([cancel, AbortSignal.timeout(IMAGE_TIMEOUT_MS)]);
  const params = row.params as ImageParams;
  let costUsd: number | undefined;
  try {
    let bytes: Uint8Array<ArrayBuffer>;
    const payload = provider === "openrouter" ? buildImagePayload(model, { prompt: row.prompt, aspectRatio: params.aspectRatio, size: params.size }, refDataUrls) : undefined;
    if (isTaskProvider(provider)) {
      const res = await taskImage(TASK_PROVIDERS[provider], key, model, row, refDataUrls, signal);
      bytes = res.bytes;
      costUsd = res.costUsd;
    } else if (!payload) {
      bytes = await falImageBytes(key, model, row, refDataUrls, signal);
    } else if (payload.endpoint === "chat") {
      const res = await or.chatImage(key, payload.body, { signal });
      costUsd = res.costUsd;
      const parsed = parseDataUrl(res.dataUrl);
      if (!parsed) throw new ApiClientError(502, "Model returned an unreadable image data URL");
      bytes = parsed.bytes;
    } else {
      const res = payload.endpoint === "native" ? await or.nativeImage(key, payload.body, { signal }) : await or.imagesGenerations(key, payload.body, { signal });
      costUsd = res.costUsd;
      bytes = base64ToBytes(res.b64);
    }
    const meta = detectImage(bytes);
    if (!meta) throw new ApiClientError(502, "Provider returned data that is not a PNG, JPEG or WebP image");
    const mediaId = outputMediaId(row.id, meta.ext);
    const media: MediaRow = { id: mediaId, kind: "output", mime: meta.mime, bytes: bytes.byteLength, createdAt: new Date().toISOString(), blob: new Blob([bytes], { type: meta.mime }) };
    const output: MediaRef = { id: mediaId, mime: meta.mime, bytes: bytes.byteLength };
    if (meta.width && meta.height) {
      output.width = meta.width;
      output.height = meta.height;
    }
    const completedAt = new Date().toISOString();
    const patch = { status: "completed" as const, output, completedAt, elapsedMs: Date.now() - startedAt, ...(costUsd !== undefined ? { costUsd } : {}) };
    const done = await completeGeneration(row.id, patch, media);
    if (!done) return; // deleted while running: nothing was written
    publish({ type: "generation", generation: toPublic(done) });
    log.info(`job ${row.id} image completed model=${model.id} ${output.width ?? "?"}x${output.height ?? "?"} ${Math.round((patch.elapsedMs) / 1000)}s cost=${fmtCost(costUsd)}`);
    onCompleted?.();
  } catch (err) {
    if (isCancelled(cancel)) return;
    log.warn(`job ${row.id} image failed: ${errorMessage(err)}`);
    await failGeneration(row.id, err, costUsd !== undefined ? { costUsd } : {});
  }
}
