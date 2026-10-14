/**
 * Library export / import as a zip: `manifest.json`, `generations.json`, `folders.json` (the
 * Favorites folders) and one `media/<id>` entry per file, stored uncompressed (media are already
 * compressed). zip.js is loaded on first use; exports stream straight to disk where the File
 * System Access API exists.
 */
import type { Folder, Generation, GenerationType } from "@shared/types";
import { listFolders } from "../db/folders";
import { getAllGenerations, isActive, toPublic, toStored } from "../db/generations";
import { getDb } from "../db/index";
import { getMediaRow } from "../db/media";
import type { MediaRow } from "../db/schema";
import { ApiClientError, badRequest } from "../errors";
import { compareFolders, folderNameKey } from "../folders";
import { detectImage } from "../image-meta";
import { publish } from "../live";
import { errorMessage, log } from "../log";
import { inputMediaIds, mediaKind, mimeForId } from "../media-ids";
import { revokeAllMediaUrls } from "../media-urls";
import { isQuotaError, quotaMessage } from "../storage-health";
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, isArchiveManifest, sanitizeFolder, sanitizeRecord, type ArchiveManifest, type ArchiveProgress } from "./manifest";

export type { ArchiveManifest, ArchiveProgress } from "./manifest";

const APP_VERSION = (process.env.NEXT_PUBLIC_APP_VERSION ?? "").trim() || "dev";

type ZipModule = typeof import("@zip.js/zip.js");
let zipModule: Promise<ZipModule> | undefined;

/** zip.js, loaded once on first use and told to stay on the main thread (no worker scripts to bundle). */
function zipjs(): Promise<ZipModule> {
  if (!zipModule) {
    zipModule = import("@zip.js/zip.js").then((zip) => {
      zip.configure({ useWebWorkers: false });
      return zip;
    });
  }
  return zipModule;
}

function throwIfAborted(signal: AbortSignal | undefined, what: string): void {
  if (signal?.aborted) throw new ApiClientError(499, `${what} cancelled`);
}

// ---------- export ----------

export type ExportScope = "all" | "favorites" | GenerationType;

export interface ExportOptions {
  scope?: ExportScope;
  /** Include uploaded reference images (needed for Reuse and the lightbox thumbnails). Default true. */
  includeUploads?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: ArchiveProgress) => void;
}

export interface ExportResult {
  filename: string;
  manifest: ArchiveManifest;
}

interface ExportPlan {
  records: Generation[];
  mediaIds: string[];
  bytes: number;
  /** Every folder, whatever the scope: they are small, and a record's folder must be there when it comes back. */
  folders: Folder[];
  manifest: ArchiveManifest;
}

function newestFirst(a: Generation, b: Generation): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return (a.batchIndex ?? 0) - (b.batchIndex ?? 0) || (a.id < b.id ? -1 : 1);
}

/** What goes in: finished records in scope, their outputs, (optionally) the uploads they reference, and the folders. */
async function planExport(opts: ExportOptions): Promise<ExportPlan> {
  const scope = opts.scope ?? "all";
  const includeUploads = opts.includeUploads ?? true;
  const records = (await getAllGenerations())
    .filter((r) => !isActive(r))
    .filter((r) => scope === "all" || (scope === "favorites" ? r.favorite === true : r.type === scope))
    .map(toPublic)
    .sort(newestFirst);
  const ids = new Set<string>();
  for (const r of records) {
    if (r.output) ids.add(r.output.id);
    if (includeUploads) for (const id of inputMediaIds(r.inputs)) ids.add(id);
  }
  let bytes = 0;
  const mediaIds: string[] = [];
  for (const id of ids) {
    const row = await getMediaRow(id);
    if (!row) continue;
    mediaIds.push(id);
    bytes += row.bytes;
  }
  const folders = (await listFolders()).sort(compareFolders);
  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    app: { version: APP_VERSION },
    counts: { generations: records.length, media: mediaIds.length, folders: folders.length },
    bytes,
  };
  return { records, mediaIds, bytes, folders, manifest };
}

async function writeArchive(zip: ZipModule, writer: InstanceType<ZipModule["ZipWriter"]>, plan: ExportPlan, opts: ExportOptions): Promise<void> {
  opts.onProgress?.({ phase: "listing", done: 0, total: plan.mediaIds.length, bytes: 0 });
  await writer.add("manifest.json", new zip.TextReader(JSON.stringify(plan.manifest, null, 2)));
  await writer.add("generations.json", new zip.TextReader(JSON.stringify(plan.records)));
  await writer.add("folders.json", new zip.TextReader(JSON.stringify(plan.folders)));
  let done = 0;
  let bytes = 0;
  for (const id of plan.mediaIds) {
    throwIfAborted(opts.signal, "Export");
    const row = await getMediaRow(id);
    if (!row) continue; // deleted since the plan was made
    await writer.add(`media/${id}`, new zip.BlobReader(row.blob), { level: 0 });
    done++;
    bytes += row.bytes;
    opts.onProgress?.({ phase: "media", done, total: plan.mediaIds.length, bytes });
  }
  opts.onProgress?.({ phase: "done", done, total: plan.mediaIds.length, bytes });
}

