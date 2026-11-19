/**
 * Replicate end to end, through the app's real pass-through (`src/server/replicate-proxy.ts`) to a mocked Replicate
 * (and the other providers): the frame sent inline, the prediction created on the official model, polled until it
 * succeeds, the file read from Replicate's CDN by the browser without the key; an image run; failures (a failed
 * prediction, a refused input, a file off the CDN) and the key test.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Generation } from "@shared/types";
import * as api from "@/lib/api";
import { REPLICATE_NO_BALANCE_API } from "@/lib/balances";
import { getMediaBlob } from "@/lib/db/media";
import { cancelAllJobs } from "@/lib/engine";
import { limits, timing } from "@/lib/engine/constants";
import { subscribeEvents } from "@/lib/live";
import { resetLiveModels } from "@/lib/openrouter";
import { setProviderKey } from "@/lib/settings";
import { installMockOpenRouter, PNG_2X2, REPLICATE_FILES, REPLICATE_KEY, REPLICATE_OTHER_FILES, sleep, waitFor, type MockOpenRouter } from "./mock-openrouter";

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
const BEARER = `Bearer ${REPLICATE_KEY}`;
/** The calls as the browser makes them: to the pass-through on its own origin. */
const PROXY = "/api/replicate/v1";

describe("Replicate videos", () => {
  it("sends the frame inline, creates the prediction, polls it and stores the clip from Replicate's CDN", async () => {
    setProviderKey("replicate", REPLICATE_KEY);
    const frame = await uploadImage();
    const g = (await api.generateVideo({ prompt: "a fox in the snow", model: "runway/gen-4.5", duration: 10, aspectRatio: "9:16", firstFrame: frame })).generations[0];
    expect(g).toMatchObject({ status: "running", provider: "replicate", providerJobId: "prediction0001", params: { duration: 10, aspectRatio: "9:16" } });

    // The browser sends the key to its own origin only; the pass-through hands it to Replicate's API host.
    expect(mock.seen.filter((s) => s.auth === BEARER).map((s) => s.host)).toEqual(expect.arrayContaining(["localhost", "api.replicate.com"]));
    expect(mock.seen.filter((s) => s.auth === BEARER && !["localhost", "api.replicate.com"].includes(s.host))).toEqual([]);
    expect(mock.app(`${PROXY}/models/runwayml/gen-4.5/predictions`)).toEqual([expect.objectContaining({ method: "POST", auth: BEARER })]);
    const submit = mock.replicate("/v1/models/runwayml/gen-4.5/predictions")[0];
    expect(submit).toMatchObject({ method: "POST", host: "api.replicate.com", auth: BEARER });
    expect(submit?.body).toEqual({ input: { prompt: "a fox in the snow", duration: 10, aspect_ratio: "9:16", image: expect.stringMatching(/^data:image\/png;base64,/) } });

    await waitFor(() => latest(g?.id ?? "")?.status === "completed");
    const done = latest(g?.id ?? "");
    // Replicate's API does not say what a run cost.
    expect(done?.costUsd).toBeUndefined();
    expect(mock.app(`${PROXY}/predictions/prediction0001`).length).toBeGreaterThanOrEqual(2);
    // The file is read straight from the CDN, without the key and without the server.
    const file = mock.replicate("/xezq/prediction0001/out.mp4");
    expect(file).toEqual([expect.objectContaining({ method: "GET", host: new URL(REPLICATE_FILES).hostname })]);
    expect(file[0]?.auth).toBeUndefined();
    expect((await getMediaBlob(done?.output?.id ?? ""))?.size).toBeGreaterThan(0);
  });

  it("runs Kling 3.0 Pro on its Replicate model, with the tier in `mode`", async () => {
    setProviderKey("replicate", REPLICATE_KEY);
    const g = (await api.generateVideo({ prompt: "a red kite", model: "kwaivgi/kling-v3.0-pro", duration: 5, aspectRatio: "1:1", audio: false })).generations[0];
    expect(g).toMatchObject({ provider: "replicate", params: { duration: 5, aspectRatio: "1:1", audio: false } });
    expect(mock.replicate("/v1/models/kwaivgi/kling-v3-video/predictions")[0]?.body).toEqual({ input: { prompt: "a red kite", mode: "pro", duration: 5, aspect_ratio: "1:1", generate_audio: false } });
  });

  it("a failed prediction ends with Replicate's reason; a refused input is a 400 with what Replicate said", async () => {
    setProviderKey("replicate", REPLICATE_KEY);
    const g = (await api.generateVideo({ prompt: "REPLICATE_FAIL", model: "runway/gen-4.5", duration: 5, aspectRatio: "16:9" })).generations[0];
    await waitFor(() => latest(g?.id ?? "")?.status === "failed");
    expect(latest(g?.id ?? "")?.error).toContain("flagged as sensitive");

    await expect(api.generateVideo({ prompt: "REPLICATE_INVALID", model: "runway/gen-4.5", duration: 5, aspectRatio: "16:9" })).rejects.toMatchObject({
      status: 400,
      error: expect.stringContaining("aspect_ratio must be one of"),
    });
  });

  it("a file that is not on Replicate's CDN ends the run at once, with its link", async () => {
    setProviderKey("replicate", REPLICATE_KEY);
    const g = (await api.generateVideo({ prompt: "REPLICATE_BLOCKED", model: "runway/gen-4.5", duration: 5, aspectRatio: "16:9" })).generations[0];
    await waitFor(() => latest(g?.id ?? "")?.status === "failed");
    expect(latest(g?.id ?? "")?.error).toContain(`${REPLICATE_OTHER_FILES}/out/blocked.mp4`);
    // Never fetched, and not retried.
    await sleep(30);
    expect(mock.replicate("/out/blocked.mp4")).toHaveLength(0);
  });
});

