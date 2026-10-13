/**
 * Image batches: one record per image, each its own provider call, all in parallel.
 * A call cannot be resumed, so the tab that starts it must stay open until it answers.
 */
import type { Generation, ImageGenerateRequest, ImageModel, ImageParams, MediaRef } from "@shared/types";
import { lookupImageModel } from "../catalog";
import { base64ToBytes, parseDataUrl } from "../data-url";
import { completeGeneration, insertGenerations, toPublic, toStored, type StoredGeneration } from "../db/generations";
import type { MediaRow } from "../db/schema";
import { ApiClientError, badRequest } from "../errors";
import { detectImage } from "../image-meta";
import { publish } from "../live";
import { errorMessage, log } from "../log";
import { newBatchId, newGenerationId, outputMediaId } from "../media-ids";
import * as or from "../openrouter";
import { buildImagePayload } from "../payloads";
import { requireApiKey } from "../settings";
import { validateImageRequest } from "../validate";
import { IMAGE_TIMEOUT_MS, limits } from "./constants";
import { assertInputsExist, inputDataUrls } from "./inputs";
import { failGeneration, isCancelled, savePublish, tryWithJobLock } from "./state";

const fmtCost = (c: number | undefined): string => (c === undefined ? "n/a" : `$${c.toFixed(4)}`);

/** Called when a generation completed: the Shell asks the browser for persistent storage the first time. */
let onCompleted: (() => void) | undefined;
export function setOnCompleted(fn: (() => void) | undefined): void {
  onCompleted = fn;
}

export async function submitImageBatch(req: ImageGenerateRequest): Promise<Generation[]> {
  const key = requireApiKey();
  const model = await lookupImageModel(req.model, key);
  if (!model) throw badRequest(`Unknown image model: ${req.model}`);
  const prompt = req.prompt.trim();
  validateImageRequest(model, { ...req, prompt });
  const refIds = req.referenceImages ?? [];
  await assertInputsExist({ referenceImages: refIds });

  const ts = new Date().toISOString();
  const batchId = newBatchId();
  const params: ImageParams = { aspectRatio: req.aspectRatio, size: req.size };
  const rows: StoredGeneration[] = [];
  for (let i = 0; i < req.count; i++) {
    const g: Generation = {
      id: newGenerationId(), type: "image", status: "pending", prompt, model: model.id, modelName: model.name, params, batchId, batchIndex: i, createdAt: ts, updatedAt: ts,
    };
    if (refIds.length > 0) g.inputs = { referenceImages: refIds };
    rows.push(toStored(g));
  }
  await insertGenerations(rows, limits.maxActiveJobs);
  for (const row of rows) publish({ type: "generation", generation: toPublic(row) });
  log.info(`batch ${batchId}: ${rows.length} image(s) model=${model.id} ar=${params.aspectRatio} size=${params.size} refs=${refIds.length}`);
  void runImageBatch(key, model, rows, refIds);
  return rows.map(toPublic);
}

async function runImageBatch(key: string, model: ImageModel, rows: StoredGeneration[], refIds: string[]): Promise<void> {
  let refDataUrls: string[];
  try {
    refDataUrls = await inputDataUrls(refIds);
  } catch (err) {
    await Promise.allSettled(rows.map((row) => failGeneration(row.id, err)));
    return;
  }
  await Promise.allSettled(rows.map((row) => tryWithJobLock(row.id, "image", (signal) => runImage(key, model, row, refDataUrls, signal))));
}

async function runImage(key: string, model: ImageModel, row: StoredGeneration, refDataUrls: string[], cancel: AbortSignal): Promise<void> {
  const startedAt = Date.now();
  const running = await savePublish(row.id, { status: "running" });
  if (!running) return; // deleted before it started
  const signal = or.anySignal([cancel, AbortSignal.timeout(IMAGE_TIMEOUT_MS)]);
  const params = row.params as ImageParams;
  let costUsd: number | undefined;
  try {
    const payload = buildImagePayload(model, { prompt: row.prompt, aspectRatio: params.aspectRatio, size: params.size }, refDataUrls);
    let bytes: Uint8Array<ArrayBuffer>;
    if (payload.endpoint === "chat") {
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