const archiveFilename = (): string => `higgsfree-library-${new Date().toISOString().slice(0, 10)}.zip`;

/** The archive as a Blob (tests, and browsers without the File System Access API). */
export async function buildArchive(opts: ExportOptions = {}): Promise<{ blob: Blob; manifest: ArchiveManifest }> {
  const zip = await zipjs();
  const plan = await planExport(opts);
  const writer = new zip.ZipWriter<Blob>(new zip.BlobWriter("application/zip"), { level: 0 });
  await writeArchive(zip, writer, plan, opts);
  return { blob: await writer.close(), manifest: plan.manifest };
}

interface SaveFilePicker {
  (options: { suggestedName?: string; types?: { description?: string; accept: Record<string, string[]> }[] }): Promise<{
    createWritable(): Promise<WritableStream & { abort(reason?: unknown): Promise<void> }>;
  }>;
}

function saveFilePicker(): SaveFilePicker | undefined {
  if (typeof window === "undefined") return undefined;
  const fn = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  return typeof fn === "function" ? fn.bind(window) : undefined;
}

/**
 * Export the library to a zip on the user's disk: streamed through a save dialog where the
 * browser has one (Chromium), else built in memory and handed to a download link.
 */
export async function exportLibrary(opts: ExportOptions = {}): Promise<ExportResult> {
  const filename = archiveFilename();
  const picker = saveFilePicker();
  if (!picker) {
    const { blob, manifest } = await buildArchive(opts);
    throwIfAborted(opts.signal, "Export");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { filename, manifest };
  }
  let handle: Awaited<ReturnType<SaveFilePicker>>;
  try {
    handle = await picker({ suggestedName: filename, types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }] });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new ApiClientError(499, "Export cancelled");
    throw err;
  }
  const zip = await zipjs();
  const plan = await planExport(opts);
  const writable = await handle.createWritable();
  const writer = new zip.ZipWriter(writable, { level: 0 });
  try {
    await writeArchive(zip, writer, plan, opts);
    await writer.close();
  } catch (err) {
    await writable.abort(err).catch(() => undefined);
    throw err;
  }
  return { filename, manifest: plan.manifest };
}

// ---------- import ----------

export interface ImportOptions {
  /** What to do with a record that is already in the library (same id = same record). Default `skip`. */
  mode?: "skip" | "replace";
  signal?: AbortSignal;
  onProgress?: (p: ArchiveProgress) => void;
}

export interface ImportResult {
  imported: number;
  replaced: number;
  skipped: number;
  /** Completed records whose file was not in the archive (not imported). */
  missingMedia: number;
  /** Entries of `generations.json` (or `folders.json`) that were not records (or folders). */
  invalid: number;
  /** Folders created (one with the same name here takes the archive's records instead). */
  folders: number;
  mediaWritten: number;
  bytes: number;
}

type FileEntry = import("@zip.js/zip.js").FileEntry;

async function readEntryBlob(zip: ZipModule, entry: FileEntry, id: string): Promise<Blob | undefined> {
  const mime = mimeForId(id);
  const blob = await entry.getData(new zip.BlobWriter(mime));
  if (mime.startsWith("image/")) {
    const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
    const meta = detectImage(head);
    if (!meta) return undefined;
    if (meta.mime !== mime) return new Blob([blob], { type: meta.mime });
  }
  return blob;
}