describe("Replicate images", () => {
  it("runs an image as a prediction: references inline, the result's bytes stored", async () => {
    setProviderKey("replicate", REPLICATE_KEY);
    const ref = await uploadImage();
    const { generations } = await api.generateImage({ prompt: "make it night", model: "fal/flux-kontext-pro", aspectRatio: "16:9", size: "1K", count: 1, referenceImages: [ref] });
    const g = generations[0];
    await waitFor(() => latest(g?.id ?? "")?.status === "completed");
    expect(latest(g?.id ?? "")).toMatchObject({ provider: "replicate", status: "completed" });
    expect(mock.replicate("/v1/models/black-forest-labs/flux-kontext-pro/predictions")[0]?.body).toEqual({
      input: { prompt: "make it night", input_image: expect.stringMatching(/^data:image\/png;base64,/), aspect_ratio: "16:9" },
    });
    expect(mock.replicate("/xezq/prediction0001/out-0.png")[0]?.auth).toBeUndefined();
    expect((await getMediaBlob(latest(g?.id ?? "")?.output?.id ?? ""))?.size).toBeGreaterThan(0);
  });

  it("goes to Replicate when it is the cheapest with a key: Krea 2 Medium, against OpenRouter", async () => {
    setProviderKey("replicate", REPLICATE_KEY);
    setProviderKey("openrouter", "test-key");
    const { generations } = await api.generateImage({ prompt: "a lighthouse", model: "krea/krea-2-medium", aspectRatio: "1:1", size: "1K", count: 1 });
    await waitFor(() => latest(generations[0]?.id ?? "")?.status === "completed");
    expect(latest(generations[0]?.id ?? "")?.provider).toBe("replicate");
    expect(mock.replicate("/v1/models/krea/krea-2-medium/predictions")[0]?.body).toEqual({ input: { prompt: "a lighthouse", aspect_ratio: "1:1" } });
    expect(mock.calls("/api/v1/images/generations")).toHaveLength(0);
  });
});

describe("Replicate key", () => {
  it("the key test reads the account (free); a wrong key is refused; there is no balance to read", async () => {
    await expect(api.testProviderKey("replicate", REPLICATE_KEY)).resolves.toEqual({ ok: true });
    expect(mock.app(`${PROXY}/account`)).toHaveLength(1);
    expect(mock.replicate("/v1/account")[0]).toMatchObject({ host: "api.replicate.com", auth: BEARER });
    await expect(api.testProviderKey("replicate", "r8_wrong")).rejects.toMatchObject({ status: 401, error: "Invalid Replicate key" });

    setProviderKey("replicate", REPLICATE_KEY);
    const calls = mock.seen.length;
    expect((await api.getBalances(true)).replicate).toEqual({ ok: false, error: REPLICATE_NO_BALANCE_API });
    expect(mock.seen.length).toBe(calls);
  });
});
