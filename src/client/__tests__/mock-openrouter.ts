/**
 * A stand-in for OpenRouter behind `fetch`: every endpoint the app uses, with the fixtures
 * (a 2×2 PNG, a tiny MP4 with a moov box) the engine tests assert on. Mirrors the mock
 * server the old integration test ran.
 */
import { vi } from "vitest";
import { bytesToBase64 } from "@/lib/data-url";
// OpenRouter's public catalogs as they were on 14 Oct 2026 (descriptions trimmed).
import IMAGES_MODELS from "./fixtures/images-models.json";
import VIDEOS_MODELS from "./fixtures/videos-models.json";

/** A video model OpenRouter lists that the curated catalog does not, to exercise discovery. */
export const DISCOVERED_VIDEO = {
  id: "acme/motion-1",
  name: "Acme: Motion 1",
  description: "A test model",
  created: 1800000000,
  supported_resolutions: ["480p", "1080p", "8K"],
  supported_aspect_ratios: ["16:9", "9:16", "5:4"],
  supported_durations: [4, 8],
  supported_frame_images: ["first_frame"],
  generate_audio: true,
  pricing_skus: { duration_seconds_480p: "0.05", duration_seconds_1080p: "0.2" },
  allowed_passthrough_parameters: [],
};

const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const str = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const box = (type: string, ...payload: number[][]): number[] => {
  const body = payload.flat();
  return [...u32(8 + body.length), ...str(type), ...body];
};
const zeros = (n: number): number[] => new Array<number>(n).fill(0);

export const PNG_2X2 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), ...str("IHDR"), ...u32(2), ...u32(2), 8, 6, 0, 0, 0, ...u32(0),
]);
export const PNG_BASE64 = bytesToBase64(PNG_2X2);
export const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
export const MP4 = Uint8Array.from([
  ...box("ftyp", str("isom"), u32(0)),
  ...box(
    "moov",
    box("mvhd", [0, 0, 0, 0], u32(0), u32(0), u32(1000), u32(5000), u32(0x10000), [1, 0], zeros(10), zeros(36), zeros(24), u32(2)),
    box("trak", box("tkhd", [0, 0, 0, 3], u32(0), u32(0), u32(1), u32(0), u32(0), zeros(8), zeros(8), zeros(36), u32(720 << 16), u32(1280 << 16))),
  ),
  ...box("mdat", zeros(64)),
]);

export interface Seen {
  method: string;
  url: string;
  /** Host, so fal and OpenRouter calls with the same path can be told apart. */
  host: string;
  auth?: string;
  body?: Record<string, unknown>;
  /** A multipart body's text fields, and its file field's name and size. */
  form?: Record<string, string>;
}

export interface MockOpenRouter {
  seen: Seen[];
  state: {
    pollCount: number;
    unknownPolls: number;
    catalogDown: boolean;
    falPolls: number;
    uploads: number;
    kieTasks: Record<string, { model: string; polls: number }>;
    kieUploads: number;
    apimartTasks: Record<string, { kind: string; polls: number }>;
    apimartUploads: number;
    revanaGenerations: Record<string, { polls: number; image: boolean }>;
    revanaUploads: number;
  };
  /** Calls to fal hosts (API, uploads, CDN), by path. */
  fal(path: string): Seen[];
  /** Calls to kie.ai hosts (API, uploads, CDN), by path. */
  kie(path: string): Seen[];
  /** Calls to APIMart hosts (API, file host), by path. */
  apimart(path: string): Seen[];
  /** Calls to Revana hosts (API, file storage), by path. */
  revana(path: string): Seen[];
  calls(url: string): Seen[];
  last(url: string): Seen | undefined;
}

const json = (status: number, payload: unknown): Response => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