export async function importLibrary(file: Blob, opts: ImportOptions = {}): Promise<ImportResult> {
  const zip = await zipjs();
  const mode = opts.mode ?? "skip";
  const result: ImportResult = { imported: 0, replaced: 0, skipped: 0, missingMedia: 0, invalid: 0, folders: 0, mediaWritten: 0, bytes: 0 };
  const reader = new zip.ZipReader(new zip.BlobReader(file));
  try {
    const entries = new Map<string, FileEntry>();
    for (const e of await reader.getEntries()) if (!e.directory) entries.set(e.filename, e);
    const manifestEntry = entries.get("manifest.json");
    if (!manifestEntry) throw badRequest("Not a higgsfree library archive (no manifest.json)");
    const manifest: unknown = JSON.parse(await manifestEntry.getData(new zip.TextWriter()));
    if (!isArchiveManifest(manifest) || manifest.format !== ARCHIVE_FORMAT) throw badRequest("Not a higgsfree library archive");
    if (manifest.version > ARCHIVE_VERSION) throw badRequest(`This archive (version ${manifest.version}) was made by a newer app. Update, then import again.`);
    const recordsEntry = entries.get("generations.json");
    if (!recordsEntry) throw badRequest("Archive has no generations.json");
    const raw: unknown = JSON.parse(await recordsEntry.getData(new zip.TextWriter()));
    if (!Array.isArray(raw)) throw badRequest("Archive has an unreadable generations.json");

    const db = await getDb();

    // Folders first, so the records' folder ids can be checked. An archive folder lands under its own id,
    // joins the folder here with the same name, or is already here; `folderMap` says which id to file under.
    const folderMap = new Map<string, string>();
    const foldersEntry = entries.get("folders.json");
    if (foldersEntry) {
      const rawFolders: unknown = JSON.parse(await foldersEntry.getData(new zip.TextWriter()));
      if (!Array.isArray(rawFolders)) throw badRequest("Archive has an unreadable folders.json");
      const local = await listFolders();
      const byName = new Map(local.map((f) => [folderNameKey(f.name), f.id] as const));
      const localIds = new Set(local.map((f) => f.id));
      for (const item of rawFolders) {
        throwIfAborted(opts.signal, "Import");
        const f = sanitizeFolder(item);
        if (!f) {
          result.invalid++;
          continue;
        }
        if (localIds.has(f.id)) {
          folderMap.set(f.id, f.id);
          continue;
        }
        const sameName = byName.get(folderNameKey(f.name));
        if (sameName !== undefined) {
          folderMap.set(f.id, sameName);
          continue;
        }
        await db.put("folders", f);
        localIds.add(f.id);
        byName.set(folderNameKey(f.name), f.id);
        folderMap.set(f.id, f.id);
        result.folders++;
      }
    }

    const total = raw.length;
    let done = 0;
    /** Media written by this import, so a file referenced twice is read once. */
    const written = new Set<string>();
    const progress = (): void => opts.onProgress?.({ phase: "records", done, total, bytes: result.bytes });

    for (const item of raw) {
      throwIfAborted(opts.signal, "Import");
      done++;
      const record = sanitizeRecord(item);
      if (!record) {
        result.invalid++;
        progress();
        continue;
      }
      const exists = (await db.getKey("generations", record.id)) !== undefined;
      if (exists && mode === "skip") {
        result.skipped++;
        progress();
        continue;
      }

      const rows: MediaRow[] = [];
      /** True when the media is (or will be) in the library: in the archive, written already, or there before. */
      const resolve = async (id: string): Promise<boolean> => {
        if (written.has(id)) return true;
        const entry = entries.get(`media/${id}`);
        const present = (await db.getKey("media", id)) !== undefined;
        if (!entry) return present;
        if (present && mode === "skip") return true;
        const blob = await readEntryBlob(zip, entry, id);
        if (!blob) return present;
        rows.push({ id, kind: mediaKind(id) ?? "upload", mime: blob.type, bytes: blob.size, createdAt: record.createdAt, blob });
        return true;
      };

      if (record.folder) {
        const mapped = folderMap.get(record.folder) ?? ((await db.getKey("folders", record.folder)) !== undefined ? record.folder : undefined);
        if (mapped) record.folder = mapped;
        else delete record.folder; // the folder never made it here: the record stays kept, in All
      }

      if (record.output && !(await resolve(record.output.id))) {
        if (record.status === "completed") {
          result.missingMedia++;
          progress();
          continue; // a completed card without its file is worse than no card
        }
        delete record.output;
      }
      if (record.inputs) {
        const keep = async (id: string | undefined): Promise<string | undefined> => (id && (await resolve(id)) ? id : undefined);
        const refs: string[] = [];
        for (const id of record.inputs.referenceImages ?? []) {
          const kept = await keep(id);
          if (kept) refs.push(kept);
        }
        const inputs: Generation["inputs"] = {};
        if (refs.length > 0) inputs.referenceImages = refs;
        const first = await keep(record.inputs.firstFrame);
        if (first) inputs.firstFrame = first;
        const last = await keep(record.inputs.lastFrame);
        if (last) inputs.lastFrame = last;
        const motion = await keep(record.inputs.motionVideo);
        if (motion) inputs.motionVideo = motion;
        if (Object.keys(inputs).length > 0) record.inputs = inputs;
        else delete record.inputs;
      }

      try {
        const tx = db.transaction(["generations", "media"], "readwrite");
        const media = tx.objectStore("media");
        for (const row of rows) {
          await media.put(row);
          written.add(row.id);
          result.mediaWritten++;
          result.bytes += row.bytes;
        }
        await tx.objectStore("generations").put(toStored(record));
        await tx.done;
      } catch (err) {
        if (isQuotaError(err)) throw new ApiClientError(507, `${quotaMessage()} (${result.imported + result.replaced} of ${total} imported before it filled up.)`);
        throw err;
      }
      if (exists) result.replaced++;
      else result.imported++;
      progress();
    }
    opts.onProgress?.({ phase: "done", done, total, bytes: result.bytes });
  } catch (err) {
    if (!(err instanceof ApiClientError)) {
      log.warn(`import failed: ${errorMessage(err)}`);
      throw badRequest(`Couldn't read the archive: ${errorMessage(err)}`);
    }
    throw err;
  } finally {
    await reader.close().catch(() => undefined);
    if (result.imported + result.replaced + result.mediaWritten + result.folders > 0) {
      publish({ type: "reset" });
      revokeAllMediaUrls();
    }
  }
  return result;
}
