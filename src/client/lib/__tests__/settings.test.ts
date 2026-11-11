/** The keys and the provider choice in localStorage, never leaked; uploads are sniffed, not trusted. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { BYTEDANCE_UNREADABLE } from "../bytedance";
import { getMediaBlob } from "../db/media";
import { resetLiveModels } from "../openrouter";
import { KEY_STORAGE, PROTECTED_STORAGE_KEYS } from "../settings";
import { clearAppStorage, writeJson } from "../storage";
import { PNG_2X2 } from "../../__tests__/mock-openrouter";

const KEY = "sk-or-v1-abcdefghijklmnopqrstuvwxyz0123";

// Model lookups refresh OpenRouter's public catalog; keep these tests offline (the curated catalog answers).
beforeEach(() => {
  resetLiveModels();
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("offline");
  });
});

describe("settings", () => {
  it("stores the key in localStorage and only ever shows it masked", async () => {
    expect(await api.getSettings()).toEqual({ hasKey: false, keys: {} });
    const saved = await api.updateSettings({ apiKey: ` ${KEY} ` });
    expect(saved).toMatchObject({ hasKey: true, keyMasked: "sk-or-v1-…0123" });
    expect(JSON.stringify(saved)).not.toContain("abcdefgh");
    expect(localStorage.getItem(KEY_STORAGE)).toBe(JSON.stringify(KEY));
    expect((await api.updateSettings({ apiKey: "" })).hasKey).toBe(false);
    expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
    await expect(api.getCredits()).rejects.toMatchObject({ status: 401 });
  });

  it("keeps each provider's key under its own name", async () => {
    const saved = await api.updateSettings({ keys: { kie: "kie-0123456789abcdef" } });
    expect(saved).toEqual({ hasKey: false, keys: { kie: "kie-01234…cdef" } });
    expect(localStorage.getItem("higgsfree.kieKey")).toBe(JSON.stringify("kie-0123456789abcdef"));
    expect(PROTECTED_STORAGE_KEYS).toContain("higgsfree.kieKey");
  });

  it("keeps a ByteDance key too; a key test the browser cannot read says what to check", async () => {
    const saved = await api.updateSettings({ keys: { bytedance: "ark-0123456789abcdef" } });
    expect(saved.keys).toEqual({ bytedance: "ark-01234…cdef" });
    expect(localStorage.getItem("higgsfree.bytedanceKey")).toBe(JSON.stringify("ark-0123456789abcdef"));
    expect(PROTECTED_STORAGE_KEYS).toContain("higgsfree.bytedanceKey");
    // fetch fails here, as it does in a browser for every ModelArk error (they carry no CORS headers).
    await expect(api.testProviderKey("bytedance")).rejects.toMatchObject({ status: 0, error: BYTEDANCE_UNREADABLE });
  });

  it("survives 'Reset local settings'", async () => {
    await api.updateSettings({ apiKey: KEY });
    writeJson("higgsfree.composer", { mode: "video" });
    clearAppStorage(PROTECTED_STORAGE_KEYS);
    expect(localStorage.getItem("higgsfree.composer")).toBeNull();
    expect(await api.getSettings()).toMatchObject({ hasKey: true });
  });
});

describe("upload", () => {
  it("sniffs the bytes: PNG is stored with its dimensions, anything else is refused", async () => {
    const png = await api.upload(new Blob([PNG_2X2], { type: "application/octet-stream" }));
    expect(png.media).toMatchObject({ mime: "image/png", bytes: PNG_2X2.length, width: 2, height: 2 });
    expect(png.media.id).toMatch(/^up_[A-Za-z0-9_-]{12}\.png$/);
    expect((await getMediaBlob(png.media.id))?.type).toBe("image/png");
    const pdf = new Blob([new TextEncoder().encode("%PDF-1.4 not an image")], { type: "image/png" }); // the declared type lies
    await expect(api.upload(pdf)).rejects.toMatchObject({ status: 400, error: expect.stringContaining("Unsupported file type") });
    const gif = new Blob([new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000")]);
    await expect(api.upload(gif)).rejects.toMatchObject({ status: 400 });
    await expect(api.upload(new Blob([]))).rejects.toMatchObject({ status: 400, error: "Empty file" });
    await expect(api.upload(new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]))).rejects.toMatchObject({ status: 413 });
  });
});