/** Replace `fetch` for the current test (undone by `vi.unstubAllGlobals()` in the setup's afterEach). */
export function installMockOpenRouter(): MockOpenRouter {
  const seen: Seen[] = [];
  const state: MockOpenRouter["state"] = { pollCount: 0, unknownPolls: 0, catalogDown: false, falPolls: 0, uploads: 0, kieTasks: {}, kieUploads: 0, apimartTasks: {}, apimartUploads: 0, revanaGenerations: {}, revanaUploads: 0 };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw init.signal.reason;
    const u = new URL(input instanceof Request ? input.url : String(input));
    const url = u.pathname + u.search;
    const headers = new Headers(init?.headers);
    const raw = typeof init?.body === "string" ? init.body : undefined;
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    const entry: Seen = { method: init?.method ?? "GET", url, host: u.hostname };
    const auth = headers.get("authorization");
    if (auth) entry.auth = auth;
    if (body) entry.body = body;
    if (init?.body instanceof FormData) {
      entry.form = {};
      for (const [k, v] of init.body.entries()) entry.form[k] = typeof v === "string" ? v : `${v.name} (${v.size} bytes)`;
    }
    seen.push(entry);
    if (KIE_HOSTS.includes(u.hostname)) return kieRoute(u, entry, state);
    if (APIMART_HOSTS.includes(u.hostname)) return apimartRoute(u, entry, state);
    if (REVANA_HOSTS.includes(u.hostname)) return revanaRoute(u, entry, state);
    if (u.hostname !== "openrouter.ai") return falRoute(u, entry, state);
    // The two catalogs are public: no key needed.
    if (url === "/api/v1/videos/models" || url === "/api/v1/images/models") {
      if (state.catalogDown) return json(503, { error: { message: "catalog unavailable" } });
      if (url === "/api/v1/images/models") return json(200, IMAGES_MODELS);
      return json(200, { data: [...VIDEOS_MODELS.data, DISCOVERED_VIDEO] });
    }
    if (auth !== "Bearer test-key") return json(401, { error: { message: "User not found.", code: 401 } });
    if (url === "/api/v1/credits") return json(200, { data: { total_credits: 10, total_usage: 2.5 } });
    if (url === "/api/v1/key") return json(200, { data: { label: "test key", limit: null, usage: 2.5, is_free_tier: false } });
    if (url === "/api/v1/chat/completions") {
      if (JSON.stringify(body?.messages).includes("REFUSE")) return json(200, { choices: [{ message: { content: "I cannot draw that." } }] });
      return json(200, { choices: [{ message: { images: [{ image_url: { url: PNG_DATA_URL } }] } }], usage: { cost: 0.134 } });
    }
    if (url === "/api/v1/images/generations") return json(200, { data: [{ b64_json: PNG_BASE64 }] });
    if (url === "/api/v1/images") return json(200, { created: 1, data: [{ b64_json: PNG_BASE64, media_type: "image/png" }], usage: { cost: 0.039 } });
    if (url === "/api/v1/videos") {
      if (String(body?.resolution) === "4K") {
        return json(400, { error: { message: "Resolution 4K is not supported for this model. Supported resolutions: 480p, 720p", code: 400 } });
      }
      const prompt = String(body?.prompt ?? "");
      if (prompt.includes("POLL_UNKNOWN")) return json(202, { id: "vid_unknown", polling_url: "/api/v1/videos/vid_unknown", status: "pending" });
      if (prompt.includes("POLL_FORBIDDEN")) return json(202, { id: "vid_forbidden", polling_url: "/api/v1/videos/vid_forbidden", status: "pending" });
      if (prompt.includes("POLL_FOREIGN")) return json(202, { id: "vid_foreign", polling_url: "https://evil.example/poll", status: "pending" });
      return json(202, { id: "vid_1", polling_url: "/api/v1/videos/vid_1", status: "pending" });
    }
    if (url === "/api/v1/videos/vid_unknown") {
      state.unknownPolls++;
      return json(200, state.unknownPolls === 1 ? { status: "mystery" } : { status: "mystery", error: "exploded" });
    }
    if (url === "/api/v1/videos/vid_forbidden") return json(403, { error: { message: "key not allowed here", code: 403 } });
    if (url === "/api/v1/videos/vid_1") {
      state.pollCount++;
      if (state.pollCount === 1) return json(200, { status: "processing" });
      return json(200, { status: "completed", unsigned_urls: ["/api/v1/videos/vid_1/content?index=0"], usage: { cost: 1.17 } });
    }
    if (url.startsWith("/api/v1/videos/vid_1/content")) return new Response(new Blob([MP4]), { status: 200, headers: { "content-type": "video/mp4" } });
    return json(404, { error: { message: `no route ${url}` } });
  });
  return {
    seen,
    state,
    fal: (path) => seen.filter((s) => s.host !== "openrouter.ai" && !KIE_HOSTS.includes(s.host) && !APIMART_HOSTS.includes(s.host) && !REVANA_HOSTS.includes(s.host) && s.url === path),
    revana: (path) => seen.filter((s) => REVANA_HOSTS.includes(s.host) && s.url.split("?")[0] === path),
    apimart: (path) => seen.filter((s) => APIMART_HOSTS.includes(s.host) && s.url.split("?")[0] === path),
    kie: (path) => seen.filter((s) => KIE_HOSTS.includes(s.host) && s.url.split("?")[0] === path),
    calls: (url) => seen.filter((s) => s.url === url),
    last: (url) => seen.filter((s) => s.url === url).at(-1),
  };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll `cond` until it holds (default 5 s). */
