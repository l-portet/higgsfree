/**
 * ByteDance end to end, through the app's real pass-through (`src/server/bytedance-proxy.ts`) to a mocked BytePlus
 * ModelArk (and the other providers): the frame sent inline, the task submitted, polled until it succeeds, the file
 * read from ModelArk's storage by the server without the key and stored with what the tokens cost; failures (a real
 * face, a model not activated, a file on a host the server does not fetch from) and the key test.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import * as api from "@/lib/api";
import { NO_BALANCE_API } from "@/lib/balances";
import { getMediaBlob } from "@/lib/db/media";
import { cancelAllJobs } from "@/lib/engine";
import { limits, timing } from "@/lib/engine/constants";
import { subscribeEvents } from "@/lib/live";
import { resetLiveModels } from "@/lib/openrouter";
import { setProviderKey } from "@/lib/settings";
import { BYTEDANCE_FILES, BYTEDANCE_KEY, BYTEDANCE_OTHER_FILES, installMockOpenRouter, KIE_KEY, PNG_2X2, sleep, waitFor, type MockOpenRouter } from "./mock-openrouter";

let mock: MockOpenRouter;
const received: Generation[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  mock = installMockOpenRouter();
  timing.pollIntervalMs = 5;
  limits.maxActiveJobs = 8;
  resetLiveModels();
  received.length = 0;
  unsubscribe = subscribeEvents((ev) => {
    if (ev.type === "generation") received.push(ev.generation);
  });
});

afterEach(async () => {
  unsubscribe();
  cancelAllJobs();
  await sleep(10);
});

const latest = (id: string): Generation | undefined => received.filter((g) => g.id === id).at(-1);
const TASKS = "/api/v3/contents/generations/tasks";
/** The same calls, as the browser makes them: to the pass-through on its own origin. */
const PROXY_TASKS = "/api/bytedance/v3/contents/generations/tasks";
const PROXY_MEDIA = "/api/bytedance/media";

/** A 640 × 480 PNG as far as its header says: ModelArk takes no image under 300 px a side. */
async function uploadFrame(): Promise<string> {
  const bytes = Uint8Array.from(PNG_2X2);
  new DataView(bytes.buffer).setUint32(16, 640);
  new DataView(bytes.buffer).setUint32(20, 480);
  return (await api.upload(new Blob([bytes], { type: "image/png" }))).media.id;
}

