/**
 * The data API the stores and components use: the same function names the old HTTP client
 * had, now a facade over IndexedDB, the job engine and OpenRouter. Every function throws
 * `ApiClientError` (status 0 = OpenRouter or local storage unreachable).
 */
import type {
  CreditsResponse,
  Folder,
  FolderRequest,
  FoldersResponse,
  FolderSummary,
  GenerateResponse,
  Generation,
  ImageGenerateRequest,
  ListGenerationsQuery,
  ListGenerationsResponse,
  MediaRef,
  ModelsResponse,
  ProviderId,
  SettingsResponse,
  StorageStats,
  TypeStats,
  UpdateGenerationRequest,
  UpdateSettingsRequest,
  UploadResponse,
  VideoAspectRatio,
  VideoGenerateRequest,
} from "@shared/types";
import { imageCatalog, videoCatalog } from "./catalog";
import { cachedCredits, fetchCredits, invalidateCredits } from "./credits";
import { countInFolder, getFolder as readFolder, listFolders as readFolders, putFolder, removeFolder } from "./db/folders";
import { clearLibrary, getAllGenerations, getGeneration as readGeneration, listGenerations as readGenerations, patchGeneration, removeGeneration, toPublic, type GenerationPatch } from "./db/generations";
import { normalizeNote } from "./notes";
import { listUploads, putMedia } from "./db/media";
import { base64ToBytes, blobToDataUrl, toDataUrl } from "./data-url";
import { cancelJob, retryGeneration as engineRetry, submitImageBatch, submitVideo } from "./engine";
import { inputDataUrl } from "./engine/inputs";
import { ApiClientError, badRequest, isKeyRejected, notFound } from "./errors";
import { compareFolders, FOLDER_COVER_COUNT, folderNameKey, newFolderId, normalizeFolderName } from "./folders";
import { detectImage } from "./image-meta";
import { publish } from "./live";
import * as fal from "./fal";
import { MAX_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES, newUploadId } from "./media-ids";
import { revokeAllMediaUrls } from "./media-urls";
import { chatText, listLiveModels, nativeImage } from "./openrouter";
import { buildPreviewBody, buildRecreateBody, buildRewriteBody, cleanRewrite, DEFAULT_PREVIEW_CONFIG, MAX_RECREATE_VIDEO_BYTES, storyboardLayout, type PreviewConfig, type RewriteContext } from "./prompt-editor";
import * as apimart from "./apimart";
import * as kie from "./kie";
import { isProviderId, PROVIDER_NAME } from "./providers";
import { getProviderKey, getStoredFalKey, getStoredKey, requireApiKey, setPreferredProvider, setProviderKey, setStoredKey, settingsResponse } from "./settings";
import { isQuotaError, quotaMessage } from "./storage-health";
import { detectVideo, OPENROUTER_VIDEO_MIME } from "./video-meta";

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
  for (const [provider, key] of Object.entries(body.keys ?? {})) {
    if (!isProviderId(provider)) throw badRequest(`Unknown provider: ${provider}`);
    if (key === undefined) continue;
    setProviderKey(provider, key);
    if (provider === "openrouter") invalidateCredits();
  }
  if (body.preferredProvider !== undefined) {
    if (!isProviderId(body.preferredProvider)) throw badRequest(`Unknown provider: ${String(body.preferredProvider)}`);
    setPreferredProvider(body.preferredProvider);
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

/**
 * Check a fal, kie.ai or APIMart key (the stored one when none is passed). Resolves when the provider accepts it,
 * with the balance where the provider gives one: kie's in credits, APIMart's in USD (−1: unlimited).
 */
export async function testProviderKey(provider: Exclude<ProviderId, "openrouter">, apiKey?: string): Promise<{ ok: true; credits?: number; balanceUsd?: number }> {
  const name = PROVIDER_NAME[provider];
  const key = apiKey?.trim() || getProviderKey(provider);
  if (!key) throw badRequest(`No ${name} key to test. Paste one, or save one first.`);
  try {
    if (provider === "kie") return { ok: true, credits: (await kie.testKey(key)).credits };
    if (provider === "apimart") return { ok: true, balanceUsd: (await apimart.testKey(key)).balanceUsd };
    await fal.testKey(key);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) throw new ApiClientError(401, `Invalid ${name} key`, err.provider);
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

/**
 * Client-editable fields only (the heart, its folder, a video's note); status, output and friends
 * belong to the engine. Filing in a folder keeps the record; removing the heart takes it out of its
 * folder. An empty note removes it.
 */
export async function updateGeneration(id: string, body: UpdateGenerationRequest): Promise<Generation> {
  if (body.favorite === undefined && body.folder === undefined && body.note === undefined) throw badRequest("Nothing to update");
  const patch: GenerationPatch = {};
  if (body.favorite !== undefined) patch.favorite = body.favorite;
  if (body.folder) {
    if (body.favorite === false) throw badRequest("A record in a folder is a kept one");
    if (!(await readFolder(body.folder))) throw notFound("Folder not found");
    patch.favorite = true;
    patch.folder = body.folder;
  } else if (body.folder === null || body.favorite === false) {
    patch.folder = undefined;
  }
  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") throw badRequest("Note must be text");
    const current = await readGeneration(id);
    if (!current) throw notFound("Generation not found");
    if (current.type !== "video") throw badRequest("Only a video can have a note");
    const note = normalizeNote(body.note ?? "");
    patch.note = note || undefined;
  }
  const row = await patchGeneration(id, patch);
  if (!row) throw notFound("Generation not found");
  const generation = toPublic(row);
  publish({ type: "generation", generation });
  return generation;
}

/** Remove the record, its file, and inputs nothing else uses; stops the job if this tab drives it. */
export async function deleteGeneration(id: string): Promise<{ ok: true }> {
  const row = await readGeneration(id);
  cancelJob(id);
  // fal can cancel a queued job; OpenRouter has no cancel endpoint. Best effort, never blocks the delete.
  const falKey = getStoredFalKey();
  if (row?.provider === "fal" && row.status === "running" && row.pollingUrl && falKey) void fal.cancel(falKey, row.pollingUrl).catch(() => undefined);
  const removed = await removeGeneration(id);
  if (!removed) throw notFound("Generation not found");
  publish({ type: "generation-deleted", id });
  return { ok: true };
}

export async function retryGeneration(id: string): Promise<GenerateResponse> {
  return { generations: await engineRetry(id) };
}

// ---------- favorites folders ----------

/** Every folder, newest first, with what its tile shows (count and the newest records for the cover). */
export async function listFolders(): Promise<FoldersResponse> {
  const folders = (await readFolders()).sort(compareFolders);
  const summaries: Record<string, FolderSummary> = {};
  for (const f of folders) {
    const [count, page] = await Promise.all([countInFolder(f.id), readGenerations({ folder: f.id, limit: FOLDER_COVER_COUNT })]);
    summaries[f.id] = { count, newest: page.items };
  }
  return { folders, summaries };
}

/** The cleaned name, or a 400 / 409 when it is empty or another folder (not `except`) already has it. */
function checkFolderName(name: string, existing: Folder[], except?: string): string {
  const clean = normalizeFolderName(name);
  if (!clean) throw badRequest("Give the folder a name");
  const key = folderNameKey(clean);
  if (existing.some((f) => f.id !== except && folderNameKey(f.name) === key)) throw new ApiClientError(409, `There is already a folder named “${clean}”`);
  return clean;
}

export async function createFolder(body: FolderRequest): Promise<Folder> {
  const name = checkFolderName(body.name, await readFolders());
  const now = new Date().toISOString();
  const folder: Folder = { id: newFolderId(), name, createdAt: now, updatedAt: now };
  await putFolder(folder);
  publish({ type: "folder", folder });
  return folder;
}

export async function renameFolder(id: string, body: FolderRequest): Promise<Folder> {
  const existing = await readFolders();
  const prev = existing.find((f) => f.id === id);
  if (!prev) throw notFound("Folder not found");
  const name = checkFolderName(body.name, existing, id);
  if (name === prev.name) return prev;
  const folder: Folder = { ...prev, name, updatedAt: new Date().toISOString() };
  await putFolder(folder);
  publish({ type: "folder", folder });
  return folder;
}

/** Delete a folder. Its records stay kept, and each one is announced so open views drop the folder tag. */
export async function deleteFolder(id: string): Promise<{ ok: true }> {
  const res = await removeFolder(id);
  if (!res) throw notFound("Folder not found");
  publish({ type: "folder-deleted", id });
  for (const generation of res.cleared) publish({ type: "generation", generation });
  return { ok: true };
}

// ---------- the AI Prompt Editor (video composer) ----------

export interface RewriteRequest {
  prompt: string;
  /** "More cinematic", or empty for a general improvement. */
  instruction: string;
  context?: RewriteContext;
}

/** Rewrite a video prompt with the editor's model (OpenRouter, the user's key); `onText` streams the text so far. */
export async function rewriteVideoPrompt(req: RewriteRequest, opts: { signal?: AbortSignal; onText?: (text: string) => void } = {}): Promise<{ prompt: string; costUsd?: number }> {
  const key = requireApiKey();
  const res = await chatText(key, buildRewriteBody(req.prompt, req.instruction, req.context), {
    signal: opts.signal,
    onText: opts.onText ? (t) => opts.onText?.(cleanRewrite(t)) : undefined,
  });
  invalidateCredits();
  const prompt = cleanRewrite(res.text);
  if (!prompt) throw new ApiClientError(502, "The model returned an empty prompt. Try again.");
  return res.costUsd !== undefined ? { prompt, costUsd: res.costUsd } : { prompt };
}

export interface RecreateRequest {
  /** The video to recreate (MP4, MOV or WebM, up to `MAX_RECREATE_VIDEO_BYTES`). */
  file: Blob;
  /** "Same shot with a cat", or empty for the closest recreation. */
  instruction: string;
  context?: RewriteContext;
}

/**
 * Watch a video and write the prompt that recreates it, with the editor's video model (OpenRouter, the user's
 * key); `onText` streams the text so far. The file is sniffed and sent inline as a data URL, so the clip has to
 * be short. Nothing is stored.
 */
export async function recreateVideoPrompt(req: RecreateRequest, opts: { signal?: AbortSignal; onText?: (text: string) => void } = {}): Promise<{ prompt: string; costUsd?: number }> {
  const key = requireApiKey();
  if (req.file.size === 0) throw badRequest("Empty file");
  if (req.file.size > MAX_RECREATE_VIDEO_BYTES) throw new ApiClientError(413, `Video is over ${Math.round(MAX_RECREATE_VIDEO_BYTES / 1024 / 1024)} MB. Trim or compress it first.`);
  const head = new Uint8Array(await req.file.slice(0, 64).arrayBuffer());
  const format = detectVideo(head);
  if (!format) throw badRequest("Unsupported video type: only MP4, MOV and WebM are accepted");
  const mime = OPENROUTER_VIDEO_MIME[format.ext];
  const dataUrl = await blobToDataUrl(new Blob([req.file], { type: mime }));
  const res = await chatText(key, buildRecreateBody(dataUrl, req.instruction, req.context), {
    signal: opts.signal,
    onText: opts.onText ? (t) => opts.onText?.(cleanRewrite(t)) : undefined,
    // The upload and the watching take a while; the stream itself keeps the request alive.
    timeoutMs: 4 * 60_000,
  });
  invalidateCredits();
  const prompt = cleanRewrite(res.text);
  if (!prompt) throw new ApiClientError(502, "The model returned an empty prompt. Try again.");
  return res.costUsd !== undefined ? { prompt, costUsd: res.costUsd } : { prompt };
}

export interface PreviewRequest {
  prompt: string;
  aspectRatio?: VideoAspectRatio;
  /** Media id of the attached first frame (or character image), sent as a reference when the config uses it. */
  firstFrame?: string;
  /** Model, quality or resolution, reference, instructions (the dialog's "Edit configuration"). */
  config?: PreviewConfig;
}

/** One picture with six frames of the shot, start to end (low quality, not saved to the library), as a data URL. */
export async function previewVideoFrames(req: PreviewRequest, opts: { signal?: AbortSignal } = {}): Promise<{ dataUrl: string; costUsd?: number }> {
  const key = requireApiKey();
  if (!req.prompt.trim()) throw badRequest("Write a prompt first");
  const config = req.config ?? DEFAULT_PREVIEW_CONFIG;
  const ref = req.firstFrame && config.useReference ? await inputDataUrl(req.firstFrame) : undefined;
  const res = await nativeImage(key, buildPreviewBody(req.prompt, storyboardLayout(req.aspectRatio), config, ref), opts);
  invalidateCredits();
  const bytes = base64ToBytes(res.b64);
  const meta = detectImage(bytes);
  if (!meta) throw new ApiClientError(502, "Provider returned data that is not a PNG, JPEG or WebP image");
  const dataUrl = toDataUrl(meta.mime, bytes);
  return res.costUsd !== undefined ? { dataUrl, costUsd: res.costUsd } : { dataUrl };
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

/** Store a reference video (motion control) in the library: MP4, MOV or WebM, up to 90 MB. */
export async function uploadVideo(file: Blob): Promise<UploadResponse> {
  if (file.size === 0) throw badRequest("Empty file");
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) throw new ApiClientError(413, `Video exceeds the ${Math.round(MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024)} MB limit`);
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const format = detectVideo(head);
  if (!format) throw badRequest("Unsupported video type: only MP4, MOV and WebM are accepted");
  const id = newUploadId(format.ext);
  const blob = file.type === format.mime ? file : new Blob([file], { type: format.mime });
  try {
    await putMedia({ id, kind: "upload", mime: format.mime, bytes: file.size, createdAt: new Date().toISOString(), blob });
  } catch (err) {
    if (isQuotaError(err)) throw new ApiClientError(507, quotaMessage());
    throw err;
  }
  return { media: { id, mime: format.mime, bytes: file.size } };
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

/** "Delete everything": every store emptied (records, files, folders), every tab told to start over. */
export async function deleteLibrary(): Promise<void> {
  await clearLibrary();
  publish({ type: "reset" });
  revokeAllMediaUrls();
}
