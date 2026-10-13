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
  auth?: string;
  body?: Record<string, unknown>;
}

export interface MockOpenRouter {
  seen: Seen[];
  state: { pollCount: number; unknownPolls: number; catalogDown: boolean };
  calls(url: string): Seen[];
  last(url: string): Seen | undefined;
}

const json = (status: number, payload: unknown): Response => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

/** Replace `fetch` for the current test (undone by `vi.unstubAllGlobals()` in the setup's afterEach). */
export function installMockOpenRouter(): MockOpenRouter {
  const seen: Seen[] = [];
  const state = { pollCount: 0, unknownPolls: 0, catalogDown: false };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw init.signal.reason;
    const u = new URL(input instanceof Request ? input.url : String(input));
    const url = u.pathname + u.search;
    const headers = new Headers(init?.headers);
    const raw = typeof init?.body === "string" ? init.body : undefined;
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    const entry: Seen = { method: init?.method ?? "GET", url };
    const auth = headers.get("authorization");
    if (auth) entry.auth = auth;
    if (body) entry.body = body;
    seen.push(entry);
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