describe("ByteDance videos", () => {
  it("sends the frame inline, submits the task, polls it and stores the clip with what the tokens cost", async () => {
    setProviderKey("bytedance", BYTEDANCE_KEY);
    const frame = await uploadFrame();
    const g = (await api.generateVideo({ prompt: "a fox in the snow", model: "bytedance/seedance-2.0", duration: 5, resolution: "720p", aspectRatio: "16:9", firstFrame: frame, audio: false }))
      .generations[0];
    expect(g).toMatchObject({ status: "running", provider: "bytedance", providerJobId: "cgt-1", params: { duration: 5, resolution: "720p", audio: false } });

    // The browser sends the key to its own origin only; the pass-through hands it to ModelArk's API host.
    expect(mock.seen.filter((s) => s.auth === `Bearer ${BYTEDANCE_KEY}`).map((s) => s.host)).toEqual(expect.arrayContaining(["localhost", "ark.ap-southeast.bytepluses.com"]));
    expect(mock.seen.filter((s) => s.auth === `Bearer ${BYTEDANCE_KEY}` && !["localhost", "ark.ap-southeast.bytepluses.com"].includes(s.host))).toEqual([]);
    expect(mock.app(PROXY_TASKS).find((s) => s.method === "POST")).toMatchObject({ auth: `Bearer ${BYTEDANCE_KEY}` });
    const submit = mock.bytedance(TASKS).find((s) => s.method === "POST");
    expect(submit).toMatchObject({ host: "ark.ap-southeast.bytepluses.com", auth: `Bearer ${BYTEDANCE_KEY}` });
    expect(submit?.body).toEqual({
      model: "dreamina-seedance-2-0-260128",
      content: [
        { type: "text", text: "a fox in the snow" },
        { type: "image_url", image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) }, role: "first_frame" },
      ],
      resolution: "720p",
      duration: 5,
      generate_audio: false,
      watermark: false,
    });

    await waitFor(() => latest(g?.id ?? "")?.status === "completed");
    const done = latest(g?.id ?? "");
    // 108,900 tokens at Seedance 2.0's $7 per million.
    expect(done?.costUsd).toBeCloseTo(0.7623, 4);
    expect(mock.app(`${PROXY_TASKS}/cgt-1`).length).toBeGreaterThanOrEqual(2);
    // The file comes through the pass-through, which reads it from ModelArk's storage without the key.
    expect(mock.app(PROXY_MEDIA)).toEqual([expect.objectContaining({ method: "POST", body: { url: `${BYTEDANCE_FILES}/out/cgt-1.mp4?X-Tos-Signature=x` } })]);
    expect(mock.app(PROXY_MEDIA)[0]?.auth).toBeUndefined();
    const file = mock.bytedance("/out/cgt-1.mp4")[0];
    expect(file).toMatchObject({ host: new URL(BYTEDANCE_FILES).hostname });
    expect(file?.auth).toBeUndefined();
    expect((await getMediaBlob(done?.output?.id ?? ""))?.size).toBeGreaterThan(0);
  });

  it("goes to ByteDance when it is the cheapest with a key: Seedance 2.5 at 720p, against kie.ai", async () => {
    setProviderKey("bytedance", BYTEDANCE_KEY);
    setProviderKey("kie", KIE_KEY);
    const g = (await api.generateVideo({ prompt: "a red kite", model: "bytedance/seedance-2.5", duration: 5, resolution: "720p", aspectRatio: "21:9" })).generations[0];
    expect(g).toMatchObject({ provider: "bytedance", params: { aspectRatio: "21:9", audio: true } });
    expect(mock.bytedance(TASKS)[0]?.body).toMatchObject({ model: "dreamina-seedance-2-5-260628", ratio: "21:9", generate_audio: true });
    expect(mock.kie("/api/v1/jobs/createTask")).toHaveLength(0);
  });

  it("a failed task ends with what to do; a model that is not activated says where to activate it", async () => {
    setProviderKey("bytedance", BYTEDANCE_KEY);
    const g = (await api.generateVideo({ prompt: "BYTEDANCE_FAIL", model: "bytedance/seedance-2.0-mini", duration: 5, resolution: "480p", aspectRatio: "16:9" })).generations[0];
    await waitFor(() => latest(g?.id ?? "")?.status === "failed");
    expect(latest(g?.id ?? "")?.error).toContain("Seedance 2.x takes no real faces");

    await expect(api.generateVideo({ prompt: "BYTEDANCE_NOT_OPEN", model: "bytedance/seedance-2.0-fast", duration: 5, resolution: "480p", aspectRatio: "16:9" })).rejects.toMatchObject({
      status: 404,
      error: expect.stringContaining("https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement"),
    });
  });

  it("a video on a host the server does not fetch from ends the run at once, with its link and its cost", async () => {
    setProviderKey("bytedance", BYTEDANCE_KEY);
    const g = (await api.generateVideo({ prompt: "BYTEDANCE_BLOCKED", model: "bytedance/seedance-2.0-mini", duration: 5, resolution: "480p", aspectRatio: "16:9" })).generations[0];
    await waitFor(() => latest(g?.id ?? "")?.status === "failed");
    const failed = latest(g?.id ?? "");
    expect(failed?.error).toContain(`${BYTEDANCE_OTHER_FILES}/out/blocked.mp4?X-Tos-Signature=x`);
    expect(failed?.costUsd).toBeCloseTo(0.3812, 4);
    // Never fetched, and not retried.
    await sleep(30);
    expect(mock.bytedance("/out/blocked.mp4")).toHaveLength(0);
    expect(mock.app(PROXY_MEDIA)).toHaveLength(0);
  });
});

describe("ByteDance key", () => {
  it("the key test lists the key's tasks (free); a wrong key is refused; there is no balance to read", async () => {
    await expect(api.testProviderKey("bytedance", BYTEDANCE_KEY)).resolves.toEqual({ ok: true });
    expect(mock.app(PROXY_TASKS)[0]?.url).toBe(`${PROXY_TASKS}?page_size=1`);
    expect(mock.bytedance(TASKS)[0]?.url).toBe(`${TASKS}?page_size=1`);
    await expect(api.testProviderKey("bytedance", "ark-wrong")).rejects.toMatchObject({ status: 401, error: "Invalid ByteDance key" });

    setProviderKey("bytedance", BYTEDANCE_KEY);
    const calls = mock.seen.length;
    expect((await api.getBalances(true)).bytedance).toEqual({ ok: false, error: NO_BALANCE_API });
    expect(mock.seen.length).toBe(calls);
  });
});
