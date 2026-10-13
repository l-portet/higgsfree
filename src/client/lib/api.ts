/**
 * The data API the stores and components use: the same function names the old HTTP client
 * had, now a facade over IndexedDB, the job engine and OpenRouter. Every function throws
 * `ApiClientError` (status 0 = OpenRouter or local storage unreachable).
 */
import type {
  CreditsResponse,
  GenerateResponse,
  Generation,
  ImageGenerateRequest,
  ListGenerationsQuery,
  ListGenerationsResponse,
  MediaRef,
  ModelsResponse,
  SettingsResponse,
  StorageStats,
  TypeStats,
  UpdateGenerationRequest,
  UpdateSettingsRequest,
  UploadResponse,
  VideoGenerateRequest,
} from "@shared/types";
import { imageCatalog, lookupImageModel, lookupVideoModel, videoCatalog } from "./catalog";
import { cachedCredits, fetchCredits, invalidateCredits } from "./credits";
import { clearLibrary, getAllGenerations, getGeneration as readGeneration, listGenerations as readGenerations, patchGeneration, removeGeneration, toPublic } from "./db/generations";
import { listUploads, putMedia } from "./db/media";
import { cancelJob, retryGeneration as engineRetry, submitImageBatch, submitVideo } from "./engine";
import { ApiClientError, badRequest, isKeyRejected, notFound } from "./errors";
import { detectImage } from "./image-meta";
import { publish } from "./live";
import { MAX_UPLOAD_BYTES, newUploadId } from "./media-ids";
import { revokeAllMediaUrls } from "./media-urls";
import { listLiveModels } from "./openrouter";
import { getStoredKey, requireApiKey, setDefaults, setStoredKey, settingsResponse } from "./settings";
import { isQuotaError, quotaMessage } from "./storage-health";

export { ApiClientError, describeApiError, OFFLINE_MESSAGE, providerMessage } from "./errors";

// ---------- settings, credits, models ----------

export async function getSettings(): Promise<SettingsResponse> {
  return settingsResponse();
}

export async function updateSettings(body: UpdateSettingsRequest): Promise<SettingsResponse> {
  if (body.apiKey !== undefined) {
    setStoredKey(body.apiKey);
    invalidateCredits();
  }
  if (body.defaults) {
    if (body.defaults.imageModel && !(await lookupImageModel(body.defaults.imageModel, getStoredKey()))) {
      throw badRequest(`Unknown image model: ${body.defaults.imageModel}`);
    }
    if (body.defaults.videoModel) {
      const m = await lookupVideoModel(body.defaults.videoModel, getStoredKey());
      if (!m || m.hidden) throw badRequest(`Unknown video model: ${body.defaults.videoModel}`);
    }
    setDefaults(body.defaults);
  }
  return settingsResponse();
}

/** Check a key against OpenRouter (the stored one when none is passed). */
export async function testSettings(apiKey?: string): Promise<CreditsResponse> {
  const key = apiKey?.trim() || getStoredKey();
  if (!key) throw badRequest("No key to test. Paste one, or save one first.");
  try {
    return await fetchCredits(key);
  } catch (err) {
    if (isKeyRejected(err)) throw new ApiClientError(401, "Invalid API key", (err as ApiClientError).provider);
    throw err;
  }
}

export async function getCredits(): Promise<CreditsResponse> {
  return cachedCredits(requireApiKey());
}

/** The catalog the composers offer: OpenRouter's live video and image catalogs merged with the curated entries. */
export async function getModels(): Promise<ModelsResponse> {
  const live = await listLiveModels(getStoredKey());
  const res: ModelsResponse = { image: imageCatalog(), video: videoCatalog().filter((m) => !m.hidden) };
  if (live) res.live = { checkedAt: live.checkedAt, available: live.available };
  return res;
}

// ---------- generations ----------

export async function generateImage(body: ImageGenerateRequest): Promise<GenerateResponse> {
  return { generations: await submitImageBatch(body) };
}

export async function generateVideo(body: VideoGenerateRequest): Promise<GenerateResponse> {
  return { generations: [await submitVideo(body)] };
}

export function listGenerations(query: ListGenerationsQuery = {}): Promise<ListGenerationsResponse> {
  return readGenerations(query);
}

export async function getGeneration(id: string): Promise<Generation> {
  const row = await readGeneration(id);
  if (!row) throw notFound("Generation not found");
  return toPublic(row);
}

/** Client-editable fields only (the heart); status, output and friends belong to the engine. */
export async function updateGeneration(id: string, body: UpdateGenerationRequest): Promise<Generation> {
  if (body.favorite === undefined) throw badRequest("Nothing to update");
  const row = await patchGeneration(id, { favorite: body.favorite });
  if (!row) throw notFound("Generation not found");
  const generation = toPublic(row);
  publish({ type: "generation", generation });
  return generation;
}

/** Remove the record, its file, and inputs nothing else uses; stops the job if this tab drives it. */
export async function deleteGeneration(id: string): Promise<{ ok: true }> {
  cancelJob(id);
  const removed = await removeGeneration(id);
  if (!removed) throw notFound("Generation not found");
  publish({ type: "generation-deleted", id });
  return { ok: true };
}

export async function retryGeneration(id: string): Promise<GenerateResponse> {
  return { generations: await engineRetry(id) };
}

// ---------- uploads ----------

/** Store a reference image in the library (sniffed: the declared type is not trusted). */
export async function upload(file: Blob): Promise<UploadResponse> {
  if (file.size === 0) throw badRequest("Empty file");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiClientError(413, `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = detectImage(bytes);
  if (!meta) throw badRequest("Unsupported file type: only PNG, JPEG and WebP images are accepted");
  const id = newUploadId(meta.ext);
  try {
    await putMedia({ id, kind: "upload", mime: meta.mime, bytes: bytes.byteLength, createdAt: new Date().toISOString(), blob: new Blob([bytes], { type: meta.mime }) });
  } catch (err) {
    if (isQuotaError(err)) throw new ApiClientError(507, quotaMessage());
    throw err;
  }
  const media: MediaRef = { id, mime: meta.mime, bytes: bytes.byteLength };
  if (meta.width && meta.height) {
    media.width = meta.width;
    media.height = meta.height;
  }
  return { media };
}

// ---------- library stats ----------

export async function getStorageStats(): Promise<StorageStats> {
  const [rows, uploads] = await Promise.all([getAllGenerations(), listUploads()]);
  const stats: StorageStats = { image: { count: 0, completed: 0, bytes: 0 }, video: { count: 0, completed: 0, bytes: 0 }, uploads: { count: uploads.length, bytes: 0 } };
  for (const g of rows) {
    const s: TypeStats = stats[g.type];
    s.count++;
    if (g.output) {
      s.completed++;
      s.bytes += g.output.bytes;
    }
  }
  for (const u of uploads) stats.uploads.bytes += u.bytes;
  return stats;
}

// ---------- the whole library ----------

/** "Delete everything": both stores emptied, every tab told to start over. */
export async function deleteLibrary(): Promise<void> {
  await clearLibrary();
  publish({ type: "reset" });
  revokeAllMediaUrls();
}
