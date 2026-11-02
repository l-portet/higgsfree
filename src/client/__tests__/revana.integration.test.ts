/**
 * Revana end to end against a mocked Revana (and the other providers): inputs uploaded (an upload link, then a PUT
 * without the key), the generation submitted, polled until it succeeds, the file read from its `/content` link with
 * the key and stored with what Revana charged; failures and the key test.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import * as api from "@/lib/api";
import { getMediaBlob } from "@/lib/db/media";
import { cancelAllJobs } from "@/lib/engine";
import { limits, timing } from "@/lib/engine/constants";
import { subscribeEvents } from "@/lib/live";
import { resetLiveModels } from "@/lib/openrouter";
import { setProviderKey } from "@/lib/settings";
import { installMockOpenRouter, PNG_2X2, REVANA_KEY, sleep, waitFor, type MockOpenRouter } from "./mock-openrouter";

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
const uploadImage = async (): Promise<string> => (await api.upload(new Blob([PNG_2X2], { type: "image/png" }))).media.id;

describe("Revana videos", () => {
  it("uploads the frame, submits the generation, polls it and stores the clip with what Revana charged", async () => {
    setProviderKey("revana", REVANA_KEY);
    const frame = await uploadImage();
    const g = (await api.generateVideo({ prompt: "a fox in the snow", model: "bytedance/seedance-2.0", duration: 5, resolution: "720p", firstFrame: frame, audio: false })).generations[0];
    expect(g).toMatchObject({ status: "running", provider: "revana", providerJobId: "gen_rv_1", params: { duration: 5, resolution: "720p", audio: false } });

    // The upload link is asked for with the key; the bytes go to the presigned url without it.
    expect(mock.revana("/v1/uploads")[0]).toMatchObject({ host: "api.revana.si", auth: `Bearer ${REVANA_KEY}`, body: { content_type: "image/png", bytes: PNG_2X2.length } });
    expect(mock.revana("/u/upl_1")[0]).toMatchObject({ method: "PUT", host: "files.r2.cloudflarestorage.com" });
    expect(mock.revana("/u/upl_1")[0]?.auth).toBeUndefined();
    expect(mock.revana("/v1/generations")[0]?.body).toEqual({
      model: "seedance-2.0",
      input: { prompt: "a fox in the snow", duration: 5, resolution: "720p", audio: false, image_url: "https://api.revana.si/v1/uploads/u/upl_1/input" },
    });

    await waitFor(() => latest(g?.id ?? "")?.status === "completed");
    const done = latest(g?.id ?? "");
    expect(done).toMatchObject({ costUsd: 0.42, provider: "revana" });
    // The result is read from its `/content` link, with the key.
    expect(mock.revana("/v1/generations/gen_rv_1/content")[0]?.auth).toBe(`Bearer ${REVANA_KEY}`);
    expect((await getMediaBlob(done?.output?.id ?? ""))?.size).toBeGreaterThan(0);
  });

  it("a failed generation ends with Revana's message", async () => {
    setProviderKey("revana", REVANA_KEY);
    const g = (await api.generateVideo({ prompt: "REVANA_FAIL", model: "minimax/hailuo-3", duration: 5 })).generations[0];
    await waitFor(() => latest(g?.id ?? "")?.status === "failed");
    expect(latest(g?.id ?? "")?.error).toContain("The model refused the prompt.");
  });
});

describe("Revana images", () => {
  it("runs Nano Banana Pro on Revana and stores the picture", async () => {
    setProviderKey("revana", REVANA_KEY);
    const [g] = (await api.generateImage({ prompt: "a red bicycle", model: "google/gemini-3-pro-image", aspectRatio: "16:9", size: "2K", count: 1 })).generations;
    await waitFor(() => latest(g?.id ?? "")?.status === "completed");
    expect(latest(g?.id ?? "")).toMatchObject({ provider: "revana", costUsd: 0.42 });
    expect(mock.revana("/v1/generations")[0]?.body).toEqual({ model: "nano-banana-pro", input: { prompt: "a red bicycle", resolution: "2K", aspect_ratio: "16:9" } });
  });
});

describe("Revana key", () => {
  it("the key test reads the available balance; a wrong key is refused", async () => {
    await expect(api.testProviderKey("revana", REVANA_KEY)).resolves.toEqual({ ok: true, balanceUsd: 9.5 });
    await expect(api.testProviderKey("revana", "sr_live_wrong")).rejects.toMatchObject({ status: 401, error: "Invalid Revana key" });
  });
});
