/**
 * kie.ai, APIMart, Revana and Replicate run every image and video as a task, ByteDance its videos: inputs uploaded
 * first (they take inputs by url; ByteDance and Replicate take images inline instead), a submit that returns a task id,
 * a task url polled until the result urls are there, a download without the key. This is the one shape the engine
 * drives them through.
 */
import type { ImageModel, VideoModel, VideoParams } from "@shared/types";
import * as apimart from "./apimart";
import { buildApimartImagePayload, buildApimartVideoPayload } from "./apimart-payloads";
import * as bytedance from "./bytedance";
import { buildBytedanceVideoPayload } from "./bytedance-payloads";
import { badRequest } from "./errors";
import * as kie from "./kie";
import * as replicate from "./replicate";
import { buildReplicateImagePayload, buildReplicateVideoPayload } from "./replicate-payloads";
import * as revana from "./revana";
import { buildRevanaImagePayload, buildRevanaVideoPayload } from "./revana-payloads";
import { buildKieImagePayload, buildKieVideoPayload, type KieImageParams, type KieVideoMedia, type KieVideoParams } from "./kie-payloads";

export type TaskProviderId = "kie" | "apimart" | "revana" | "bytedance" | "replicate";

/** A task's state, the same for both: `pending` keeps polling (`raw` is the provider's word for it). */
export interface TaskStatus {
  state: "pending" | "done" | "failed";
  raw: string;
  urls: string[];
  costUsd?: number;
  error?: string;
}

/** A submit-ready request: built once with placeholder urls to check it, again with the uploaded ones to send it. */
export interface TaskRequest {
  /** What the record stores (videos). */
  params?: VideoParams;
  /** One line for the console. */
  summary: string;
  submit: (key: string, signal?: AbortSignal) => Promise<string>;
}

export interface TaskProvider {
  name: string;
  /** An image input as the provider takes it: uploaded, then its url (ByteDance and Replicate: the data URL itself). */
  uploadImage(key: string, dataUrl: string, signal?: AbortSignal): Promise<string>;
  /** Undefined when the provider has no upload for videos (APIMart). */
  uploadVideo?: (key: string, blob: Blob, fileName: string, signal?: AbortSignal) => Promise<string>;
  video(model: VideoModel, req: KieVideoParams, media: KieVideoMedia): TaskRequest;
  image(model: ImageModel, req: KieImageParams, referenceUrls: string[]): TaskRequest;
  taskUrl(id: string): string;
  status(key: string, url: string, signal?: AbortSignal): Promise<TaskStatus>;
  /** `key`: for a provider whose result links need it (Revana's `/content`). */
  download(url: string, signal?: AbortSignal, key?: string): Promise<Blob>;
  /**
   * An error that ends the job at once rather than being retried: a url off the provider's own hosts, or a finished
   * file on a host it is not fetched from (ByteDance, Replicate).
   */
  endsJob(err: unknown): boolean;
}

const KIE_PENDING = new Set(["waiting", "queuing", "generating"]);
const APIMART_PENDING = new Set(["pending", "submitted", "processing", "in_progress", "queued", "running"]);
const REVANA_PENDING = new Set(["queued", "running"]);
const BYTEDANCE_PENDING = new Set(["queued", "running"]);
const BYTEDANCE_FAILED = new Set(["failed", "expired", "cancelled"]);
const REPLICATE_PENDING = new Set(["starting", "processing"]);
const REPLICATE_FAILED = new Set(["failed", "canceled", "aborted"]);