export async function waitFor(cond: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    if (await cond()) return;
    if (Date.now() > until) throw new Error("timed out waiting for condition");
    await sleep(5);
  }
}

export const FAL_KEY = "test-fal-key";
export const FAL_CDN = "https://v3b.fal.media";

/**
 * fal's hosts: \`fal.run\` (sync images), \`queue.fal.run\` (video jobs: submit, status, result),
 * \`rest.fal.ai\` (upload initiate) + the presigned PUT, \`api.fal.ai\` (pricing = key test), and the
 * public CDN the results come from. Prompts containing FAL_FAIL make the job fail.
 */
function falRoute(u: URL, entry: Seen, state: MockOpenRouter["state"]): Response {
  const path = u.pathname;
  const keyed = ["fal.run", "queue.fal.run", "rest.fal.ai", "api.fal.ai"].includes(u.hostname);
  if (keyed && entry.auth !== `Key ${FAL_KEY}`) return json(401, { detail: "Invalid key" });
  if (u.hostname === "api.fal.ai" && path === "/v1/models/pricing") {
    return json(200, { prices: [{ endpoint_id: "fal-ai/flux/schnell", unit_price: 0.003, unit: "image", currency: "USD" }], next_cursor: null, has_more: false });
  }
  if (u.hostname === "fal.run") {
    if (String(entry.body?.prompt ?? "").includes("FAL_FAIL")) return json(422, { detail: [{ loc: ["body", "prompt"], msg: "prompt rejected", type: "value_error" }] });
    // Upscalers answer with the one image, generators with a list.
    if (path.includes("/upscale/")) return json(200, { image: { url: `${FAL_CDN}/files/out.png`, content_type: "image/png" } });
    return json(200, { images: [{ url: `${FAL_CDN}/files/out.png`, content_type: "image/png" }] });
  }
  if (u.hostname === "rest.fal.ai" && path === "/storage/upload/initiate") {
    state.uploads++;
    return json(200, { upload_url: `${FAL_CDN}/upload/presigned-${state.uploads}`, file_url: `${FAL_CDN}/files/ref-${state.uploads}.mp4` });
  }
  if (u.hostname === "queue.fal.run") {
    const app = path.split("/").slice(1, 3).join("/"); // owner/alias: status and result urls use only these
    const status = path.match(/\/requests\/([^/]+)\/status$/);
    if (status) {
      state.falPolls++;
      if (status[1] === "req_fail") return json(200, { status: "COMPLETED", error: "The reference video has no visible person", error_type: "validation" });
      return json(200, state.falPolls === 1 ? { status: "IN_PROGRESS", logs: [] } : { status: "COMPLETED", logs: [] });
    }
    if (/\/requests\/[^/]+\/cancel$/.test(path) && entry.method === "PUT") return json(202, { status: "CANCELLATION_REQUESTED" });
    const result = path.match(/\/requests\/([^/]+)$/);
    if (result && entry.method === "GET") return json(200, { video: { url: `${FAL_CDN}/files/out.mp4`, content_type: "video/mp4" } });
    if (entry.method === "POST") {
      const id = String(entry.body?.prompt ?? "").includes("FAL_FAIL") ? "req_fail" : "req_1";
      const base = `https://queue.fal.run/${app}/requests/${id}`;
      return json(200, { request_id: id, status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel`, queue_position: 0 });
    }
  }
  if (u.hostname === "v3b.fal.media") {
    if (entry.method === "PUT") return new Response(null, { status: 200 });
    if (path === "/files/out.png") return new Response(new Blob([PNG_2X2]), { status: 200, headers: { "content-type": "image/png" } });
    if (path === "/files/out.mp4") return new Response(new Blob([MP4]), { status: 200, headers: { "content-type": "video/mp4" } });
  }
  return json(404, { detail: `no fal route ${u.hostname}${path}` });
}

export const KIE_KEY = "test-kie-key";
export const KIE_CDN = "https://tempfile.aiquickdraw.com";
const KIE_HOSTS = ["api.kie.ai", "kieai.redpandaai.co", "tempfile.aiquickdraw.com"];

/**
 * kie.ai: \`api.kie.ai\` (createTask, recordInfo, chat/credit), \`kieai.redpandaai.co\` (uploads) and the
 * CDN the results come from. Every API answer is HTTP 200 with the outcome in \`code\`. A task is
 * \`generating\` on its first poll and \`success\` after; prompts containing KIE_FAIL make it fail, and
 * KIE_REJECT makes createTask refuse it.
 */
function kieRoute(u: URL, entry: Seen, state: MockOpenRouter["state"]): Response {
  const path = u.pathname;
  if (u.hostname !== "tempfile.aiquickdraw.com" && entry.auth !== `Bearer ${KIE_KEY}`) return json(200, { code: 401, msg: "Unauthorized - Authentication failed." });
  if (path === "/api/v1/chat/credit") return json(200, { code: 200, msg: "success", data: 1234.5 });
  if (path === "/api/v1/jobs/createTask") {
    const input = (entry.body?.input ?? {}) as Record<string, unknown>;
    const prompt = String(input.prompt ?? "");
    if (prompt.includes("KIE_REJECT")) return json(200, { code: 422, msg: "prompt is not allowed" });
    const taskId = prompt.includes("KIE_FAIL") ? "task_fail" : `task_${Object.keys(state.kieTasks).length + 1}`;
    state.kieTasks[taskId] = { model: String(entry.body?.model), polls: 0 };
    return json(200, { code: 200, msg: "success", data: { taskId } });
  }
  if (path === "/api/v1/jobs/recordInfo") {
    const taskId = u.searchParams.get("taskId") ?? "";
    const t = state.kieTasks[taskId];
    if (!t) return json(200, { code: 422, msg: "recordInfo is null" });
    t.polls++;
    if (taskId === "task_fail") return json(200, { code: 200, data: { taskId, state: "fail", failCode: "501", failMsg: "Content flagged by the provider" } });
    if (t.polls === 1) return json(200, { code: 200, data: { taskId, state: "generating" } });
    const file = /image|banana|z-image|kontext|crisp/.test(t.model) ? "out.png" : "out.mp4";
    return json(200, { code: 200, data: { taskId, model: t.model, state: "success", resultJson: JSON.stringify({ resultUrls: [`${KIE_CDN}/r/${file}`] }), creditsConsumed: 63 } });
  }
  if (u.hostname === "kieai.redpandaai.co") {
    state.kieUploads++;
    const ext = path === "/api/file-stream-upload" ? "mp4" : "png";
    return json(200, { success: true, code: 200, msg: "File uploaded successfully", data: { downloadUrl: `https://tempfile.redpandaai.co/higgsfree/up-${state.kieUploads}.${ext}` } });
  }
  if (path === "/r/out.png") return new Response(new Blob([PNG_2X2]), { status: 200, headers: { "content-type": "image/png" } });
  if (path === "/r/out.mp4") return new Response(new Blob([MP4]), { status: 200, headers: { "content-type": "video/mp4" } });
  return json(404, { error: `no kie route ${u.hostname}${path}` });
}

export const APIMART_KEY = "sk-test-apimart-key";
const APIMART_HOSTS = ["api.apimart.ai", "upload.apimart.ai"];

/**
 * APIMart: \`api.apimart.ai\` (generations, tasks, balance, image uploads) and \`upload.apimart.ai\` (inputs and
 * results). Errors are HTTP statuses with \`{ error: { message } }\`. A task is \`processing\` on its first poll and
 * \`completed\` after; prompts containing APIMART_FAIL make it fail, APIMART_REJECT makes the submit a 400.
 */
function apimartRoute(u: URL, entry: Seen, state: MockOpenRouter["state"]): Response {
  const path = u.pathname;
  if (u.hostname === "upload.apimart.ai") {
    if (path === "/f/video/out.mp4") return new Response(new Blob([MP4]), { status: 200, headers: { "content-type": "video/mp4" } });
    if (path === "/f/image/out.png") return new Response(new Blob([PNG_2X2]), { status: 200, headers: { "content-type": "image/png" } });
    return json(404, { error: "not found" });
  }
  if (entry.auth !== `Bearer ${APIMART_KEY}`) return json(401, { error: { code: "", message: "invalid API key (request id: x)", param: "", type: "apimart_error" } });
  if (path === "/v1/balance") return json(200, { success: true, remain_balance: 12.5, remain_credits: 125, used_balance: 1, used_credits: 10, unlimited_quota: false });
  if (path === "/v1/uploads/images") {
    state.apimartUploads++;
    return json(200, { url: `https://upload.apimart.ai/f/image/up-${state.apimartUploads}.png`, filename: "input.png", content_type: "image/png", bytes: 70 });
  }
  const gen = path.match(/^\/v1\/(videos|images)\/generations$/);
  if (gen && entry.method === "POST") {
    const prompt = String(entry.body?.prompt ?? "");
    if (prompt.includes("APIMART_REJECT")) return json(400, { error: { code: 400, message: "invalid size for this model", type: "invalid_request_error" } });
    const id = prompt.includes("APIMART_FAIL") ? "task_am_fail" : `task_am_${Object.keys(state.apimartTasks).length + 1}`;
    state.apimartTasks[id] = { kind: gen[1] ?? "videos", polls: 0 };
    return json(200, { code: 200, data: [{ status: "submitted", task_id: id }] });
  }
  const t = path.match(/^\/v1\/tasks\/([^/]+)$/);
  if (t) {
    const id = decodeURIComponent(t[1] ?? "");
    const task = state.apimartTasks[id];
    if (!task) return json(404, { error: { message: "task not found", type: "invalid_request_error" } });
    task.polls++;
    if (id === "task_am_fail") return json(200, { code: 200, data: { id, status: "failed", cost: 0, error: { code: "task_failed", message: "The input image cannot be accessed", type: "task_failed" } } });
    if (task.polls === 1) return json(200, { code: 200, data: { id, status: "processing", progress: 40 } });
    const result = task.kind === "images" ? { images: [{ url: ["https://upload.apimart.ai/f/image/out.png"], expires_at: 1 }] } : { videos: [{ url: ["https://upload.apimart.ai/f/video/out.mp4"], expires_at: 1 }] };
    return json(200, { code: 200, data: { id, status: "completed", progress: 100, cost: 0.42, credits_cost: 4.2, result } });
  }
  return json(404, { error: { message: `no APIMart route ${path}` } });
}

export const REVANA_KEY = "sr_live_test";
const REVANA_HOSTS = ["api.revana.si", "files.r2.cloudflarestorage.com"];

/**
 * Revana: \`api.revana.si\` (generations, uploads, balance, result content) and an R2 host the uploads are PUT to.
 * Errors are HTTP statuses with \`{ error: { code, message } }\`. A generation is \`running\` on its first poll and
 * \`succeeded\` after; prompts containing REVANA_FAIL make it fail, REVANA_REJECT makes the submit a 422.
 */
function revanaRoute(u: URL, entry: Seen, state: MockOpenRouter["state"]): Response {
  const path = u.pathname;
  if (u.hostname === "files.r2.cloudflarestorage.com") {
    // The presigned PUT: no key, the signed type header.
    if (entry.method !== "PUT" || entry.auth) return json(403, { error: "bad upload" });
    return new Response(null, { status: 200 });
  }
  if (entry.auth !== `Bearer ${REVANA_KEY}`) return json(401, { error: { code: "unauthorized", message: "Missing or invalid API key." } });
  if (path === "/v1/balance") return json(200, { object: "balance", currency: "usd", available_usd: 9.5, held_usd: 0.5, balance_usd: 10 });
  if (path === "/v1/uploads" && entry.method === "POST") {
    state.revanaUploads++;
    const n = state.revanaUploads;
    return json(201, {
      id: `upl_${n}`, object: "upload", url: `https://api.revana.si/v1/uploads/u/upl_${n}/input`, upload_method: "PUT",
      upload_url: `https://files.r2.cloudflarestorage.com/u/upl_${n}?sig=x`, upload_headers: { "Content-Type": String(entry.body?.content_type), "Content-Length": String(entry.body?.bytes) },
    });
  }
  if (path === "/v1/generations" && entry.method === "POST") {
    const input = (entry.body?.input ?? {}) as Record<string, unknown>;
    const prompt = String(input.prompt ?? "");
    if (prompt.includes("REVANA_REJECT")) return json(422, { error: { code: "invalid_input", message: "This model does not take 21:9." } });
    const id = prompt.includes("REVANA_FAIL") ? "gen_rv_fail" : `gen_rv_${Object.keys(state.revanaGenerations).length + 1}`;
    // A picture takes no duration and no video.
    state.revanaGenerations[id] = { polls: 0, image: !("duration" in input) && !("video_url" in input) };
    return json(201, { id, object: "generation", model: entry.body?.model, status: "queued", output: null, quoted_usd: 0.5, cost_usd: null, attempts: 0, error: null });
  }
  const content = path.match(/^\/v1\/generations\/([^/]+)\/content$/);
  if (content) {
    const gen = state.revanaGenerations[decodeURIComponent(content[1] ?? "")];
    if (!gen) return json(404, { error: { code: "not_found", message: "No generation with this id." } });
    return new Response(new Blob([gen.image ? PNG_2X2 : MP4]), { status: 200, headers: { "content-type": gen.image ? "image/png" : "video/mp4" } });
  }
  const g = path.match(/^\/v1\/generations\/([^/]+)$/);
  if (g) {
    const id = decodeURIComponent(g[1] ?? "");
    const gen = state.revanaGenerations[id];
    if (!gen) return json(404, { error: { code: "not_found", message: "No generation with this id." } });
    gen.polls++;
    if (id === "gen_rv_fail") return json(200, { id, status: "failed", output: null, cost_usd: 0, error: { code: "content_policy", message: "The model refused the prompt.", retryable: false } });
    if (gen.polls === 1) return json(200, { id, status: "running", output: null, cost_usd: null, error: null });
    return json(200, { id, status: "succeeded", output: { urls: [`https://api.revana.si/v1/generations/${id}/content`] }, cost_usd: 0.42, error: null });
  }
  return json(404, { error: { message: `no Revana route ${path}` } });
}