export const TASK_PROVIDERS: Record<TaskProviderId, TaskProvider> = {
  kie: {
    name: "kie.ai",
    uploadImage: kie.uploadDataUrl,
    uploadVideo: kie.uploadFile,
    video(model, req, media) {
      const p = buildKieVideoPayload(model, req, media);
      return {
        params: p.params,
        summary: `model=${p.model} duration=${p.params.duration}s res=${p.params.resolution ?? "-"} ar=${p.params.aspectRatio ?? "-"} audio=${p.params.audio ?? "-"}`,
        submit: (key, signal) => kie.createTask(key, p.model, p.input, signal),
      };
    },
    image(model, req, refs) {
      const p = buildKieImagePayload(model, req, refs);
      return { summary: `model=${p.model}`, submit: (key, signal) => kie.createTask(key, p.model, p.input, signal) };
    },
    taskUrl: kie.taskUrl,
    async status(key, url, signal) {
      const t = await kie.task(key, url, signal);
      const state = t.state === "success" ? "done" : t.state === "fail" ? "failed" : "pending";
      const out: TaskStatus = { state, raw: t.state, urls: t.urls };
      if (t.costUsd !== undefined) out.costUsd = t.costUsd;
      if (t.error) out.error = t.error;
      if (state === "pending" && !KIE_PENDING.has(t.state)) out.raw = `unknown:${t.state}`;
      return out;
    },
    download: (url, signal) => kie.download(url, signal),
    endsJob: (err) => err instanceof kie.KieOriginError,
  },
  apimart: {
    name: "APIMart",
    uploadImage: apimart.uploadImage,
    video(model, req, media) {
      if (media.sourceVideo) throw badRequest(`${model.name} on APIMart cannot take a video`);
      const p = buildApimartVideoPayload(model, req, media);
      return {
        params: p.params,
        summary: `model=${String(p.body.model)} duration=${p.params.duration}s res=${p.params.resolution ?? "-"} ar=${p.params.aspectRatio ?? "-"} audio=${p.params.audio ?? "-"}`,
        submit: (key, signal) => apimart.submit(key, p.kind, p.body, signal),
      };
    },
    image(model, req, refs) {
      const p = buildApimartImagePayload(model, req, refs);
      return { summary: `model=${String(p.body.model)}`, submit: (key, signal) => apimart.submit(key, p.kind, p.body, signal) };
    },
    taskUrl: apimart.taskUrl,
    async status(key, url, signal) {
      const t = await apimart.task(key, url, signal);
      const state = t.status === "completed" ? "done" : t.status === "failed" || t.status === "cancelled" ? "failed" : "pending";
      const out: TaskStatus = { state, raw: t.status, urls: t.urls };
      if (t.costUsd !== undefined) out.costUsd = t.costUsd;
      if (t.error) out.error = t.error;
      if (state === "pending" && !APIMART_PENDING.has(t.status)) out.raw = `unknown:${t.status}`;
      return out;
    },
    download: (url, signal) => apimart.download(url, signal),
    endsJob: (err) => err instanceof apimart.ApimartOriginError,
  },
  revana: {
    name: "Revana",
    uploadImage: revana.uploadImage,
    uploadVideo: revana.upload,
    video(model, req, media) {
      const p = buildRevanaVideoPayload(model, req, media);
      return {
        params: p.params,
        summary: `model=${p.model} duration=${p.params.duration}s res=${p.params.resolution ?? "-"} ar=${p.params.aspectRatio ?? "-"} audio=${p.params.audio ?? "-"}`,
        submit: (key, signal) => revana.submit(key, p.model, p.input, signal),
      };
    },
    image(model, req, refs) {
      const p = buildRevanaImagePayload(model, req, refs);
      return { summary: `model=${p.model}`, submit: (key, signal) => revana.submit(key, p.model, p.input, signal) };
    },
    taskUrl: revana.taskUrl,
    async status(key, url, signal) {
      const g = await revana.generation(key, url, signal);
      const state = g.status === "succeeded" ? "done" : g.status === "failed" ? "failed" : "pending";
      const out: TaskStatus = { state, raw: g.status, urls: g.urls };
      if (g.costUsd !== undefined) out.costUsd = g.costUsd;
      if (g.error) out.error = g.error;
      if (state === "pending" && !REVANA_PENDING.has(g.status)) out.raw = `unknown:${g.status}`;
      return out;
    },
    download: (url, signal, key) => revana.download(url, signal, key),
    endsJob: (err) => err instanceof revana.RevanaOriginError,
  },
  bytedance: {
    name: "ByteDance",
    uploadImage: async (_key, dataUrl) => bytedance.inlineImage(dataUrl),
    video(model, req, media) {
      const p = buildBytedanceVideoPayload(model, req, media);
      return {
        params: p.params,
        summary: `model=${p.model} duration=${p.params.duration}s res=${p.params.resolution ?? "-"} ar=${p.params.aspectRatio ?? "-"} audio=${p.params.audio ?? "-"}`,
        submit: (key, signal) => bytedance.submitVideo(key, p.body, signal),
      };
    },
    image(model) {
      throw badRequest(`${model.name} is not available on ByteDance`);
    },
    taskUrl: bytedance.taskUrl,
    async status(key, url, signal) {
      const t = await bytedance.task(key, url, signal);
      const state = t.status === "succeeded" ? "done" : BYTEDANCE_FAILED.has(t.status) ? "failed" : "pending";
      const out: TaskStatus = { state, raw: t.status, urls: t.urls };
      if (t.costUsd !== undefined) out.costUsd = t.costUsd;
      if (t.error) out.error = t.error;
      if (state === "pending" && !BYTEDANCE_PENDING.has(t.status)) out.raw = `unknown:${t.status}`;
      return out;
    },
    download: (url, signal) => bytedance.download(url, signal),
    endsJob: (err) => err instanceof bytedance.BytedanceOriginError || err instanceof bytedance.BytedanceDownloadBlockedError,
  },
  replicate: {
    name: "Replicate",
    uploadImage: async (_key, dataUrl) => replicate.inlineImage(dataUrl),
    video(model, req, media) {
      const p = buildReplicateVideoPayload(model, req, media);
      return {
        params: p.params,
        summary: `model=${p.model} duration=${p.params.duration}s res=${p.params.resolution ?? "-"} ar=${p.params.aspectRatio ?? "-"} audio=${p.params.audio ?? "-"}`,
        submit: (key, signal) => replicate.submit(key, p.model, p.input, signal),
      };
    },
    image(model, req, refs) {
      const p = buildReplicateImagePayload(model, req, refs);
      return { summary: `model=${p.model}`, submit: (key, signal) => replicate.submit(key, p.model, p.input, signal) };
    },
    taskUrl: replicate.taskUrl,
    async status(key, url, signal) {
      const t = await replicate.prediction(key, url, signal);
      const state = t.status === "succeeded" ? "done" : REPLICATE_FAILED.has(t.status) ? "failed" : "pending";
      const out: TaskStatus = { state, raw: t.status, urls: t.urls };
      if (t.error) out.error = t.error;
      if (state === "pending" && !REPLICATE_PENDING.has(t.status)) out.raw = `unknown:${t.status}`;
      return out;
    },
    download: (url, signal) => replicate.download(url, signal),
    endsJob: (err) => err instanceof replicate.ReplicateOriginError || err instanceof replicate.ReplicateDownloadBlockedError,
  },
};

export function isTaskProvider(provider: string): provider is TaskProviderId {
  return provider === "kie" || provider === "apimart" || provider === "revana" || provider === "bytedance" || provider === "replicate";
}
